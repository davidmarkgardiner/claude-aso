import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { NamespaceProvisioningService } from '../../src/services/namespaceProvisioning';
import { KubernetesClient } from '../../src/services/kubernetesClient';
import { ArgoWorkflowsClient } from '../../src/services/argoWorkflowsClient';
import * as jwt from 'jsonwebtoken';

// Mock external services
jest.mock('../../src/services/kubernetesClient');
jest.mock('../../src/services/argoWorkflowsClient');
jest.mock('../../src/services/namespaceProvisioning');

describe('Namespace API Endpoints', () => {
  let app: Express;
  let mockProvisioningService: jest.Mocked<NamespaceProvisioningService>;
  let validToken: string;
  let adminToken: string;

  beforeAll(() => {
    // Create test JWT tokens
    const testSecret = 'test-secret-key';
    process.env.JWT_SECRET = testSecret;

    validToken = jwt.sign({
      id: 'user-123',
      email: 'test@company.com',
      name: 'Test User',
      groups: ['frontend-team-developers'],
      roles: ['namespace:developer', 'team:frontend:developer'],
      tenant: 'frontend'
    }, testSecret);

    adminToken = jwt.sign({
      id: 'admin-123',
      email: 'admin@company.com',
      name: 'Admin User',
      groups: ['platform-admins'],
      roles: ['platform:admin', 'namespace:admin'],
      tenant: 'platform'
    }, testSecret);
  });

  beforeEach(async () => {
    // Create app instance
    app = await createApp();

    // Get mocked service instance
    mockProvisioningService = NamespaceProvisioningService.prototype as jest.Mocked<NamespaceProvisioningService>;
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/platform/namespaces/request', () => {
    const validRequest = {
      namespaceName: 'test-app-dev',
      team: 'frontend',
      environment: 'development',
      resourceTier: 'small',
      networkPolicy: 'isolated',
      features: ['istio-injection', 'monitoring-enhanced'],
      description: 'Test namespace for development'
    };

    it('should successfully create namespace request', async () => {
      // Arrange
      const mockResult = {
        requestId: 'req-123',
        namespaceName: 'test-app-dev',
        status: 'pending',
        workflowName: 'workflow-123',
        createdAt: '2023-01-01T12:00:00Z'
      };
      mockProvisioningService.provisionNamespace.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validRequest);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: mockResult
      });
      expect(mockProvisioningService.provisionNamespace).toHaveBeenCalledWith(
        expect.objectContaining({
          ...validRequest,
          owner: expect.objectContaining({
            id: 'user-123',
            email: 'test@company.com'
          })
        })
      );
    });

    it('should reject request without authentication', async () => {
      // Act
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .send(validRequest);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access denied. No token provided.');
    });

    it('should reject request with invalid authentication', async () => {
      // Act
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', 'Bearer invalid-token')
        .send(validRequest);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should reject request for different team (non-admin)', async () => {
      // Arrange
      const crossTeamRequest = {
        ...validRequest,
        team: 'backend'
      };

      // Act
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send(crossTeamRequest);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('You can only access resources for team: frontend');
    });

    it('should allow admin to request namespace for any team', async () => {
      // Arrange
      const crossTeamRequest = {
        ...validRequest,
        team: 'backend'
      };
      
      const mockResult = {
        requestId: 'req-456',
        namespaceName: 'test-app-dev',
        status: 'pending',
        workflowName: 'workflow-456',
        createdAt: '2023-01-01T12:00:00Z'
      };
      mockProvisioningService.provisionNamespace.mockResolvedValue(mockResult);

      // Act
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(crossTeamRequest);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        namespaceName: '', // Empty name
        resourceTier: undefined // Missing tier
      };

      // Act
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidRequest);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('validation');
    });

    it('should handle rate limiting', async () => {
      // Arrange
      const mockResult = {
        requestId: 'req-123',
        namespaceName: 'test-app-dev',
        status: 'pending',
        workflowName: 'workflow-123',
        createdAt: '2023-01-01T12:00:00Z'
      };
      mockProvisioningService.provisionNamespace.mockResolvedValue(mockResult);

      // Act - Make multiple rapid requests
      const requests = Array(6).fill(null).map(() =>
        request(app)
          .post('/api/platform/namespaces/request')
          .set('Authorization', `Bearer ${validToken}`)
          .send(validRequest)
      );

      const responses = await Promise.all(requests);

      // Assert - Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should handle provisioning service errors', async () => {
      // Arrange
      mockProvisioningService.provisionNamespace.mockRejectedValue(
        new Error('Namespace already exists')
      );

      // Act
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${validToken}`)
        .send(validRequest);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Namespace already exists');
    });
  });

  describe('GET /api/platform/namespaces/request/:id/status', () => {
    it('should return status for valid request ID', async () => {
      // Arrange
      const requestId = 'req-123';
      const mockStatus = {
        requestId,
        namespaceName: 'test-app-dev',
        status: 'completed',
        workflowName: 'workflow-123',
        createdAt: '2023-01-01T11:00:00Z',
        completedAt: '2023-01-01T12:00:00Z',
        workflowStatus: {
          phase: 'Succeeded'
        }
      };
      
      mockProvisioningService.getProvisioningStatus.mockResolvedValue(mockStatus);

      // Act
      const response = await request(app)
        .get(`/api/platform/namespaces/request/${requestId}/status`)
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockStatus
      });
    });

    it('should return 404 for non-existent request', async () => {
      // Arrange
      mockProvisioningService.getProvisioningStatus.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/request/non-existent/status')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Request not found');
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/request/req-123/status');

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/platform/namespaces/team/:team', () => {
    it('should return team namespaces for authorized user', async () => {
      // Arrange
      const mockNamespaces = [
        {
          name: 'frontend-app-dev',
          team: 'frontend',
          environment: 'development',
          status: 'active',
          createdAt: '2023-01-01T12:00:00Z'
        },
        {
          name: 'frontend-app-staging',
          team: 'frontend',
          environment: 'staging', 
          status: 'active',
          createdAt: '2023-01-02T12:00:00Z'
        }
      ];
      
      mockProvisioningService.listTeamNamespaces.mockResolvedValue(mockNamespaces);

      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/team/frontend')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockNamespaces,
        pagination: expect.objectContaining({
          total: 2,
          page: 1,
          pageSize: 10
        })
      });
    });

    it('should deny access to different team namespaces', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/team/backend')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(403);
    });

    it('should allow admin to view any team namespaces', async () => {
      // Arrange
      const mockNamespaces = [
        {
          name: 'backend-api-prod',
          team: 'backend',
          environment: 'production',
          status: 'active',
          createdAt: '2023-01-01T12:00:00Z'
        }
      ];
      
      mockProvisioningService.listTeamNamespaces.mockResolvedValue(mockNamespaces);

      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/team/backend')
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      // Arrange
      const mockNamespaces = Array(15).fill(null).map((_, i) => ({
        name: `frontend-app-${i}`,
        team: 'frontend',
        environment: 'development',
        status: 'active',
        createdAt: '2023-01-01T12:00:00Z'
      }));
      
      mockProvisioningService.listTeamNamespaces.mockResolvedValue(mockNamespaces.slice(10, 15));

      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/team/frontend?page=2&pageSize=5')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination).toMatchObject({
        page: 2,
        pageSize: 5
      });
    });
  });

  describe('GET /api/platform/namespaces/:namespace', () => {
    it('should return namespace details for authorized user', async () => {
      // Arrange
      const namespaceName = 'frontend-app-dev';
      const mockNamespace = {
        name: namespaceName,
        team: 'frontend',
        environment: 'development',
        resourceTier: 'small',
        status: 'active',
        createdAt: '2023-01-01T12:00:00Z',
        resources: {
          pods: 5,
          services: 2,
          deployments: 3
        },
        quota: {
          cpu: { used: '500m', limit: '2000m' },
          memory: { used: '1Gi', limit: '4Gi' },
          storage: { used: '5Gi', limit: '20Gi' }
        }
      };
      
      mockProvisioningService.getNamespaceDetails.mockResolvedValue(mockNamespace);

      // Act
      const response = await request(app)
        .get(`/api/platform/namespaces/${namespaceName}`)
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockNamespace
      });
    });

    it('should return 404 for non-existent namespace', async () => {
      // Arrange
      mockProvisioningService.getNamespaceDetails.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/non-existent')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Namespace not found');
    });

    it('should deny access to namespace from different team', async () => {
      // Arrange
      const mockNamespace = {
        name: 'backend-api-prod',
        team: 'backend', // Different team
        environment: 'production',
        status: 'active',
        createdAt: '2023-01-01T12:00:00Z'
      };
      
      mockProvisioningService.getNamespaceDetails.mockResolvedValue(mockNamespace);

      // Act
      const response = await request(app)
        .get('/api/platform/namespaces/backend-api-prod')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('access');
    });
  });
});