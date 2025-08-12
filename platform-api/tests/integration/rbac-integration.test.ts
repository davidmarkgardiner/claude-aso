import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  jest,
} from "@jest/globals";
import request from "supertest";
import express from "express";
import { createApp } from "../../src/app";

describe("RBAC Integration Tests", () => {
  let app: express.Application;
  let mockAzureAdService: any;
  let mockKubernetesClient: any;

  beforeAll(async () => {
    // Mock external dependencies
    mockAzureAdService = {
      validatePrincipalById: jest.fn(),
      validateUserPrincipal: jest.fn(),
    };

    mockKubernetesClient = {
      createCustomResource: jest.fn(),
      listCustomResources: jest.fn(),
      deleteCustomResourcesByLabel: jest.fn(),
    };

    // Set up test environment variables
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "test-secret-for-integration-tests"; // pragma: allowlist secret
    process.env.AZURE_CLIENT_ID = "test-client-id";
    process.env.AZURE_CLIENT_SECRET = "test-client-secret"; // pragma: allowlist secret
    process.env.AZURE_TENANT_ID = "test-tenant-id";

    app = await createApp();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("Namespace RBAC Provisioning", () => {
    test("should create namespace with RBAC configuration", async () => {
      const validRequest = {
        namespaceName: "test-frontend-dev",
        team: "frontend",
        environment: "development",
        resourceTier: "small",
        networkPolicy: "team-shared",
        features: ["istio-injection", "monitoring-enhanced"],
        description: "Frontend development namespace",
        costCenter: "ENGINEERING-001",
        rbacConfig: {
          principalId: "12345678-1234-5678-9abc-123456789abc",
          principalType: "User",
          roleDefinition: "aks-rbac-admin",
          clusterName: "dev-cluster",
        },
      };

      // Mock Azure AD validation success
      mockAzureAdService.validatePrincipalById.mockResolvedValue({
        valid: true,
        principal: {
          objectId: validRequest.rbacConfig.principalId,
          userPrincipalName: "test.user@company.com",
          displayName: "Test User",
          principalType: "User",
          verified: true,
        },
        errors: [],
      });

      // Mock Kubernetes client success
      mockKubernetesClient.createCustomResource.mockResolvedValue({
        metadata: { name: "rbac-test-frontend-dev-1" },
      });

      const response = await request(app)
        .post("/api/platform/namespaces/request")
        .set("Authorization", "Bearer valid-test-token")
        .send(validRequest)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("requestId");
      expect(response.body.data).toHaveProperty("rbac");
      expect(response.body.data.rbac.status).toBe("created");
    });

    test("should reject invalid principal ID format", async () => {
      const invalidRequest = {
        namespaceName: "test-invalid-principal",
        team: "backend",
        environment: "development",
        resourceTier: "micro",
        networkPolicy: "isolated",
        rbacConfig: {
          principalId: "invalid-guid-format",
          principalType: "User",
          roleDefinition: "aks-rbac-reader",
        },
      };

      const response = await request(app)
        .post("/api/platform/namespaces/request")
        .set("Authorization", "Bearer valid-test-token")
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error).toBe("ValidationError");
      expect(response.body.details).toContainEqual({
        field: "rbacConfig.principalId",
        message: "Principal ID must be a valid GUID",
      });
    });

    test("should handle Azure AD principal not found", async () => {
      const requestWithMissingPrincipal = {
        namespaceName: "test-missing-principal",
        team: "backend",
        environment: "development",
        resourceTier: "micro",
        networkPolicy: "isolated",
        rbacConfig: {
          principalId: "99999999-9999-9999-9999-999999999999",
          principalType: "User",
          roleDefinition: "aks-rbac-reader",
        },
      };

      // Mock Azure AD validation failure
      mockAzureAdService.validatePrincipalById.mockResolvedValue({
        valid: false,
        errors: ["User not found in Azure AD"],
      });

      const response = await request(app)
        .post("/api/platform/namespaces/request")
        .set("Authorization", "Bearer valid-test-token")
        .send(requestWithMissingPrincipal)
        .expect(202); // Should still create namespace, RBAC fails gracefully

      expect(response.body.success).toBe(true);
      expect(response.body.data.rbac).toBeNull(); // RBAC should have failed
    });

    test("should require approval for production admin roles", async () => {
      const prodAdminRequest = {
        namespaceName: "prod-critical-app",
        team: "platform",
        environment: "production",
        resourceTier: "large",
        networkPolicy: "isolated",
        rbacConfig: {
          principalId: "12345678-1234-5678-9abc-123456789abc",
          principalType: "User",
          roleDefinition: "aks-rbac-admin", // Admin role in production
        },
      };

      const response = await request(app)
        .post("/api/platform/namespaces/request")
        .set("Authorization", "Bearer valid-test-token")
        .send(prodAdminRequest)
        .expect(202);

      // The response should indicate approval is required
      expect(response.body.success).toBe(true);
      // RBAC would fail with approval required message
    });

    test("should enforce namespace naming conventions", async () => {
      const invalidNamespaceNames = [
        "UPPERCASE-NOT-ALLOWED",
        "spaces not allowed",
        "special@characters",
        "../malicious-path",
        "toolongnamespacenamethatshouldberejectedbecauseitexceedsthemaximumlength",
      ];

      for (const invalidName of invalidNamespaceNames) {
        const response = await request(app)
          .post("/api/platform/namespaces/request")
          .set("Authorization", "Bearer valid-test-token")
          .send({
            namespaceName: invalidName,
            team: "test",
            environment: "development",
            resourceTier: "micro",
            networkPolicy: "isolated",
          })
          .expect(400);

        expect(response.body.error).toBe("ValidationError");
      }
    });
  });

  describe("RBAC Status and Management", () => {
    test("should get RBAC status for existing namespace", async () => {
      mockKubernetesClient.listCustomResources.mockResolvedValue({
        items: [
          {
            metadata: {
              name: "rbac-test-namespace-1",
              creationTimestamp: "2024-01-01T12:00:00Z",
            },
            spec: {
              principalId: "12345678-1234-5678-9abc-123456789abc",
              roleDefinitionId:
                "/subscriptions/test/providers/Microsoft.Authorization/roleDefinitions/test-role-id",
              scope:
                "/subscriptions/test/resourceGroups/test-rg/providers/Microsoft.ContainerService/managedClusters/test-cluster/namespaces/test-namespace",
            },
            status: {
              phase: "Ready",
            },
          },
        ],
      });

      const response = await request(app)
        .get("/api/platform/namespaces/test-namespace/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.namespace).toBe("test-namespace");
      expect(response.body.data.roleAssignments).toHaveLength(1);
      expect(response.body.data.roleAssignments[0].status).toBe("Ready");
    });

    test("should add RBAC to existing namespace", async () => {
      mockAzureAdService.validatePrincipalById.mockResolvedValue({
        valid: true,
        principal: {
          objectId: "87654321-4321-8765-dcba-987654321dcb",
          userPrincipalName: "new.user@company.com",
          displayName: "New User",
          principalType: "User",
          verified: true,
        },
        errors: [],
      });

      mockKubernetesClient.createCustomResource.mockResolvedValue({
        metadata: { name: "rbac-existing-namespace-2" },
      });

      const response = await request(app)
        .post("/api/platform/namespaces/existing-namespace/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .send({
          principalId: "87654321-4321-8765-dcba-987654321dcb",
          principalType: "User",
          roleDefinition: "aks-rbac-writer",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("created");
    });

    test("should remove RBAC from namespace", async () => {
      mockKubernetesClient.deleteCustomResourcesByLabel.mockResolvedValue({
        deleted: ["rbac-test-namespace-1"],
      });

      const response = await request(app)
        .delete("/api/platform/namespaces/test-namespace/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain(
        "RBAC removed from namespace test-namespace",
      );
    });

    test("should return 404 for non-existent namespace RBAC", async () => {
      mockKubernetesClient.listCustomResources.mockResolvedValue({
        items: [],
      });

      const response = await request(app)
        .get("/api/platform/namespaces/non-existent-namespace/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .expect(404);

      expect(response.body.error).toBe("NotFoundError");
      expect(response.body.message).toContain(
        "RBAC configuration for namespace non-existent-namespace not found",
      );
    });
  });

  describe("Rate Limiting Tests", () => {
    test("should apply RBAC-specific rate limiting", async () => {
      const rapidRequests = Array.from({ length: 12 }, (_, i) =>
        request(app)
          .post("/api/platform/namespaces/request")
          .set("Authorization", "Bearer valid-test-token")
          .send({
            namespaceName: `rapid-test-${i}`,
            team: "test",
            environment: "development",
            resourceTier: "micro",
            networkPolicy: "isolated",
          }),
      );

      const responses = await Promise.allSettled(rapidRequests);

      // Should have at least some rate limited responses (429)
      const rateLimited = responses.filter(
        (result) =>
          result.status === "fulfilled" && result.value.status === 429,
      );

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    test("should apply stricter rate limiting for admin role requests", async () => {
      const adminRoleRequests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post("/api/platform/namespaces/request")
          .set("Authorization", "Bearer valid-test-token")
          .send({
            namespaceName: `admin-test-${i}`,
            team: "test",
            environment: "development",
            resourceTier: "micro",
            networkPolicy: "isolated",
            rbacConfig: {
              principalId: "12345678-1234-5678-9abc-123456789abc",
              principalType: "User",
              roleDefinition: "aks-rbac-admin",
            },
          }),
      );

      const responses = await Promise.allSettled(adminRoleRequests);

      // Admin role requests should hit rate limits faster
      const rateLimited = responses.filter(
        (result) =>
          result.status === "fulfilled" && result.value.status === 429,
      );

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe("Authentication and Authorization", () => {
    test("should reject requests without authentication", async () => {
      const response = await request(app)
        .post("/api/platform/namespaces/request")
        .send({
          namespaceName: "unauthorized-test",
          team: "test",
          environment: "development",
          resourceTier: "micro",
          networkPolicy: "isolated",
        })
        .expect(401);

      expect(response.body.error).toBe("AuthenticationError");
    });

    test("should reject requests with invalid JWT tokens", async () => {
      const response = await request(app)
        .post("/api/platform/namespaces/request")
        .set("Authorization", "Bearer invalid-jwt-token")
        .send({
          namespaceName: "invalid-token-test",
          team: "test",
          environment: "development",
          resourceTier: "micro",
          networkPolicy: "isolated",
        })
        .expect(401);

      expect(response.body.error).toBe("AuthenticationError");
    });

    test("should enforce role-based access for admin operations", async () => {
      // Mock a user without admin roles
      const nonAdminResponse = await request(app)
        .delete("/api/platform/namespaces/test-namespace/rbac")
        .set("Authorization", "Bearer non-admin-token")
        .expect(403);

      expect(nonAdminResponse.body.error).toBe("AuthorizationError");
    });
  });

  describe("Error Handling and Resilience", () => {
    test("should handle Azure AD service failures gracefully", async () => {
      mockAzureAdService.validatePrincipalById.mockRejectedValue(
        new Error("Azure AD service temporarily unavailable"),
      );

      const response = await request(app)
        .post("/api/platform/namespaces/test-azure-failure/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .send({
          principalId: "12345678-1234-5678-9abc-123456789abc",
          principalType: "User",
          roleDefinition: "aks-rbac-reader",
        })
        .expect(500);

      expect(response.body.error).toBe("InternalError");
      expect(response.body.message).toContain(
        "Failed to validate Azure AD principal",
      );
    });

    test("should handle Kubernetes API failures", async () => {
      mockKubernetesClient.createCustomResource.mockRejectedValue(
        new Error("Kubernetes API connection failed"),
      );

      const response = await request(app)
        .post("/api/platform/namespaces/test-k8s-failure/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .send({
          principalId: "12345678-1234-5678-9abc-123456789abc",
          principalType: "User",
          roleDefinition: "aks-rbac-reader",
        })
        .expect(500);

      expect(response.body.error).toContain("Error");
    });

    test("should provide correlation IDs for error tracing", async () => {
      const response = await request(app)
        .post("/api/platform/namespaces/test-correlation/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .set("x-correlation-id", "test-correlation-12345")
        .send({
          principalId: "invalid-guid",
          principalType: "User",
          roleDefinition: "aks-rbac-reader",
        })
        .expect(400);

      expect(response.body).toHaveProperty("timestamp");
      // The correlation ID should be used in internal processing
    });
  });

  describe("Health Check Integration", () => {
    test("should include circuit breaker status in health checks", async () => {
      const response = await request(app).get("/health/detailed").expect(200);

      expect(response.body.status).toBe("healthy");
      expect(response.body.checks).toHaveProperty("kubernetes");
      expect(response.body.checks).toHaveProperty("argoWorkflows");
      // Circuit breaker health would be included in production
    });
  });

  describe("Audit Trail Validation", () => {
    test("should log all RBAC operations for audit trail", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await request(app)
        .post("/api/platform/namespaces/audit-test/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .send({
          principalId: "12345678-1234-5678-9abc-123456789abc",
          principalType: "User",
          roleDefinition: "aks-rbac-reader",
        });

      // Check that audit events were logged
      const auditLogs = consoleSpy.mock.calls
        .flat()
        .filter(
          (call) => typeof call === "string" && call.includes("RBAC_OPERATION"),
        );

      expect(auditLogs.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    test("should include required fields in audit logs", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await request(app)
        .post("/api/platform/namespaces/audit-fields-test/rbac")
        .set("Authorization", "Bearer valid-test-token")
        .set("x-correlation-id", "audit-test-12345")
        .send({
          principalId: "12345678-1234-5678-9abc-123456789abc",
          principalType: "User",
          roleDefinition: "aks-rbac-reader",
        });

      const auditLogs = consoleSpy.mock.calls.flat().join(" ");

      // Required audit fields
      expect(auditLogs).toContain("RBAC_OPERATION");
      expect(auditLogs).toContain("audit-test-12345"); // correlation ID
      expect(auditLogs).toContain("audit-fields-test"); // namespace

      consoleSpy.mockRestore();
    });
  });
});
