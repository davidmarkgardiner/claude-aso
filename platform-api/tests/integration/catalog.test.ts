import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import * as jwt from 'jsonwebtoken';

describe('Catalog API Endpoints', () => {
  let app: Express;
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
      roles: ['platform:admin', 'catalog:admin'],
      tenant: 'platform'
    }, testSecret);
  });

  beforeEach(async () => {
    app = await createApp();
    jest.clearAllMocks();
  });

  describe('GET /api/platform/catalog/templates', () => {
    it('should return all available templates', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/templates')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // Verify template structure
      const templates = response.body.data;
      expect(templates.length).toBeGreaterThan(0);
      
      const template = templates[0];
      expect(template).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        category: expect.any(String),
        version: expect.any(String),
        tags: expect.any(Array),
        parameters: expect.any(Array)
      });
    });

    it('should support filtering by category', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/templates?category=microservice')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      const templates = response.body.data;
      
      if (templates.length > 0) {
        expect(templates.every(t => t.category === 'microservice')).toBe(true);
      }
    });

    it('should support filtering by tags', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/templates?tags=nodejs,api')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      const templates = response.body.data;
      
      if (templates.length > 0) {
        expect(templates.every(t => 
          t.tags.includes('nodejs') || t.tags.includes('api')
        )).toBe(true);
      }
    });

    it('should support search functionality', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/templates?search=microservice')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      const templates = response.body.data;
      
      if (templates.length > 0) {
        expect(templates.some(t => 
          t.name.toLowerCase().includes('microservice') ||
          t.description.toLowerCase().includes('microservice')
        )).toBe(true);
      }
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/templates');

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/platform/catalog/templates/:id', () => {
    it('should return template details for valid ID', async () => {
      // First get available templates to get a valid ID
      const templatesResponse = await request(app)
        .get('/api/platform/catalog/templates')
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(templatesResponse.status).toBe(200);
      const templates = templatesResponse.body.data;
      expect(templates.length).toBeGreaterThan(0);
      
      const templateId = templates[0].id;

      // Act
      const response = await request(app)
        .get(`/api/platform/catalog/templates/${templateId}`)
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const template = response.body.data;
      expect(template).toMatchObject({
        id: templateId,
        name: expect.any(String),
        description: expect.any(String),
        category: expect.any(String),
        version: expect.any(String),
        tags: expect.any(Array),
        parameters: expect.any(Array),
        manifest: expect.any(Object),
        examples: expect.any(Array)
      });

      // Verify parameters have required structure
      template.parameters.forEach(param => {
        expect(param).toMatchObject({
          name: expect.any(String),
          type: expect.any(String),
          required: expect.any(Boolean)
        });
      });
    });

    it('should return 404 for non-existent template', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/templates/non-existent-template')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Template not found');
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/templates/some-template');

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/platform/catalog/templates/:id/deploy', () => {
    const deploymentRequest = {
      serviceName: 'test-payment-api',
      team: 'frontend',
      namespace: 'frontend-staging',
      environment: 'staging',
      parameters: {
        databaseType: 'postgresql',
        replicas: 2,
        resourceTier: 'small',
        externalDomain: 'test-api.company.com'
      }
    };

    it('should successfully deploy template', async () => {
      // First get a valid template ID
      const templatesResponse = await request(app)
        .get('/api/platform/catalog/templates?category=microservice')
        .set('Authorization', `Bearer ${validToken}`);
      
      const templates = templatesResponse.body.data;
      const templateId = templates[0]?.id || 'microservice-api';

      // Act
      const response = await request(app)
        .post(`/api/platform/catalog/templates/${templateId}/deploy`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(deploymentRequest);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      
      const deployment = response.body.data;
      expect(deployment).toMatchObject({
        deploymentId: expect.any(String),
        templateId: templateId,
        serviceName: 'test-payment-api',
        team: 'frontend',
        namespace: 'frontend-staging',
        status: 'pending',
        createdAt: expect.any(String)
      });

      expect(deployment.deploymentId).toBeValidUUID();
      expect(deployment.createdAt).toBeValidISO8601();
    });

    it('should validate required parameters', async () => {
      const invalidRequest = {
        ...deploymentRequest,
        serviceName: '', // Empty service name
        parameters: {
          // Missing required parameters
          replicas: 2
        }
      };

      // Act
      const response = await request(app)
        .post('/api/platform/catalog/templates/microservice-api/deploy')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidRequest);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('validation');
    });

    it('should enforce team access control', async () => {
      const crossTeamRequest = {
        ...deploymentRequest,
        team: 'backend', // Different team
        namespace: 'backend-prod'
      };

      // Act
      const response = await request(app)
        .post('/api/platform/catalog/templates/microservice-api/deploy')
        .set('Authorization', `Bearer ${validToken}`)
        .send(crossTeamRequest);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('access');
    });

    it('should allow admin to deploy for any team', async () => {
      const crossTeamRequest = {
        ...deploymentRequest,
        team: 'backend',
        namespace: 'backend-staging'
      };

      // Act
      const response = await request(app)
        .post('/api/platform/catalog/templates/microservice-api/deploy')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(crossTeamRequest);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should validate namespace exists and belongs to team', async () => {
      const invalidRequest = {
        ...deploymentRequest,
        namespace: 'non-existent-namespace'
      };

      // Act
      const response = await request(app)
        .post('/api/platform/catalog/templates/microservice-api/deploy')
        .set('Authorization', `Bearer ${validToken}`)
        .send(invalidRequest);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('namespace');
    });

    it('should return 404 for non-existent template', async () => {
      // Act
      const response = await request(app)
        .post('/api/platform/catalog/templates/non-existent/deploy')
        .set('Authorization', `Bearer ${validToken}`)
        .send(deploymentRequest);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Template not found');
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .post('/api/platform/catalog/templates/microservice-api/deploy')
        .send(deploymentRequest);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should handle rate limiting for deployments', async () => {
      // Act - Make multiple rapid deployment requests
      const requests = Array(6).fill(null).map(() =>
        request(app)
          .post('/api/platform/catalog/templates/microservice-api/deploy')
          .set('Authorization', `Bearer ${validToken}`)
          .send(deploymentRequest)
      );

      const responses = await Promise.all(requests);

      // Assert - Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/platform/catalog/deployments/:id/status', () => {
    it('should return deployment status', async () => {
      // First create a deployment to get a valid ID
      const templatesResponse = await request(app)
        .get('/api/platform/catalog/templates')
        .set('Authorization', `Bearer ${validToken}`);
      
      const templateId = templatesResponse.body.data[0]?.id || 'microservice-api';

      const deployResponse = await request(app)
        .post(`/api/platform/catalog/templates/${templateId}/deploy`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          serviceName: 'test-status-api',
          team: 'frontend',
          namespace: 'frontend-dev',
          environment: 'development',
          parameters: { replicas: 1 }
        });

      expect(deployResponse.status).toBe(201);
      const deploymentId = deployResponse.body.data.deploymentId;

      // Act
      const response = await request(app)
        .get(`/api/platform/catalog/deployments/${deploymentId}/status`)
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      const status = response.body.data;
      expect(status).toMatchObject({
        deploymentId: deploymentId,
        status: expect.stringMatching(/^(pending|running|completed|failed)$/),
        progress: expect.any(Number),
        createdAt: expect.any(String)
      });

      if (status.status === 'completed') {
        expect(status.completedAt).toBeValidISO8601();
      }

      if (status.status === 'failed') {
        expect(status.errorMessage).toBeDefined();
      }
    });

    it('should return 404 for non-existent deployment', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/deployments/non-existent-deployment/status')
        .set('Authorization', `Bearer ${validToken}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Deployment not found');
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .get('/api/platform/catalog/deployments/some-deployment/status');

      // Assert
      expect(response.status).toBe(401);
    });
  });
});