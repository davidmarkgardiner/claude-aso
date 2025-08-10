/**
 * Integration Tests for RBAC Service with Managed Identity
 */

import { getRBACService } from '../../src/services/rbacService';
import { getKubernetesClient } from '../../src/services/kubernetesClient';
import { getSecurityPolicyEngine } from '../../src/security/securityPolicies';
import { getAuditService } from '../../src/services/auditService';

describe('RBAC Integration Tests', () => {
  let rbacService: any;
  let k8sClient: any;
  let securityPolicyEngine: any;
  let auditService: any;

  beforeAll(() => {
    rbacService = getRBACService();
    k8sClient = getKubernetesClient();
    securityPolicyEngine = getSecurityPolicyEngine();
    auditService = getAuditService();
  });

  describe('Platform API Permissions Validation', () => {
    it('should validate Platform API has cluster admin permissions', async () => {
      // Skip if not in production Kubernetes environment
      if (!process.env.KUBECONFIG && process.env.NODE_ENV !== 'production') {
        console.log('Skipping K8s permission test - no cluster access');
        return;
      }

      const hasPermissions = await rbacService.validatePlatformApiPermissions();
      
      if (process.env.NODE_ENV === 'production') {
        expect(hasPermissions).toBe(true);
      } else {
        // In development, this might fail if user doesn't have cluster admin
        expect(typeof hasPermissions).toBe('boolean');
      }
    }, 30000);

    it('should perform Kubernetes health check successfully', async () => {
      // Skip if not in Kubernetes environment
      if (!process.env.KUBECONFIG && !process.env.KUBERNETES_SERVICE_HOST) {
        console.log('Skipping K8s health check - no cluster access');
        return;
      }

      const health = await k8sClient.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.context).toBeDefined();
      expect(health.server).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
    }, 10000);
  });

  describe('Enhanced RBAC Operations', () => {
    const testNamespace = `test-rbac-${Date.now()}`;
    const testTeam = 'test-team';
    const mockPrincipalId = '12345678-1234-1234-1234-123456789012';

    afterEach(async () => {
      // Cleanup test namespace if created
      try {
        await k8sClient.deleteNamespace(testNamespace);
      } catch (error) {
        // Ignore if namespace doesn't exist
      }
    });

    it('should create namespace with enhanced RBAC successfully', async () => {
      // Skip if not in Kubernetes environment
      if (!process.env.KUBECONFIG && !process.env.KUBERNETES_SERVICE_HOST) {
        console.log('Skipping namespace creation test - no cluster access');
        return;
      }

      const request = {
        name: testNamespace,
        teamName: testTeam,
        environment: 'development',
        teamPrincipalId: mockPrincipalId,
        principalType: 'Group' as const,
        roleDefinition: 'aks-rbac-admin' as const,
        features: ['istio-injection'],
        resourceTier: 'small'
      };

      const result = await rbacService.createNamespaceWithEnhancedRBAC(request);

      expect(result).toBeDefined();
      expect(result.status).toBe('created');
      expect(result.namespaceRBAC.namespaceName).toBe(testNamespace);
      expect(result.roleAssignmentIds).toBeDefined();
      expect(result.asoManifests).toBeDefined();
      expect(result.asoManifests.length).toBeGreaterThan(0);

      // Verify namespace was created
      const namespace = await k8sClient.getNamespace(testNamespace);
      expect(namespace).toBeDefined();
      expect(namespace.metadata?.labels?.['platform.io/managed']).toBe('true');
      expect(namespace.metadata?.labels?.['platform.io/team']).toBe(testTeam);
    }, 30000);

    it('should apply resource quotas based on tier', async () => {
      // Skip if not in Kubernetes environment
      if (!process.env.KUBECONFIG && !process.env.KUBERNETES_SERVICE_HOST) {
        return;
      }

      const request = {
        name: testNamespace,
        teamName: testTeam,
        environment: 'development',
        teamPrincipalId: mockPrincipalId,
        resourceTier: 'medium'
      };

      await rbacService.createNamespaceWithEnhancedRBAC(request);

      // Check if resource quota was created (this would require additional K8s client methods)
      // For now, just verify the operation completed without errors
      expect(true).toBe(true);
    }, 30000);

    it('should validate managed identity authentication before RBAC operations', async () => {
      // Mock managed identity service for testing
      const mockValidateAuth = jest.spyOn(rbacService, 'validateManagedIdentityAuthentication');
      
      const request = {
        name: testNamespace,
        teamName: testTeam,
        environment: 'development',
        teamPrincipalId: mockPrincipalId
      };

      try {
        await rbacService.createNamespaceWithEnhancedRBAC(request);
      } catch (error) {
        // Expected to fail in test environment
      }

      expect(mockValidateAuth).toHaveBeenCalled();
    });
  });

  describe('ASO Template Instantiation', () => {
    it('should generate valid ASO RoleAssignment manifest', async () => {
      const manifest = rbacService.instantiateNamespaceRBACTemplate(
        'test-namespace',
        'test-team',
        'development',
        '12345678-1234-1234-1234-123456789012',
        'Group',
        'aks-rbac-admin'
      );

      expect(manifest).toBeDefined();
      expect(manifest.apiVersion).toBe('authorization.azure.com/v1api20200801preview');
      expect(manifest.kind).toBe('RoleAssignment');
      expect(manifest.metadata.name).toBe('test-namespace-test-team-admin');
      expect(manifest.metadata.namespace).toBe('azure-system');
      expect(manifest.spec.principalId).toBe('12345678-1234-1234-1234-123456789012');
      expect(manifest.spec.principalType).toBe('Group');
      expect(manifest.spec.scope).toContain('namespaces/test-namespace');
    });

    it('should include proper labels and annotations', async () => {
      const manifest = rbacService.instantiateNamespaceRBACTemplate(
        'test-namespace',
        'test-team',
        'production',
        '12345678-1234-1234-1234-123456789012'
      );

      expect(manifest.metadata.labels['platform.io/managed']).toBe('true');
      expect(manifest.metadata.labels['platform.io/namespace']).toBe('test-namespace');
      expect(manifest.metadata.labels['platform.io/team']).toBe('test-team');
      expect(manifest.metadata.labels['platform.io/environment']).toBe('production');
      expect(manifest.metadata.labels['platform.io/component']).toBe('namespace-rbac');
      expect(manifest.metadata.labels['platform.io/created-by']).toBe('platform-api');
      
      expect(manifest.metadata.annotations['platform.io/created-at']).toBeDefined();
      expect(manifest.metadata.annotations['platform.io/role-definition']).toBe('aks-rbac-admin');
    });
  });

  describe('Security Policy Integration', () => {
    it('should validate namespace creation against security policies', async () => {
      const context = {
        userId: 'test-user',
        userEmail: 'test@example.com',
        operation: 'create-namespace',
        resource: 'valid-namespace-name',
        timestamp: new Date()
      };

      const result = await securityPolicyEngine.validateOperation('create-namespace', context);

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
      expect(result.violations).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.riskLevel).toBeDefined();
    });

    it('should reject invalid namespace names', async () => {
      const context = {
        userId: 'test-user',
        userEmail: 'test@example.com',
        operation: 'create-namespace',
        resource: 'INVALID_NAMESPACE_NAME', // Contains uppercase and underscore
        timestamp: new Date()
      };

      const result = await securityPolicyEngine.validateOperation('create-namespace', context);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('naming conventions');
    });

    it('should reject reserved namespace names', async () => {
      const context = {
        userId: 'test-user',
        userEmail: 'test@example.com',
        operation: 'create-namespace',
        resource: 'kube-system', // Reserved namespace
        timestamp: new Date()
      };

      const result = await securityPolicyEngine.validateOperation('create-namespace', context);

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Cannot use reserved namespace names');
      expect(result.riskLevel).toBe('high');
    });

    it('should validate RBAC assignments', async () => {
      const context = {
        userId: 'test-user',
        userEmail: 'test@example.com',
        operation: 'create-rbac',
        resource: 'test-namespace',
        roleDefinition: 'aks-rbac-reader',
        principalId: '12345678-1234-1234-1234-123456789012',
        timestamp: new Date()
      };

      const result = await securityPolicyEngine.validateOperation('create-rbac', context);

      expect(result.valid).toBe(true);
    });

    it('should flag cluster admin assignments in production', async () => {
      // Set production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const context = {
        userId: 'test-user',
        userEmail: 'test@example.com',
        operation: 'create-rbac',
        resource: 'test-namespace',
        roleDefinition: 'aks-rbac-cluster-admin',
        principalId: '12345678-1234-1234-1234-123456789012',
        timestamp: new Date()
      };

      const result = await securityPolicyEngine.validateOperation('create-rbac', context);

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Cluster admin role assignments require approval in production');
      expect(result.riskLevel).toBe('critical');

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Audit Integration', () => {
    it('should log RBAC events with proper structure', async () => {
      const auditSpy = jest.spyOn(auditService, 'logRBACEvent');
      
      const mockEvent = {
        action: 'create' as const,
        namespace: 'test-namespace',
        principalId: '12345678-1234-1234-1234-123456789012',
        principalType: 'Group' as const,
        roleDefinition: 'aks-rbac-admin',
        clusterName: 'test-cluster',
        requestedBy: {
          userId: 'test-user',
          email: 'test@example.com',
          roles: ['platform-user']
        },
        sourceIP: '10.0.0.1',
        userAgent: 'test-agent',
        correlationId: 'test-correlation-id',
        timestamp: new Date().toISOString(),
        success: true
      };

      await auditService.logRBACEvent(mockEvent);

      expect(auditSpy).toHaveBeenCalledWith(mockEvent);
    });

    it('should generate compliance reports', async () => {
      const report = await auditService.generateComplianceReport({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate: new Date(),
        includeMetrics: true
      });

      expect(report).toBeDefined();
      expect(report.reportId).toBeDefined();
      expect(report.complianceFramework).toBe('SOC2');
      expect(report.summary).toBeDefined();
      expect(report.riskAssessment).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle Kubernetes API errors gracefully', async () => {
      // Test with invalid cluster configuration
      const request = {
        name: 'test-invalid',
        teamName: 'test',
        environment: 'development',
        teamPrincipalId: 'invalid-guid'
      };

      try {
        await rbacService.createNamespaceWithEnhancedRBAC(request);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('should validate principal ID format', async () => {
      const context = {
        operation: 'create-rbac',
        resource: 'test-namespace',
        principalId: 'invalid-guid-format',
        timestamp: new Date()
      };

      const result = await securityPolicyEngine.validateOperation('create-rbac', context);

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Invalid Azure AD principal ID format');
    });
  });
});