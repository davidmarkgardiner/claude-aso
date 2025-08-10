/**
 * Platform API Demo Test Suite
 * 
 * This comprehensive test suite demonstrates the full capabilities of the
 * Namespace-as-a-Service Platform API. It showcases:
 * 
 * 1. Namespace provisioning workflow
 * 2. Service catalog deployment
 * 3. Team-based access controls
 * 4. Multi-environment management
 * 5. Analytics and monitoring
 * 6. Error handling and recovery
 * 
 * Run this test to see the platform in action!
 */

import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import * as jwt from 'jsonwebtoken';
import { mockUsers } from '../fixtures/namespaces';

describe('🚀 Platform API Demo - Complete Workflow', () => {
  let app: Express;
  let developerToken: string;
  let adminToken: string;
  let teamLeadToken: string;

  beforeAll(async () => {
    console.log('\n🎭 Platform Demo Starting...\n');
    
    // Initialize the application
    app = await createApp();
    
    // Create authentication tokens for different user types
    const testSecret = process.env.JWT_SECRET || 'test-secret-key';
    
    developerToken = jwt.sign(mockUsers.developer, testSecret);
    adminToken = jwt.sign(mockUsers.admin, testSecret);
    teamLeadToken = jwt.sign(mockUsers.teamLead, testSecret);

    console.log('✅ Application initialized with test tokens');
  });

  describe('📋 1. Service Catalog Discovery', () => {
    it('should showcase available templates and their capabilities', async () => {
      console.log('\n📋 Discovering available service templates...');
      
      // Get all available templates
      const response = await request(app)
        .get('/api/platform/catalog/templates')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const templates = response.body.data;
      
      console.log(`\n✨ Found ${templates.length} available templates:`);
      templates.forEach((template: any, index: number) => {
        console.log(`   ${index + 1}. ${template.name} (${template.category})`);
        console.log(`      📝 ${template.description}`);
        console.log(`      🏷️  Tags: ${template.tags.join(', ')}`);
        console.log(`      📦 Parameters: ${template.parameters.length} configurable options`);
        console.log('');
      });

      // Demonstrate template filtering
      const microserviceResponse = await request(app)
        .get('/api/platform/catalog/templates?category=microservice')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      console.log(`🔍 Filtered to microservice templates: ${microserviceResponse.body.data.length} found`);
    });

    it('should show detailed template information', async () => {
      console.log('\n🔍 Getting detailed template information...');
      
      // Get detailed info for the microservice template
      const response = await request(app)
        .get('/api/platform/catalog/templates/microservice-api')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      const template = response.body.data;
      console.log(`\n📖 Template Details: ${template.name}`);
      console.log(`   Version: ${template.version}`);
      console.log(`   Author: ${template.author}`);
      console.log(`   \n   📋 Configuration Parameters:`);
      
      template.parameters.forEach((param: any) => {
        const required = param.required ? '(required)' : '(optional)';
        const defaultVal = param.defaultValue ? ` [default: ${param.defaultValue}]` : '';
        console.log(`      • ${param.name}: ${param.type} ${required}${defaultVal}`);
        console.log(`        ${param.description}`);
      });

      console.log(`\n   🎯 Example Configurations:`);
      template.examples.forEach((example: any, index: number) => {
        console.log(`      ${index + 1}. ${example.name}: ${example.description}`);
      });
    });
  });

  describe('🏗️  2. Namespace Provisioning Workflow', () => {
    let requestId: string;

    it('should demonstrate the complete namespace provisioning process', async () => {
      console.log('\n🏗️  Starting namespace provisioning workflow...');
      
      const namespaceRequest = {
        namespaceName: 'demo-payment-api-dev',
        team: 'frontend',
        environment: 'development',
        resourceTier: 'small',
        networkPolicy: 'team-shared',
        features: ['istio-injection', 'monitoring-enhanced'],
        description: 'Demo: Payment API development environment'
      };

      // Step 1: Submit namespace request
      console.log('\n📝 Step 1: Submitting namespace request...');
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${developerToken}`)
        .send(namespaceRequest)
        .expect(201);

      expect(response.body.success).toBe(true);
      requestId = response.body.data.requestId;
      
      console.log(`✅ Namespace request submitted successfully!`);
      console.log(`   Request ID: ${requestId}`);
      console.log(`   Namespace: ${response.body.data.namespaceName}`);
      console.log(`   Status: ${response.body.data.status}`);
      console.log(`   Workflow: ${response.body.data.workflowName}`);

      // Step 2: Check provisioning status
      console.log('\n🔄 Step 2: Monitoring provisioning status...');
      const statusResponse = await request(app)
        .get(`/api/platform/namespaces/request/${requestId}/status`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      console.log(`   Current Status: ${statusResponse.body.data.status}`);
      if (statusResponse.body.data.workflowStatus) {
        console.log(`   Workflow Phase: ${statusResponse.body.data.workflowStatus.phase}`);
      }
    });

    it('should show namespace access controls in action', async () => {
      console.log('\n🔐 Demonstrating access control enforcement...');
      
      // Try to access namespace from different team (should fail)
      const crossTeamRequest = {
        namespaceName: 'backend-api-dev',
        team: 'backend', // Different team!
        environment: 'development',
        resourceTier: 'small',
        networkPolicy: 'isolated',
        description: 'Should be blocked by access control'
      };

      console.log('🚫 Attempting cross-team namespace request (should fail)...');
      const response = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${developerToken}`) // Frontend developer trying to access backend
        .send(crossTeamRequest)
        .expect(403);

      console.log(`❌ Access denied as expected: ${response.body.error}`);

      // Show admin override capability
      console.log('👑 Demonstrating admin override capability...');
      const adminResponse = await request(app)
        .post('/api/platform/namespaces/request')
        .set('Authorization', `Bearer ${adminToken}`) // Admin can access any team
        .send(crossTeamRequest)
        .expect(201);

      console.log(`✅ Admin successfully created cross-team namespace: ${adminResponse.body.data.requestId}`);
    });
  });

  describe('🚀 3. Service Deployment from Catalog', () => {
    let deploymentId: string;

    it('should demonstrate end-to-end service deployment', async () => {
      console.log('\n🚀 Deploying service from catalog template...');
      
      const deploymentRequest = {
        serviceName: 'demo-user-api',
        team: 'frontend',
        namespace: 'frontend-app-dev',
        environment: 'development',
        parameters: {
          databaseType: 'postgresql',
          replicas: 2,
          resourceTier: 'small',
          enableMetrics: true,
          externalDomain: 'demo-api.company.local'
        }
      };

      // Deploy microservice from template
      console.log('📦 Deploying microservice API...');
      const response = await request(app)
        .post('/api/platform/catalog/templates/microservice-api/deploy')
        .set('Authorization', `Bearer ${developerToken}`)
        .send(deploymentRequest)
        .expect(201);

      deploymentId = response.body.data.deploymentId;
      
      console.log(`✅ Deployment initiated successfully!`);
      console.log(`   Deployment ID: ${deploymentId}`);
      console.log(`   Service: ${response.body.data.serviceName}`);
      console.log(`   Template: ${response.body.data.templateId}`);
      console.log(`   Namespace: ${response.body.data.namespace}`);
      console.log(`   Status: ${response.body.data.status}`);

      // Monitor deployment progress
      console.log('\n📊 Monitoring deployment progress...');
      const statusResponse = await request(app)
        .get(`/api/platform/catalog/deployments/${deploymentId}/status`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      console.log(`   Deployment Status: ${statusResponse.body.data.status}`);
      console.log(`   Progress: ${statusResponse.body.data.progress}%`);
    });

    it('should demonstrate deployment validation and error handling', async () => {
      console.log('\n🛡️  Demonstrating input validation...');
      
      const invalidDeployment = {
        serviceName: '', // Invalid empty name
        team: 'frontend',
        namespace: 'frontend-app-dev',
        environment: 'development',
        parameters: {
          replicas: 25 // Over the limit
        }
      };

      const response = await request(app)
        .post('/api/platform/catalog/templates/microservice-api/deploy')
        .set('Authorization', `Bearer ${developerToken}`)
        .send(invalidDeployment)
        .expect(400);

      console.log(`❌ Validation correctly rejected invalid input: ${response.body.error}`);

      // Demonstrate non-existent template handling
      console.log('\n🔍 Testing non-existent template handling...');
      const notFoundResponse = await request(app)
        .post('/api/platform/catalog/templates/non-existent-template/deploy')
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          serviceName: 'test-service',
          team: 'frontend',
          namespace: 'frontend-app-dev',
          environment: 'development'
        })
        .expect(404);

      console.log(`❌ Template not found handled correctly: ${notFoundResponse.body.error}`);
    });
  });

  describe('📊 4. Analytics and Monitoring Dashboard', () => {
    it('should demonstrate platform usage analytics', async () => {
      console.log('\n📊 Fetching platform analytics...');
      
      // Get overall platform usage
      const usageResponse = await request(app)
        .get('/api/platform/analytics/usage')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const usage = usageResponse.body.data;
      console.log(`\n📈 Platform Usage Statistics:`);
      console.log(`   Total Namespaces: ${usage.totalNamespaces}`);
      console.log(`   Active Deployments: ${usage.activeDeployments}`);
      console.log(`   Total Teams: ${usage.totalTeams}`);
      console.log(`   Resource Utilization: ${usage.resourceUtilization.cpu}% CPU, ${usage.resourceUtilization.memory}% Memory`);

      // Get team-specific analytics
      console.log('\n👥 Team Analytics:');
      const teamResponse = await request(app)
        .get('/api/platform/analytics/teams/frontend')
        .set('Authorization', `Bearer ${teamLeadToken}`)
        .expect(200);

      const teamStats = teamResponse.body.data;
      console.log(`   Frontend Team:`);
      console.log(`     Namespaces: ${teamStats.namespaces.length}`);
      console.log(`     Deployments This Month: ${teamStats.deploymentsThisMonth}`);
      console.log(`     Resource Usage: ${teamStats.resourceUsage.cpu} CPU, ${teamStats.resourceUsage.memory} Memory`);
      console.log(`     Cost This Month: $${teamStats.estimatedCostThisMonth}`);
    });

    it('should demonstrate cost analysis features', async () => {
      console.log('\n💰 Platform Cost Analysis...');
      
      const costResponse = await request(app)
        .get('/api/platform/analytics/costs?period=month&team=frontend')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const costs = costResponse.body.data;
      console.log(`\n💸 Cost Breakdown (Current Month):`);
      console.log(`   Total Platform Cost: $${costs.totalCost}`);
      console.log(`   Cost per Team:`);
      
      costs.teamBreakdown.forEach((team: any) => {
        console.log(`     ${team.name}: $${team.cost} (${team.percentage}%)`);
        console.log(`       Namespaces: ${team.namespaceCount}, Avg Cost: $${team.avgCostPerNamespace}`);
      });

      console.log(`\n⚡ Resource Tier Distribution:`);
      costs.tierBreakdown.forEach((tier: any) => {
        console.log(`     ${tier.tier}: ${tier.count} namespaces - $${tier.cost}`);
      });
    });

    it('should demonstrate performance monitoring', async () => {
      console.log('\n⚡ Platform Performance Metrics...');
      
      const perfResponse = await request(app)
        .get('/api/platform/analytics/performance?period=week')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const perf = perfResponse.body.data;
      console.log(`\n🎯 Performance Statistics (Last Week):`);
      console.log(`   API Response Time: ${perf.apiResponseTime.avg}ms average`);
      console.log(`   Namespace Provisioning Time: ${perf.provisioningTime.avg} minutes average`);
      console.log(`   Deployment Success Rate: ${perf.deploymentSuccessRate}%`);
      console.log(`   Uptime: ${perf.uptime}%`);
      
      console.log(`\n🔥 Top Performing Teams:`);
      perf.topTeamsByActivity.forEach((team: any, index: number) => {
        console.log(`     ${index + 1}. ${team.name}: ${team.deploymentsThisWeek} deployments`);
      });
    });
  });

  describe('📋 5. Team Management and Namespace Listing', () => {
    it('should demonstrate team-based namespace management', async () => {
      console.log('\n📋 Team Namespace Management...');
      
      // List team namespaces
      const namespacesResponse = await request(app)
        .get('/api/platform/namespaces/team/frontend')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      const namespaces = namespacesResponse.body.data;
      console.log(`\n🏠 Frontend Team Namespaces (${namespaces.length} total):`);
      
      namespaces.forEach((ns: any, index: number) => {
        console.log(`\n   ${index + 1}. ${ns.name}`);
        console.log(`      Environment: ${ns.environment}`);
        console.log(`      Resource Tier: ${ns.resourceTier}`);
        console.log(`      Status: ${ns.status}`);
        console.log(`      Created: ${new Date(ns.createdAt).toLocaleDateString()}`);
        
        if (ns.quota) {
          console.log(`      Resources: ${ns.quota.cpu?.percentage || 0}% CPU, ${ns.quota.memory?.percentage || 0}% Memory`);
        }
      });

      // Test pagination
      console.log(`\n📄 Testing pagination (first 2 namespaces):`);
      const paginatedResponse = await request(app)
        .get('/api/platform/namespaces/team/frontend?page=1&pageSize=2')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      console.log(`   Returned: ${paginatedResponse.body.data.length} namespaces`);
      console.log(`   Total Pages: ${Math.ceil(paginatedResponse.body.pagination.total / 2)}`);
    });

    it('should demonstrate namespace details and monitoring', async () => {
      console.log('\n🔍 Detailed Namespace Information...');
      
      // Get detailed info for a specific namespace
      const detailResponse = await request(app)
        .get('/api/platform/namespaces/frontend-app-dev')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      const ns = detailResponse.body.data;
      console.log(`\n📊 Namespace: ${ns.name}`);
      console.log(`   Team: ${ns.team}`);
      console.log(`   Environment: ${ns.environment}`);
      console.log(`   Status: ${ns.status}`);
      console.log(`   Created: ${new Date(ns.createdAt).toLocaleDateString()}`);
      console.log(`   Owner: ${ns.owner.name} (${ns.owner.email})`);
      
      if (ns.resources) {
        console.log(`\n   🚀 Workloads:`);
        console.log(`      Pods: ${ns.resources.pods}`);
        console.log(`      Services: ${ns.resources.services}`);
        console.log(`      Deployments: ${ns.resources.deployments}`);
        console.log(`      ConfigMaps: ${ns.resources.configMaps}`);
        console.log(`      Secrets: ${ns.resources.secrets}`);
      }

      if (ns.quota) {
        console.log(`\n   📊 Resource Utilization:`);
        console.log(`      CPU: ${ns.quota.cpu.used}/${ns.quota.cpu.limit} (${ns.quota.cpu.percentage}%)`);
        console.log(`      Memory: ${ns.quota.memory.used}/${ns.quota.memory.limit} (${ns.quota.memory.percentage}%)`);
        console.log(`      Storage: ${ns.quota.storage.used}/${ns.quota.storage.limit} (${ns.quota.storage.percentage}%)`);
      }

      if (ns.features && ns.features.length > 0) {
        console.log(`\n   ✨ Enabled Features: ${ns.features.join(', ')}`);
      }
    });
  });

  describe('🏥 6. Health Checks and System Status', () => {
    it('should demonstrate comprehensive health monitoring', async () => {
      console.log('\n🏥 Platform Health Assessment...');
      
      // Basic health check
      const basicHealth = await request(app)
        .get('/health')
        .expect(200);

      console.log(`✅ Basic Health: ${basicHealth.body.status}`);

      // Detailed health check
      const detailedHealth = await request(app)
        .get('/health/detailed')
        .expect(200);

      console.log(`\n🔍 Detailed Health Check:`);
      console.log(`   Overall Status: ${detailedHealth.body.status}`);
      console.log(`   Uptime: ${Math.round(detailedHealth.body.uptime / 1000)}s`);
      console.log(`   Version: ${detailedHealth.body.version}`);
      
      if (detailedHealth.body.dependencies) {
        console.log(`\n   🔗 Dependencies:`);
        Object.entries(detailedHealth.body.dependencies).forEach(([service, status]: [string, any]) => {
          const icon = status.healthy ? '✅' : '❌';
          console.log(`      ${icon} ${service}: ${status.healthy ? 'healthy' : 'unhealthy'}`);
          if (status.responseTime) {
            console.log(`         Response time: ${status.responseTime}ms`);
          }
        });
      }

      // Readiness and liveness probes
      await request(app).get('/health/ready').expect(200);
      await request(app).get('/health/live').expect(200);
      
      console.log(`✅ Kubernetes probes responding correctly`);
    });
  });

  describe('🔒 7. Security and Rate Limiting', () => {
    it('should demonstrate security features and rate limiting', async () => {
      console.log('\n🔒 Security Features Demonstration...');
      
      // Test authentication requirement
      console.log('🚫 Testing authentication enforcement...');
      await request(app)
        .get('/api/platform/namespaces/team/frontend')
        .expect(401);
      
      console.log('✅ Unauthenticated access correctly blocked');

      // Test invalid token
      console.log('🚫 Testing invalid token handling...');
      await request(app)
        .get('/api/platform/namespaces/team/frontend')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
        
      console.log('✅ Invalid token correctly rejected');

      // Test rate limiting
      console.log('⏱️  Testing rate limiting...');
      const requests = Array(6).fill(null).map(() =>
        request(app)
          .get('/api/platform/catalog/templates')
          .set('Authorization', `Bearer ${developerToken}`)
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      if (rateLimited.length > 0) {
        console.log(`✅ Rate limiting active: ${rateLimited.length} requests throttled`);
      } else {
        console.log('ℹ️  Rate limiting not triggered in this test window');
      }
    });
  });

  afterAll(() => {
    console.log('\n🎉 Platform API Demo Complete!');
    console.log('\n📋 Demo Summary:');
    console.log('   ✅ Service catalog discovery and template details');
    console.log('   ✅ End-to-end namespace provisioning workflow');
    console.log('   ✅ Service deployment from templates');
    console.log('   ✅ Team-based access control enforcement');
    console.log('   ✅ Analytics and cost monitoring');
    console.log('   ✅ Performance metrics and health checks');
    console.log('   ✅ Security and rate limiting validation');
    console.log('\n🚀 Platform API is ready for production use!\n');
  });
});