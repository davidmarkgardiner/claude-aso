import request from 'supertest';
import { Application } from 'express';
import { getRBACService } from '../../src/services/rbacService';
import { getClusterConfigService } from '../../src/config/clusters';
import { RBACProvisioningResult } from '../../src/types/rbac';

// Mock dependencies
jest.mock('../../src/services/rbacService');
jest.mock('../../src/config/clusters');
jest.mock('../../src/middleware/azureAdValidation');
jest.mock('../../src/services/namespaceProvisioning');

const mockRBACService = {
  provisionNamespaceRBAC: jest.fn(),
  getRBACStatus: jest.fn(),
  removeNamespaceRBAC: jest.fn()
};

const mockClusterConfigService = {
  getAllClusters: jest.fn()
};

const mockProvisioningService = {
  getNamespaceDetails: jest.fn()
};

(getRBACService as jest.Mock).mockReturnValue(mockRBACService);
(getClusterConfigService as jest.Mock).mockReturnValue(mockClusterConfigService);

// Mock middleware
jest.mock('../../src/middleware/azureAdValidation', () => ({
  validateAzureADPrincipal: () => (req: any, res: any, next: any) => {
    req.body.validatedPrincipal = {
      objectId: req.body.principalId,
      userPrincipalName: 'test@example.com',
      displayName: 'Test User',
      principalType: 'User',
      verified: true
    };
    next();
  }
}));

describe('RBAC Integration Tests', () => {
  let app: Application;
  
  beforeAll(async () => {
    // Create test app with routes
    const express = require('express');
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    app.use((req: any, res: any, next: any) => {
      req.user = {
        email: 'test@example.com',
        roles: ['namespace:admin', 'platform:admin']
      };
      next();
    });
    
    // Import and use routes
    const { namespaceRouter } = require('../../src/routes/namespaces');
    app.use('/api/platform/namespaces', namespaceRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/platform/namespaces/:namespaceName/rbac', () => {
    const namespaceName = 'test-namespace';
    const requestBody = {
      principalId: 'test-principal-id',
      principalType: 'User',
      roleDefinition: 'aks-rbac-admin'
    };

    const mockNamespaceDetails = {
      namespace: {
        metadata: {
          labels: {
            'platform.io/team': 'test-team',
            'platform.io/environment': 'development'
          }
        }
      }
    };

    const mockRBACResult: RBACProvisioningResult = {
      namespaceRBAC: {
        namespaceName: 'test-namespace',
        clusterName: 'test-cluster',
        teamName: 'test-team',
        environment: 'development',
        roleAssignments: [{
          principalId: 'test-principal-id',
          principalType: 'User',
          roleDefinitionId: '/subscriptions/test/providers/Microsoft.Authorization/roleDefinitions/test-role',
          scope: '/subscriptions/test/resourceGroups/test/providers/Microsoft.ContainerService/managedClusters/test/namespaces/test-namespace',
          description: 'Test assignment'
        }]
      },
      roleAssignmentIds: ['rbac-test-namespace-test-team-1'],
      asoManifests: [],
      status: 'created',
      message: 'RBAC provisioning completed successfully',
      createdAt: new Date()
    };

    beforeEach(() => {
      jest.doMock('../../src/services/namespaceProvisioning', () => ({
        getProvisioningService: () => ({
          getNamespaceDetails: mockProvisioningService.getNamespaceDetails
        })
      }));
      
      mockProvisioningService.getNamespaceDetails.mockResolvedValue(mockNamespaceDetails);
      mockRBACService.provisionNamespaceRBAC.mockResolvedValue(mockRBACResult);
    });

    it('should successfully add RBAC to existing namespace', async () => {
      const response = await request(app)
        .post(`/api/platform/namespaces/${namespaceName}/rbac`)
        .send(requestBody)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockRBACResult);

      expect(mockProvisioningService.getNamespaceDetails).toHaveBeenCalledWith(namespaceName);
      expect(mockRBACService.provisionNamespaceRBAC).toHaveBeenCalledWith(
        namespaceName,
        'test-team',
        'development',
        {
          principalId: requestBody.principalId,
          principalType: requestBody.principalType,
          roleDefinition: requestBody.roleDefinition,
          clusterName: undefined
        }
      );
    });

    it('should return 404 when namespace not found', async () => {
      mockProvisioningService.getNamespaceDetails.mockRejectedValue(
        new Error('Namespace not found')
      );

      const response = await request(app)
        .post(`/api/platform/namespaces/${namespaceName}/rbac`)
        .send(requestBody)
        .expect(404);

      expect(response.body.error).toBe('NotFoundError');
      expect(response.body.message).toContain('not found');
    });

    it('should return 400 when namespace lacks required labels', async () => {
      const invalidNamespaceDetails = {
        namespace: {
          metadata: {
            labels: {}
          }
        }
      };

      mockProvisioningService.getNamespaceDetails.mockResolvedValue(invalidNamespaceDetails);

      const response = await request(app)
        .post(`/api/platform/namespaces/${namespaceName}/rbac`)
        .send(requestBody)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
      expect(response.body.message).toContain('team and environment labels');
    });

    it('should validate principal ID format', async () => {
      const invalidRequest = {
        ...requestBody,
        principalId: 'invalid-guid'
      };

      const response = await request(app)
        .post(`/api/platform/namespaces/${namespaceName}/rbac`)
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
    });
  });

  describe('GET /api/platform/namespaces/:namespaceName/rbac', () => {
    const namespaceName = 'test-namespace';

    const mockRBACStatus = {
      namespace: namespaceName,
      cluster: 'test-cluster',
      roleAssignments: [
        {
          name: 'rbac-test-namespace-test-team-1',
          principalId: 'test-principal-id',
          roleDefinitionId: '/subscriptions/test/providers/Microsoft.Authorization/roleDefinitions/test-role',
          scope: '/subscriptions/test/resourceGroups/test/providers/Microsoft.ContainerService/managedClusters/test/namespaces/test-namespace',
          status: 'Ready',
          createdAt: '2024-01-01T00:00:00Z'
        }
      ]
    };

    it('should successfully return RBAC status', async () => {
      mockRBACService.getRBACStatus.mockResolvedValue(mockRBACStatus);

      const response = await request(app)
        .get(`/api/platform/namespaces/${namespaceName}/rbac`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockRBACStatus);
      expect(mockRBACService.getRBACStatus).toHaveBeenCalledWith(namespaceName, undefined);
    });

    it('should pass cluster name parameter', async () => {
      mockRBACService.getRBACStatus.mockResolvedValue(mockRBACStatus);

      await request(app)
        .get(`/api/platform/namespaces/${namespaceName}/rbac`)
        .query({ clusterName: 'specific-cluster' })
        .expect(200);

      expect(mockRBACService.getRBACStatus).toHaveBeenCalledWith(namespaceName, 'specific-cluster');
    });

    it('should return 404 when RBAC configuration not found', async () => {
      mockRBACService.getRBACStatus.mockRejectedValue(new Error('not found'));

      const response = await request(app)
        .get(`/api/platform/namespaces/${namespaceName}/rbac`)
        .expect(404);

      expect(response.body.error).toBe('NotFoundError');
    });
  });

  describe('DELETE /api/platform/namespaces/:namespaceName/rbac', () => {
    const namespaceName = 'test-namespace';

    it('should successfully remove RBAC from namespace', async () => {
      mockRBACService.removeNamespaceRBAC.mockResolvedValue(undefined);

      const response = await request(app)
        .delete(`/api/platform/namespaces/${namespaceName}/rbac`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('RBAC removed');
      expect(mockRBACService.removeNamespaceRBAC).toHaveBeenCalledWith(namespaceName, undefined);
    });

    it('should pass cluster name parameter', async () => {
      mockRBACService.removeNamespaceRBAC.mockResolvedValue(undefined);

      await request(app)
        .delete(`/api/platform/namespaces/${namespaceName}/rbac`)
        .query({ clusterName: 'specific-cluster' })
        .expect(200);

      expect(mockRBACService.removeNamespaceRBAC).toHaveBeenCalledWith(namespaceName, 'specific-cluster');
    });

    it('should return 404 when RBAC configuration not found', async () => {
      mockRBACService.removeNamespaceRBAC.mockRejectedValue(new Error('not found'));

      const response = await request(app)
        .delete(`/api/platform/namespaces/${namespaceName}/rbac`)
        .expect(404);

      expect(response.body.error).toBe('NotFoundError');
    });
  });

  describe('GET /api/platform/clusters', () => {
    const mockClusters = [
      {
        name: 'dev-cluster',
        environment: 'development',
        region: 'uksouth',
        resourceGroup: 'dev-rg',
        subscriptionId: 'test-sub',
        armId: '/subscriptions/test-sub/resourceGroups/dev-rg/providers/Microsoft.ContainerService/managedClusters/dev-cluster',
        isDefault: true
      },
      {
        name: 'prod-cluster',
        environment: 'production',
        region: 'uksouth',
        resourceGroup: 'prod-rg',
        subscriptionId: 'test-sub',
        armId: '/subscriptions/test-sub/resourceGroups/prod-rg/providers/Microsoft.ContainerService/managedClusters/prod-cluster',
        isDefault: false
      }
    ];

    it('should return list of available clusters', async () => {
      mockClusterConfigService.getAllClusters.mockReturnValue(mockClusters);

      const response = await request(app)
        .get('/api/platform/namespaces/clusters')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.clusters).toHaveLength(2);
      expect(response.body.data.clusters[0]).toEqual({
        name: 'dev-cluster',
        environment: 'development',
        region: 'uksouth',
        resourceGroup: 'dev-rg',
        isDefault: true
      });
      expect(response.body.data.count).toBe(2);
    });

    it('should return empty list when no clusters configured', async () => {
      mockClusterConfigService.getAllClusters.mockReturnValue([]);

      const response = await request(app)
        .get('/api/platform/namespaces/clusters')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.clusters).toHaveLength(0);
      expect(response.body.data.count).toBe(0);
    });
  });
});