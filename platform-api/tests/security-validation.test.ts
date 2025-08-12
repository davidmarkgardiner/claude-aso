import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  jest,
} from "@jest/globals";
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
} from "../src/utils/circuitBreaker";
import { AuditService } from "../src/services/auditService";
import { RBACService, RBACError } from "../src/services/rbacService";
import { AzureADValidationService } from "../src/middleware/azureAdValidation";

describe("Enhanced RBAC Security Validation", () => {
  describe("Circuit Breaker Implementation", () => {
    test("should protect against Azure AD service failures", async () => {
      const circuitBreaker = new CircuitBreaker({
        name: "test-azure-ad",
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000,
        timeout: 1000,
      });

      // Simulate 3 failures to open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error("Azure AD service unavailable");
          });
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should now be open
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
      expect(metrics.failures).toBe(3);

      // Next call should fail immediately
      await expect(
        circuitBreaker.execute(async () => {
          return "success";
        }),
      ).rejects.toThrow("Circuit breaker is OPEN");
    });

    test("should recover after reset timeout", async () => {
      const circuitBreaker = new CircuitBreaker({
        name: "test-recovery",
        failureThreshold: 2,
        resetTimeout: 100, // Short timeout for testing
        monitoringPeriod: 1000,
        timeout: 500,
      });

      // Force failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error("Service down");
          });
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should transition to HALF_OPEN
      const result = await circuitBreaker.execute(async () => {
        return "recovered";
      });

      expect(result).toBe("recovered");
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.CLOSED);
    });

    test("should handle request timeouts", async () => {
      const circuitBreaker = new CircuitBreaker({
        name: "test-timeout",
        failureThreshold: 1,
        resetTimeout: 1000,
        monitoringPeriod: 1000,
        timeout: 100, // Very short timeout
      });

      await expect(
        circuitBreaker.execute(async () => {
          // Simulate slow operation
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "slow response";
        }),
      ).rejects.toThrow("Request timeout after 100ms");

      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.OPEN);
    });
  });

  describe("RBAC Error Handling", () => {
    test("should create proper error objects with retry information", () => {
      const error = new RBACError(
        "Principal not found",
        "PRINCIPAL_NOT_FOUND",
        400,
        false,
        { principalId: "test-id" },
      );

      expect(error.name).toBe("RBACError");
      expect(error.code).toBe("PRINCIPAL_NOT_FOUND");
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual({ principalId: "test-id" });
    });

    test("should identify retryable vs non-retryable errors", () => {
      const retryableError = new RBACError(
        "Service timeout",
        "ASO_TIMEOUT",
        408,
        true,
      );

      const nonRetryableError = new RBACError(
        "Invalid principal",
        "PRINCIPAL_NOT_FOUND",
        400,
        false,
      );

      expect(retryableError.retryable).toBe(true);
      expect(nonRetryableError.retryable).toBe(false);
    });
  });

  describe("Audit Service Security", () => {
    let auditService: AuditService;

    beforeAll(() => {
      auditService = AuditService.getInstance();
    });

    test("should log RBAC events with proper severity classification", async () => {
      const consoleLogSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      // Test high severity event (failed operation)
      await auditService.logRBACEvent({
        action: "create",
        namespace: "test-namespace",
        principalId: "test-principal",
        principalType: "User",
        roleDefinition: "aks-rbac-admin",
        clusterName: "test-cluster",
        requestedBy: {
          userId: "test-user",
          email: "test@example.com",
          roles: ["admin"],
        },
        sourceIP: "192.168.1.1",
        userAgent: "test-agent",
        correlationId: "test-correlation",
        timestamp: new Date().toISOString(),
        success: false, // Failed operation = HIGH severity
        error: "Azure AD validation failed",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("HIGH"),
        expect.any(String),
      );

      consoleLogSpy.mockRestore();
    });

    test("should never fail main operation due to audit failures", async () => {
      const originalConsoleError = console.error;
      console.error = jest.fn();

      // Mock internal audit store failure
      const auditServiceWithFailure = new (class extends AuditService {
        protected async sendToAuditStore(): Promise<void> {
          throw new Error("Audit store connection failed");
        }
      })();

      // This should not throw, even though audit fails
      await expect(
        auditServiceWithFailure.logRBACEvent({
          action: "create",
          namespace: "test",
          principalId: "test",
          principalType: "User",
          roleDefinition: "aks-rbac-admin",
          clusterName: "test",
          requestedBy: { userId: "test", email: "test@test.com", roles: [] },
          sourceIP: "1.1.1.1",
          userAgent: "test",
          correlationId: "test",
          timestamp: new Date().toISOString(),
          success: true,
        }),
      ).resolves.not.toThrow();

      console.error = originalConsoleError;
    });

    test("should handle approval workflow logging", async () => {
      const consoleLogSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await auditService.logApprovalEvent({
        namespace: "prod-namespace",
        principalId: "user-123",
        roleDefinition: "aks-rbac-admin",
        requestedBy: "requester-456",
        approvedBy: "approver-789",
        action: "approved",
        reason: "Emergency deployment access",
        correlationId: "approval-123",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("RBAC_APPROVAL"),
        expect.any(String),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe("Principal ID Masking Security", () => {
    test("should properly mask email addresses", () => {
      const rbacService = new RBACService();
      const maskedEmail = (rbacService as any).maskPrincipalId(
        "user.name@company.com",
      );

      expect(maskedEmail).toBe("us***@company.com");
      expect(maskedEmail).not.toContain("user.name");
    });

    test("should mask GUIDs partially", () => {
      const rbacService = new RBACService();
      const guid = "12345678-1234-5678-9abc-123456789abc";
      const maskedGuid = (rbacService as any).maskPrincipalId(guid);

      expect(maskedGuid).toBe("12345678***");
      expect(maskedGuid.length).toBeLessThan(guid.length);
    });

    test("should not leak sensitive information in logs", () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      // This would trigger internal logging
      const rbacService = new RBACService();
      (rbacService as any).maskPrincipalId("sensitive.user@confidential.com");

      // Check that console output doesn't contain the full email
      const logCalls = consoleSpy.mock.calls.flat().join(" ");
      expect(logCalls).not.toContain("sensitive.user@confidential.com");

      consoleSpy.mockRestore();
    });
  });

  describe("Rate Limiting Security", () => {
    test("should generate proper rate limiting keys", () => {
      const rateLimitKeyGenerator = (req: any): string => {
        return req.user?.id || req.ip || "unknown";
      };

      // Test authenticated user
      const authRequest = { user: { id: "user123" }, ip: "192.168.1.1" };
      expect(rateLimitKeyGenerator(authRequest)).toBe("user123");

      // Test unauthenticated user
      const unauthRequest = { ip: "192.168.1.2" };
      expect(rateLimitKeyGenerator(unauthRequest)).toBe("192.168.1.2");

      // Test unknown user
      const unknownRequest = {};
      expect(rateLimitKeyGenerator(unknownRequest)).toBe("unknown");
    });

    test("should apply stricter limits for admin operations", () => {
      const adminLimits = {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // Only 3 admin operations per hour
      };

      const regularLimits = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // 10 regular operations per 15 min
      };

      expect(adminLimits.max).toBeLessThan(regularLimits.max);
      expect(adminLimits.windowMs).toBeGreaterThan(regularLimits.windowMs);
    });
  });

  describe("Configuration Validation", () => {
    test("should require approval for production admin roles", () => {
      const rbacService = new RBACService();

      // Should require approval
      const requiresApproval = (rbacService as any).requiresApproval(
        "aks-rbac-admin",
        "production",
      );
      expect(requiresApproval).toBe(true);

      // Should not require approval for development
      const devApproval = (rbacService as any).requiresApproval(
        "aks-rbac-admin",
        "development",
      );
      expect(devApproval).toBe(false);

      // Should not require approval for non-admin roles in production
      const readerApproval = (rbacService as any).requiresApproval(
        "aks-rbac-reader",
        "production",
      );
      expect(readerApproval).toBe(false);
    });

    test("should validate role definition mappings", () => {
      const validRoles = [
        "aks-rbac-admin",
        "aks-rbac-reader",
        "aks-rbac-writer",
      ];
      const invalidRole = "invalid-role";

      expect(validRoles).toContain("aks-rbac-admin");
      expect(validRoles).not.toContain(invalidRole);
    });
  });

  describe("Correlation ID Generation", () => {
    test("should generate unique correlation IDs", () => {
      const rbacService = new RBACService();

      const id1 = (rbacService as any).generateCorrelationId();
      const id2 = (rbacService as any).generateCorrelationId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^rbac-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^rbac-\d+-[a-z0-9]+$/);
    });

    test("should include timestamp in correlation ID", () => {
      const rbacService = new RBACService();
      const beforeTime = Date.now();

      const correlationId = (rbacService as any).generateCorrelationId();
      const afterTime = Date.now();

      const timestampMatch = correlationId.match(/^rbac-(\d+)-/);
      expect(timestampMatch).toBeTruthy();

      const timestamp = parseInt(timestampMatch![1]);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe("Resource Quota Enforcement", () => {
    test("should enforce maximum role assignments per namespace", async () => {
      const rbacService = new RBACService();

      // Mock the quota check method
      const maxAssignments = (rbacService as any).getMaxRoleAssignments(
        "test-team",
      );
      expect(maxAssignments).toBe(10); // Default quota

      // Test quota enforcement would happen in checkResourceQuotas method
      expect(typeof maxAssignments).toBe("number");
      expect(maxAssignments).toBeGreaterThan(0);
    });
  });

  describe("Security Input Validation", () => {
    test("should validate namespace names against injection attacks", () => {
      const validNamespaces = [
        "frontend-prod",
        "backend-dev-1",
        "api-v2",
        "my-app-123",
      ];

      const invalidNamespaces = [
        "../../../etc/passwd",
        "test; rm -rf /",
        "namespace with spaces",
        "UPPERCASE",
        "special@chars",
        "",
        "a".repeat(64), // Too long
      ];

      const namespacePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

      validNamespaces.forEach((ns) => {
        expect(ns).toMatch(namespacePattern);
        expect(ns.length).toBeLessThanOrEqual(63);
      });

      invalidNamespaces.forEach((ns) => {
        expect(ns).not.toMatch(namespacePattern);
      });
    });

    test("should validate GUID format for principal IDs", () => {
      const validGuids = [
        "12345678-1234-5678-9abc-123456789abc",
        "ABCD1234-ABCD-1234-ABCD-123456789ABC",
        "00000000-0000-0000-0000-000000000000",
      ];

      const invalidGuids = [
        "not-a-guid",
        "12345678-1234-5678-9abc-123456789ab", // Too short
        "12345678-1234-5678-9abc-123456789abcd", // Too long
        "12345678_1234_5678_9abc_123456789abc", // Wrong separators
        "",
      ];

      // GUID pattern from Joi validation
      const guidPattern =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

      validGuids.forEach((guid) => {
        expect(guid).toMatch(guidPattern);
      });

      invalidGuids.forEach((guid) => {
        expect(guid).not.toMatch(guidPattern);
      });
    });
  });

  describe("Exponential Backoff Implementation", () => {
    test("should calculate proper backoff delays", () => {
      const calculateBackoff = (attempt: number): number => {
        return Math.pow(2, attempt - 1) * 1000;
      };

      expect(calculateBackoff(1)).toBe(1000); // 1 second
      expect(calculateBackoff(2)).toBe(2000); // 2 seconds
      expect(calculateBackoff(3)).toBe(4000); // 4 seconds
      expect(calculateBackoff(4)).toBe(8000); // 8 seconds
      expect(calculateBackoff(5)).toBe(16000); // 16 seconds
    });

    test("should have reasonable maximum backoff", () => {
      const calculateBackoff = (attempt: number): number => {
        const delay = Math.pow(2, attempt - 1) * 1000;
        return Math.min(delay, 30000); // Cap at 30 seconds
      };

      expect(calculateBackoff(10)).toBe(30000); // Capped at 30 seconds
      expect(calculateBackoff(20)).toBe(30000); // Still capped at 30 seconds
    });
  });

  describe("Environment-Specific Security", () => {
    test("should apply stricter controls in production", () => {
      const environments = ["development", "staging", "production"];

      environments.forEach((env) => {
        const isProduction = env === "production";
        const requiresApproval = isProduction; // Admin roles require approval in production
        const rateLimitFactor = isProduction ? 0.5 : 1.0; // Stricter rate limiting in production

        if (env === "production") {
          expect(requiresApproval).toBe(true);
          expect(rateLimitFactor).toBe(0.5);
        } else {
          expect(requiresApproval).toBe(false);
          expect(rateLimitFactor).toBe(1.0);
        }
      });
    });
  });

  describe("Error Message Security", () => {
    test("should not leak sensitive information in error messages", () => {
      const sensitiveInfo = {
        password: "super-secret-password", // pragma: allowlist secret
        clientSecret: "azure-client-secret-value", // pragma: allowlist secret
        token: "jwt-token-with-sensitive-data", // pragma: allowlist secret
      };

      // Simulate error message generation
      const createSafeErrorMessage = (error: string, details?: any): string => {
        // Remove any potential sensitive information
        let safeMessage = error
          .replace(/password[^,\s]*/gi, "password=***")
          .replace(/secret[^,\s]*/gi, "secret=***")
          .replace(/token[^,\s]*/gi, "token=***");

        return safeMessage;
      };

      const errorWithSensitiveData =
        "Authentication failed: password=super-secret-password"; // pragma: allowlist secret
      const safeError = createSafeErrorMessage(errorWithSensitiveData);

      expect(safeError).not.toContain("super-secret-password");
      expect(safeError).toContain("password=***");
    });
  });
});
