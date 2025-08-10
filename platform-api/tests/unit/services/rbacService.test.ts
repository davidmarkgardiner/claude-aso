import { getRBACService } from '../../../src/services/rbacService';
import { getClusterConfigService } from '../../../src/config/clusters';
import { getAzureADValidationService } from '../../../src/middleware/azureAdValidation';
import { getKubernetesClient } from '../../../src/services/kubernetesClient';
import { ClusterConfiguration, RBACProvisioningResult } from '../../../src/types/rbac';

// Mock dependencies
jest.mock('../../../src/config/clusters');
jest.mock('../../../src/middleware/azureAdValidation');
jest.mock('../../../src/services/kubernetesClient');

describe('RBACService', () => {
  let rbacService: ReturnType<typeof getRBACService>;
  let mockClusterConfigService: jest.Mocked<ReturnType<typeof getClusterConfigService>>;
  let mockAzureADService: jest.Mocked<ReturnType<typeof getAzureADValidationService>>;
  let mockK8sClient: jest.Mocked<ReturnType<typeof getKubernetesClient>>;

  const mockClusterConfig: ClusterConfiguration = {
    name: 'test-cluster',
    armId: '/subscriptions/test-sub/resourceGroups/test-rg/providers/Microsoft.ContainerService/managedClusters/test-cluster',
    resourceGroup: 'test-rg',
    subscriptionId: 'test-sub',
    region: 'uksouth',
    environment: 'development',
    isDefault: true
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockClusterConfigService = {
      getCluster: jest.fn(),
      getDefaultCluster: jest.fn(),
      getClustersByEnvironment: jest.fn(),
      getAllClusters: jest.fn(),
      addCluster: jest.fn(),
      removeCluster: jest.fn(),
      generateNamespaceScopeArmId: jest.fn(),
      validateClusterConfiguration: jest.fn()
    };

    mockAzureADService = {
      validateUserPrincipal: jest.fn(),
      validateGroupPrincipal: jest.fn(),
      validatePrincipalById: jest.fn()
    };

    mockK8sClient = {
      createCustomResource: jest.fn(),
      listCustomResources: jest.fn(),
      deleteCustomResourcesByLabel: jest.fn(),
      getNamespace: jest.fn(),
      listNamespaces: jest.fn(),
      getNamespaceResourceUsage: jest.fn()
    } as any;

    (getClusterConfigService as jest.Mock).mockReturnValue(mockClusterConfigService);
    (getAzureADValidationService as jest.Mock).mockReturnValue(mockAzureADService);
    (getKubernetesClient as jest.Mock).mockReturnValue(mockK8sClient);

    rbacService = getRBACService();
  });

  describe('provisionNamespaceRBAC', () => {
    const testNamespace = 'test-namespace';
    const testTeam = 'test-team';
    const testEnvironment = 'development';
    const testPrincipalId = 'test-principal-id';

    beforeEach(() => {
      mockClusterConfigService.getDefaultCluster.mockReturnValue(mockClusterConfig);
      mockClusterConfigService.generateNamespaceScopeArmId.mockReturnValue(
        `${mockClusterConfig.armId}/namespaces/${testNamespace}`
      );
      mockAzureADService.validatePrincipalById.mockResolvedValue({
        valid: true,
        principal: {
          objectId: testPrincipalId,
          userPrincipalName: 'test@example.com',
          displayName: 'Test User',
          principalType: 'User',
          verified: true
        },
        errors: []
      });
      mockK8sClient.createCustomResource.mockResolvedValue({});
    });

    it('should successfully provision RBAC for a namespace', async () => {
      const result = await rbacService.provisionNamespaceRBAC(
        testNamespace,
        testTeam,
        testEnvironment,
        {
          principalId: testPrincipalId,
          principalType: 'User',
          roleDefinition: 'aks-rbac-admin'
        }
      );

      expect(result.status).toBe('created');
      expect(result.namespaceRBAC.namespaceName).toBe(testNamespace);
      expect(result.namespaceRBAC.teamName).toBe(testTeam);
      expect(result.namespaceRBAC.environment).toBe(testEnvironment);
      expect(result.roleAssignmentIds).toHaveLength(1);
      expect(result.asoManifests).toHaveLength(1);

      // Verify Azure AD validation was called
      expect(mockAzureADService.validatePrincipalById).toHaveBeenCalledWith(testPrincipalId);

      // Verify ASO manifest was applied
      expect(mockK8sClient.createCustomResource).toHaveBeenCalledTimes(1);
      const appliedManifest = mockK8sClient.createCustomResource.mock.calls[0][0];
      expect(appliedManifest.kind).toBe('RoleAssignment');
      expect(appliedManifest.spec.principalId).toBe(testPrincipalId);
    });

    it('should use specific cluster when provided', async () => {
      const specificCluster = { ...mockClusterConfig, name: 'specific-cluster' };
      mockClusterConfigService.getCluster.mockReturnValue(specificCluster);

      await rbacService.provisionNamespaceRBAC(
        testNamespace,
        testTeam,
        testEnvironment,
        {
          principalId: testPrincipalId,
          clusterName: 'specific-cluster'
        }
      );

      expect(mockClusterConfigService.getCluster).toHaveBeenCalledWith('specific-cluster');
    });

    it('should skip Azure AD validation when requested', async () => {
      await rbacService.provisionNamespaceRBAC(
        testNamespace,
        testTeam,
        testEnvironment,
        {
          principalId: testPrincipalId,
          skipValidation: true
        }
      );

      expect(mockAzureADService.validatePrincipalById).not.toHaveBeenCalled();
    });

    it('should handle Azure AD validation failure', async () => {
      mockAzureADService.validatePrincipalById.mockResolvedValue({
        valid: false,
        errors: ['Principal not found'],
        undefined
      });

      const result = await rbacService.provisionNamespaceRBAC(
        testNamespace,
        testTeam,
        testEnvironment,
        {
          principalId: testPrincipalId
        }
      );

      expect(result.status).toBe('failed');
      expect(result.message).toContain('Invalid Azure AD principal');
    });

    it('should handle missing cluster configuration', async () => {
      mockClusterConfigService.getDefaultCluster.mockReturnValue(undefined);

      const result = await rbacService.provisionNamespaceRBAC(
        testNamespace,
        testTeam,
        testEnvironment,
        {
          principalId: testPrincipalId
        }
      );

      expect(result.status).toBe('failed');
      expect(result.message).toContain('No default cluster configured');
    });

    it('should handle Kubernetes API errors', async () => {
      mockK8sClient.createCustomResource.mockRejectedValue(new Error('K8s API error'));

      const result = await rbacService.provisionNamespaceRBAC(
        testNamespace,
        testTeam,
        testEnvironment,
        {
          principalId: testPrincipalId
        }
      );

      expect(result.status).toBe('failed');
      expect(result.message).toContain('K8s API error');
    });

    it('should generate correct ASO manifest structure', async () => {
      await rbacService.provisionNamespaceRBAC(
        testNamespace,
        testTeam,
        testEnvironment,
        {
          principalId: testPrincipalId,
          principalType: 'User',
          roleDefinition: 'aks-rbac-admin'
        }
      );

      const manifest = mockK8sClient.createCustomResource.mock.calls[0][0];
      
      expect(manifest).toMatchObject({
        apiVersion: 'authorization.azure.com/v1api20200801preview',
        kind: 'RoleAssignment',
        metadata: {
          namespace: 'aso-system',
          labels: {
            'platform.io/managed': 'true',
            'platform.io/namespace': testNamespace,
            'platform.io/team': testTeam,
            'platform.io/environment': testEnvironment,
            'platform.io/component': 'rbac'
          }
        },
        spec: {
          owner: {
            armId: mockClusterConfig.armId
          },
          principalId: testPrincipalId,
          principalType: 'User'
        }
      });
    });
  });

  describe('getRBACStatus', () => {
    it('should return RBAC status for namespace', async () => {
      const mockRoleAssignments = [
        {
          metadata: { 
            name: 'test-rbac-assignment',
            creationTimestamp: '2024-01-01T00:00:00Z'
          },
          spec: {
            principalId: 'test-principal',
            roleDefinitionId: 'test-role-def',
            scope: 'test-scope'
          },
          status: { phase: 'Ready' }
        }
      ];

      mockClusterConfigService.getDefaultCluster.mockReturnValue(mockClusterConfig);
      mockK8sClient.listCustomResources.mockResolvedValue(mockRoleAssignments);

      const result = await rbacService.getRBACStatus('test-namespace');

      expect(result).toMatchObject({
        namespace: 'test-namespace',
        cluster: 'test-cluster',
        roleAssignments: expect.arrayContaining([
          expect.objectContaining({
            name: 'test-rbac-assignment',
            principalId: 'test-principal',
            status: 'Ready'
          })
        ])
      });
    });
  });

  describe('removeNamespaceRBAC', () => {
    it('should remove RBAC resources for namespace', async () => {
      mockClusterConfigService.getDefaultCluster.mockReturnValue(mockClusterConfig);
      mockK8sClient.deleteCustomResourcesByLabel.mockResolvedValue({});

      await rbacService.removeNamespaceRBAC('test-namespace');

      expect(mockK8sClient.deleteCustomResourcesByLabel).toHaveBeenCalledWith(
        'authorization.azure.com/v1api20200801preview',
        'RoleAssignment',
        'aso-system',
        'platform.io/namespace=test-namespace,platform.io/cluster=test-cluster'
      );
    });
  });
});