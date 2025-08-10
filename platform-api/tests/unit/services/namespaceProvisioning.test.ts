import { NamespaceProvisioningService } from '../../../src/services/namespaceProvisioning';
import { KubernetesClient } from '../../../src/services/kubernetesClient';
import { ArgoWorkflowsClient } from '../../../src/services/argoWorkflowsClient';
import { NamespaceRequest, ResourceTier } from '../../../src/types/namespace';

// Mock the external services
jest.mock('../../../src/services/kubernetesClient');
jest.mock('../../../src/services/argoWorkflowsClient');

describe('NamespaceProvisioningService', () => {
  let service: NamespaceProvisioningService;
  let mockKubernetesClient: jest.Mocked<KubernetesClient>;
  let mockArgoClient: jest.Mocked<ArgoWorkflowsClient>;

  beforeEach(() => {
    mockKubernetesClient = new KubernetesClient() as jest.Mocked<KubernetesClient>;
    mockArgoClient = new ArgoWorkflowsClient() as jest.Mocked<ArgoWorkflowsClient>;
    service = new NamespaceProvisioningService(mockKubernetesClient, mockArgoClient);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('provisionNamespace', () => {
    const validRequest: NamespaceRequest = {
      namespaceName: 'test-app-dev',
      team: 'frontend',
      environment: 'development',
      resourceTier: 'small' as ResourceTier,
      networkPolicy: 'isolated',
      features: ['istio-injection', 'monitoring-enhanced'],
      description: 'Test namespace for development',
      owner: {
        id: 'user-123',
        email: 'test@company.com',
        name: 'Test User'
      }
    };

    it('should successfully provision a namespace', async () => {
      // Arrange
      mockKubernetesClient.namespaceExists.mockResolvedValue(false);
      mockArgoClient.submitWorkflow.mockResolvedValue({
        metadata: { name: 'workflow-123' },
        status: { phase: 'Running' }
      });

      // Act
      const result = await service.provisionNamespace(validRequest);

      // Assert
      expect(result).toBeDefined();
      expect(result.requestId).toBeValidUUID();
      expect(result.status).toBe('pending');
      expect(result.workflowName).toBe('workflow-123');
      
      expect(mockKubernetesClient.namespaceExists).toHaveBeenCalledWith('test-app-dev');
      expect(mockArgoClient.submitWorkflow).toHaveBeenCalled();
    });

    it('should reject request for existing namespace', async () => {
      // Arrange
      mockKubernetesClient.namespaceExists.mockResolvedValue(true);

      // Act & Assert
      await expect(service.provisionNamespace(validRequest)).rejects.toThrow(
        'Namespace test-app-dev already exists'
      );

      expect(mockKubernetesClient.namespaceExists).toHaveBeenCalledWith('test-app-dev');
      expect(mockArgoClient.submitWorkflow).not.toHaveBeenCalled();
    });

    it('should validate namespace name format', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        namespaceName: 'Invalid_Name_123!'
      };

      // Act & Assert
      await expect(service.provisionNamespace(invalidRequest)).rejects.toThrow(
        'Invalid namespace name format'
      );
    });

    it('should validate resource tier', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        resourceTier: 'invalid-tier' as ResourceTier
      };

      // Act & Assert
      await expect(service.provisionNamespace(invalidRequest)).rejects.toThrow(
        'Invalid resource tier: invalid-tier'
      );
    });

    it('should handle workflow submission failures', async () => {
      // Arrange
      mockKubernetesClient.namespaceExists.mockResolvedValue(false);
      mockArgoClient.submitWorkflow.mockRejectedValue(new Error('Workflow submission failed'));

      // Act & Assert
      await expect(service.provisionNamespace(validRequest)).rejects.toThrow(
        'Failed to submit provisioning workflow: Workflow submission failed'
      );
    });
  });

  describe('getProvisioningStatus', () => {
    it('should return status for existing request', async () => {
      // Arrange
      const requestId = 'req-123';
      mockArgoClient.getWorkflowStatus.mockResolvedValue({
        metadata: { name: 'workflow-123' },
        status: { 
          phase: 'Succeeded',
          finishedAt: '2023-01-01T12:00:00Z'
        }
      });

      // Mock internal storage (in real implementation, this would be database)
      service['activeRequests'].set(requestId, {
        requestId,
        namespaceName: 'test-app-dev',
        workflowName: 'workflow-123',
        status: 'provisioning',
        createdAt: '2023-01-01T11:00:00Z'
      });

      // Act
      const status = await service.getProvisioningStatus(requestId);

      // Assert
      expect(status).toBeDefined();
      expect(status.requestId).toBe(requestId);
      expect(status.status).toBe('completed');
      expect(status.workflowStatus?.phase).toBe('Succeeded');
    });

    it('should return null for non-existent request', async () => {
      // Act
      const status = await service.getProvisioningStatus('non-existent-request');

      // Assert
      expect(status).toBeNull();
    });

    it('should handle workflow status lookup failures', async () => {
      // Arrange
      const requestId = 'req-123';
      mockArgoClient.getWorkflowStatus.mockRejectedValue(new Error('Workflow not found'));

      service['activeRequests'].set(requestId, {
        requestId,
        namespaceName: 'test-app-dev',
        workflowName: 'workflow-123',
        status: 'provisioning',
        createdAt: '2023-01-01T11:00:00Z'
      });

      // Act
      const status = await service.getProvisioningStatus(requestId);

      // Assert
      expect(status).toBeDefined();
      expect(status.status).toBe('error');
      expect(status.errorMessage).toContain('Failed to get workflow status');
    });
  });

  describe('generateWorkflowSpec', () => {
    it('should generate valid workflow spec for basic namespace', () => {
      // Act
      const spec = service['generateWorkflowSpec'](validRequest, 'req-123');

      // Assert
      expect(spec).toBeDefined();
      expect(spec.metadata.name).toMatch(/^provision-namespace-req-123-/);
      expect(spec.spec.templates).toHaveLength(4); // create-namespace, setup-rbac, apply-policies, notify
      
      // Check that namespace creation template exists
      const namespaceTemplate = spec.spec.templates.find(t => t.name === 'create-namespace');
      expect(namespaceTemplate).toBeDefined();
      expect(namespaceTemplate?.script?.source).toContain('kubectl create namespace test-app-dev');
    });

    it('should include Istio injection when requested', () => {
      // Arrange
      const requestWithIstio = {
        ...validRequest,
        features: ['istio-injection']
      };

      // Act
      const spec = service['generateWorkflowSpec'](requestWithIstio, 'req-123');

      // Assert
      const namespaceTemplate = spec.spec.templates.find(t => t.name === 'create-namespace');
      expect(namespaceTemplate?.script?.source).toContain('istio-injection=enabled');
    });

    it('should apply correct resource quotas for different tiers', () => {
      // Arrange
      const largeRequest = {
        ...validRequest,
        resourceTier: 'large' as ResourceTier
      };

      // Act
      const spec = service['generateWorkflowSpec'](largeRequest, 'req-123');

      // Assert
      const rbacTemplate = spec.spec.templates.find(t => t.name === 'setup-rbac');
      expect(rbacTemplate?.script?.source).toContain('requests.cpu: "8"');
      expect(rbacTemplate?.script?.source).toContain('requests.memory: "16Gi"');
    });
  });

  describe('validateRequest', () => {
    it('should pass validation for valid request', async () => {
      // Act & Assert - should not throw
      await service['validateRequest'](validRequest);
    });

    it('should reject empty namespace name', async () => {
      // Arrange
      const invalidRequest = { ...validRequest, namespaceName: '' };

      // Act & Assert
      await expect(service['validateRequest'](invalidRequest)).rejects.toThrow(
        'Namespace name is required'
      );
    });

    it('should reject namespace names that are too long', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        namespaceName: 'a'.repeat(64) // Kubernetes namespace names must be < 63 characters
      };

      // Act & Assert
      await expect(service['validateRequest'](invalidRequest)).rejects.toThrow(
        'Namespace name too long'
      );
    });

    it('should reject invalid characters in namespace name', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        namespaceName: 'test-app_DEV'
      };

      // Act & Assert
      await expect(service['validateRequest'](invalidRequest)).rejects.toThrow(
        'Invalid namespace name format'
      );
    });

    it('should reject unknown resource tiers', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        resourceTier: 'unknown' as ResourceTier
      };

      // Act & Assert
      await expect(service['validateRequest'](invalidRequest)).rejects.toThrow(
        'Invalid resource tier: unknown'
      );
    });

    it('should reject unknown network policies', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        networkPolicy: 'unknown'
      };

      // Act & Assert
      await expect(service['validateRequest'](invalidRequest)).rejects.toThrow(
        'Invalid network policy: unknown'
      );
    });
  });

  describe('listTeamNamespaces', () => {
    it('should return namespaces for specified team', async () => {
      // Arrange
      const mockNamespaces = [
        {
          metadata: {
            name: 'frontend-app-dev',
            labels: { 'platform.company.com/team': 'frontend' },
            annotations: { 'platform.company.com/created-by': 'platform-api' }
          }
        },
        {
          metadata: {
            name: 'frontend-app-staging',
            labels: { 'platform.company.com/team': 'frontend' },
            annotations: { 'platform.company.com/created-by': 'platform-api' }
          }
        }
      ];

      mockKubernetesClient.listNamespacesByLabel.mockResolvedValue(mockNamespaces);

      // Act
      const result = await service.listTeamNamespaces('frontend');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('frontend-app-dev');
      expect(result[1].name).toBe('frontend-app-staging');
      expect(mockKubernetesClient.listNamespacesByLabel).toHaveBeenCalledWith(
        'platform.company.com/team=frontend'
      );
    });

    it('should return empty array when no namespaces found', async () => {
      // Arrange
      mockKubernetesClient.listNamespacesByLabel.mockResolvedValue([]);

      // Act
      const result = await service.listTeamNamespaces('backend');

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});