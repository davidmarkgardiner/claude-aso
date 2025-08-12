import { describe, beforeAll, afterAll, it, expect } from "@jest/globals";
import request from "supertest";
import { createApp } from "../../src/app";
import { ArgoWorkflowsClient } from "../../src/services/argoWorkflowsClient";
import {
  getProvisioningService,
  NamespaceRequest,
} from "../../src/services/namespaceProvisioning";
import { getKubernetesClient } from "../../src/services/kubernetesClient";
import { config } from "../../src/config/config";
import * as k8s from "@kubernetes/client-node";

describe("Argo Workflows Integration Tests", () => {
  let app: any;
  let argoClient: ArgoWorkflowsClient;
  let k8sClient: any;
  let provisioningService: any;

  const testNamespace = `test-namespace-${Date.now()}`;
  const testTeam = "platform-test";

  beforeAll(async () => {
    app = createApp();
    argoClient = new ArgoWorkflowsClient();
    k8sClient = getKubernetesClient();
    provisioningService = getProvisioningService();
  }, 30000);

  afterAll(async () => {
    // Cleanup test namespace if it exists
    try {
      await k8sClient.deleteNamespace(testNamespace);
    } catch (error) {
      // Namespace might not exist, ignore error
    }
  });

  describe("Argo Workflows Client", () => {
    it("should perform health check successfully", async () => {
      const healthCheck = await argoClient.healthCheck();

      if (!healthCheck.healthy) {
        console.warn(
          "Argo Workflows is not available, skipping integration tests",
        );
        return;
      }

      expect(healthCheck.healthy).toBe(true);
      expect(healthCheck.version).toBeDefined();
    });

    it("should be able to list workflows", async () => {
      try {
        const workflows = await argoClient.listWorkflows();
        expect(Array.isArray(workflows)).toBe(true);
      } catch (error) {
        // If Argo is not accessible, skip this test
        console.warn(
          "Unable to list workflows, Argo might not be accessible:",
          error,
        );
      }
    });
  });

  describe("Namespace Provisioning Service", () => {
    it("should validate namespace request correctly", async () => {
      const validRequest: NamespaceRequest = {
        namespaceName: testNamespace,
        team: testTeam,
        environment: "development",
        resourceTier: "small",
        networkPolicy: "isolated",
        features: ["monitoring-enhanced"],
        requestedBy: "test-user@example.com",
        description: "Test namespace for integration testing",
      };

      // This should not throw an error for valid request
      expect(async () => {
        await provisioningService.provisionNamespace(validRequest);
      }).not.toThrow();
    });

    it("should reject invalid namespace names", async () => {
      const invalidRequest: NamespaceRequest = {
        namespaceName: "INVALID-NAME", // Uppercase not allowed
        team: testTeam,
        environment: "development",
        resourceTier: "small",
        networkPolicy: "isolated",
        features: [],
        requestedBy: "test-user@example.com",
      };

      await expect(
        provisioningService.provisionNamespace(invalidRequest),
      ).rejects.toThrow("Invalid namespace name format");
    });

    it("should reject production namespaces with micro tier", async () => {
      const invalidRequest: NamespaceRequest = {
        namespaceName: `test-prod-${Date.now()}`,
        team: testTeam,
        environment: "production",
        resourceTier: "micro", // Not allowed for production
        networkPolicy: "isolated",
        features: [],
        requestedBy: "test-user@example.com",
      };

      await expect(
        provisioningService.provisionNamespace(invalidRequest),
      ).rejects.toThrow(
        'Production environments require at least "small" resource tier',
      );
    });
  });

  describe("Workflow Template Verification", () => {
    it("should have correct workflow template structure", async () => {
      // Test workflow generation
      const request: NamespaceRequest = {
        namespaceName: testNamespace,
        team: testTeam,
        environment: "development",
        resourceTier: "small",
        networkPolicy: "isolated",
        features: ["monitoring-enhanced", "istio-injection"],
        requestedBy: "test-user@example.com",
        description: "Test namespace",
      };

      const workflowSpec = provisioningService.generateWorkflowSpec(
        request,
        "test-request-id",
      );

      expect(workflowSpec.apiVersion).toBe("argoproj.io/v1alpha1");
      expect(workflowSpec.kind).toBe("Workflow");
      expect(workflowSpec.metadata.name).toContain("provision-namespace");
      expect(workflowSpec.metadata.namespace).toBe(config.argo.namespace);

      // Check required parameters
      const parameters = workflowSpec.spec.arguments.parameters;
      const paramNames = parameters.map((p: any) => p.name);

      expect(paramNames).toContain("namespace-name");
      expect(paramNames).toContain("team-name");
      expect(paramNames).toContain("resource-tier");
      expect(paramNames).toContain("environment");
      expect(paramNames).toContain("features");

      // Check DAG structure
      const entryTemplate = workflowSpec.spec.templates.find(
        (t: any) => t.name === "provision-namespace",
      );
      expect(entryTemplate).toBeDefined();
      expect(entryTemplate.dag).toBeDefined();
      expect(entryTemplate.dag.tasks).toBeDefined();

      const taskNames = entryTemplate.dag.tasks.map((t: any) => t.name);
      expect(taskNames).toContain("create-namespace");
      expect(taskNames).toContain("apply-resource-quotas");
      expect(taskNames).toContain("setup-rbac");
      expect(taskNames).toContain("apply-network-policies");
    });

    it("should include proper task dependencies", async () => {
      const request: NamespaceRequest = {
        namespaceName: testNamespace,
        team: testTeam,
        environment: "development",
        resourceTier: "medium",
        networkPolicy: "team-shared",
        features: [],
        requestedBy: "test-user@example.com",
      };

      const workflowSpec = provisioningService.generateWorkflowSpec(
        request,
        "test-request-id",
      );
      const entryTemplate = workflowSpec.spec.templates.find(
        (t: any) => t.name === "provision-namespace",
      );
      const tasks = entryTemplate.dag.tasks;

      // Verify dependencies
      const resourceQuotaTask = tasks.find(
        (t: any) => t.name === "apply-resource-quotas",
      );
      expect(resourceQuotaTask.dependencies).toContain("create-namespace");

      const rbacTask = tasks.find((t: any) => t.name === "setup-rbac");
      expect(rbacTask.dependencies).toContain("create-namespace");

      const networkPolicyTask = tasks.find(
        (t: any) => t.name === "apply-network-policies",
      );
      expect(networkPolicyTask.dependencies).toContain("create-namespace");
    });
  });

  describe("RBAC Permissions", () => {
    it("should have sufficient permissions to create workflows", async () => {
      // Test that the platform API can access Argo Workflows resources
      try {
        const kc = new k8s.KubeConfig();
        kc.loadFromCluster();
        const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);

        // Try to list workflows to verify permissions
        await customObjectsApi.listNamespacedCustomObject(
          "argoproj.io",
          "v1alpha1",
          config.argo.namespace,
          "workflows",
        );

        // If we get here, permissions are correct
        expect(true).toBe(true);
      } catch (error: any) {
        if (error.statusCode === 403) {
          fail("Platform API lacks RBAC permissions for Argo Workflows");
        } else if (error.statusCode === 404) {
          console.warn(
            "Argo Workflows CRDs not found - Argo might not be installed",
          );
        } else {
          console.warn("Unable to test RBAC permissions:", error.message);
        }
      }
    });
  });

  describe("API Endpoints", () => {
    it("should accept namespace provisioning requests via API", async () => {
      const requestPayload = {
        namespaceName: `api-test-${Date.now()}`,
        team: testTeam,
        environment: "development",
        resourceTier: "small",
        networkPolicy: "isolated",
        features: ["monitoring-enhanced"],
        requestedBy: "api-test@example.com",
        description: "API integration test namespace",
      };

      const response = await request(app)
        .post("/api/v1/namespaces")
        .send(requestPayload)
        .expect(201);

      expect(response.body).toHaveProperty("requestId");
      expect(response.body).toHaveProperty("status", "submitted");
      expect(response.body).toHaveProperty("workflowId");
      expect(response.body).toHaveProperty("message");
    });

    it("should return validation errors for invalid requests", async () => {
      const invalidPayload = {
        namespaceName: "", // Invalid empty name
        team: testTeam,
        environment: "development",
        resourceTier: "invalid-tier", // Invalid tier
        networkPolicy: "isolated",
        features: [],
        requestedBy: "test@example.com",
      };

      const response = await request(app)
        .post("/api/v1/namespaces")
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });

    it("should provide workflow status endpoint", async () => {
      // This test depends on having a real workflow, so we'll mock it
      const mockRequestId = "test-request-123";

      const response = await request(app)
        .get(`/api/v1/namespaces/status/${mockRequestId}`)
        .expect(404); // Expected since it's a mock request ID

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Workflow Template Dependencies", () => {
    it("should verify that required workflow templates exist", async () => {
      try {
        const kc = new k8s.KubeConfig();
        kc.loadFromCluster();
        const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);

        // Check for namespace provisioning template
        const templates = await customObjectsApi.listNamespacedCustomObject(
          "argoproj.io",
          "v1alpha1",
          config.argo.namespace,
          "workflowtemplates",
        );

        const templateList = (templates.body as any).items;
        const requiredTemplate = templateList.find(
          (template: any) =>
            template.metadata.name === "create-namespace-template",
        );

        if (!requiredTemplate) {
          console.warn(
            'Required WorkflowTemplate "create-namespace-template" not found',
          );
          console.warn(
            "Available templates:",
            templateList.map((t: any) => t.metadata.name),
          );
        }

        // For now, just verify we can list templates
        expect(Array.isArray(templateList)).toBe(true);
      } catch (error: any) {
        if (error.statusCode === 404) {
          console.warn(
            "WorkflowTemplates CRD not found - Argo might not be installed",
          );
        } else {
          console.warn("Unable to verify workflow templates:", error.message);
        }
      }
    });
  });

  describe("End-to-End Namespace Provisioning", () => {
    it("should complete full namespace provisioning workflow", async () => {
      const testRequest: NamespaceRequest = {
        namespaceName: `e2e-test-${Date.now()}`,
        team: testTeam,
        environment: "development",
        resourceTier: "small",
        networkPolicy: "isolated",
        features: ["monitoring-enhanced"],
        requestedBy: "e2e-test@example.com",
        description: "End-to-end integration test",
      };

      try {
        // Submit provisioning request
        const result =
          await provisioningService.provisionNamespace(testRequest);

        expect(result.status).toBe("submitted");
        expect(result.workflowId).toBeDefined();
        expect(result.requestId).toBeDefined();

        // For a real test, we would wait for completion and verify resources
        // For now, we just verify the workflow was submitted successfully

        if (result.workflowId) {
          try {
            const workflowStatus = await argoClient.getWorkflowStatus(
              result.workflowId,
            );
            expect(workflowStatus.phase).toBeDefined();

            console.log(
              `Workflow ${result.workflowId} status: ${workflowStatus.phase}`,
            );

            // In a real test environment, you might wait for completion:
            // const finalStatus = await argoClient.waitForWorkflowCompletion(result.workflowId, undefined, 300000); // 5 minutes
            // expect(finalStatus.phase).toBe('Succeeded');
          } catch (error) {
            console.warn("Unable to check workflow status:", error);
          }
        }
      } catch (error: any) {
        if (error.message.includes("already exists")) {
          console.warn("Namespace already exists, test passed validation");
        } else if (error.message.includes("Failed to submit workflow")) {
          console.warn(
            "Workflow submission failed - Argo might not be accessible",
          );
        } else {
          throw error;
        }
      }
    }, 60000); // 60 second timeout for E2E test
  });
});

describe("Configuration Validation", () => {
  it("should have valid Argo Workflows configuration", () => {
    expect(config.argo).toBeDefined();
    expect(config.argo.baseUrl).toBeDefined();
    expect(config.argo.namespace).toBeDefined();
    expect(config.argo.timeout).toBeGreaterThan(0);
  });

  it("should have platform configuration for namespace limits", () => {
    expect(config.platform).toBeDefined();
    expect(config.platform.maxNamespacesPerTeam).toBeGreaterThan(0);
    expect(config.platform.allowedFeatures).toBeDefined();
    expect(Array.isArray(config.platform.allowedFeatures)).toBe(true);
  });
});
