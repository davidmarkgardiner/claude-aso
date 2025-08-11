#!/usr/bin/env node

/**
 * Test Platform API against Minikube cluster
 * This script tests the direct provisioning functionality
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const k8s = require('@kubernetes/client-node');

// Set environment variables for testing
process.env.NODE_ENV = 'development';
process.env.PORT = '3000';
process.env.KUBE_CONTEXT = 'minikube';
process.env.KUBE_NAMESPACE = 'default';
process.env.JWT_SECRET = 'test-secret-key-for-minikube';
process.env.LOG_LEVEL = 'info';
process.env.LOG_FORMAT = 'simple';
process.env.PLATFORM_COST_TRACKING = 'false';
process.env.DB_SSL = 'false';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';

const PLATFORM_API_URL = 'http://localhost:3000';

// Create test JWT token
function createTestToken(userInfo = {}) {
    return jwt.sign({
        sub: userInfo.id || 'test-user-123',
        email: userInfo.email || 'test@company.com',
        name: userInfo.name || 'Test User',
        groups: userInfo.groups || ['platform-test'],
        roles: userInfo.roles || ['platform:admin', 'namespace:admin'],
        tenant: userInfo.team || 'platform-test',
        iss: 'platform-api',
        aud: 'platform-users'
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// Setup Kubernetes client for verification
function setupKubernetesClient() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
    const rbacV1Api = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
    const networkingV1Api = kc.makeApiClient(k8s.NetworkingV1Api);
    return { coreV1Api, rbacV1Api, networkingV1Api };
}

// Test functions
async function testHealthEndpoint() {
    console.log('\n🏥 Testing Health Endpoint...');
    try {
        const response = await axios.get(`${PLATFORM_API_URL}/health`, { timeout: 5000 });
        console.log(`✅ Health check: ${response.status} - ${response.data.status}`);
        return true;
    } catch (error) {
        console.log(`❌ Health check failed: ${error.message}`);
        return false;
    }
}

async function testNamespaceCreation(testCase) {
    const token = createTestToken({
        email: testCase.requestedBy,
        name: testCase.name,
        team: testCase.team,
        roles: ['namespace:admin', 'platform:admin']
    });

    console.log(`\n🚀 Testing Namespace Creation: ${testCase.name}`);
    console.log(`   Team: ${testCase.team}`);
    console.log(`   Environment: ${testCase.environment}`);
    console.log(`   Resource Tier: ${testCase.resourceTier}`);
    console.log(`   Features: ${testCase.features.join(', ')}`);
    console.log(`   Direct Provisioning: ${!testCase.useArgoWorkflows}`);

    const namespaceRequest = {
        namespaceName: testCase.namespaceName,
        team: testCase.team,
        environment: testCase.environment,
        resourceTier: testCase.resourceTier,
        networkPolicy: testCase.networkPolicy,
        features: testCase.features,
        description: testCase.description,
        useArgoWorkflows: testCase.useArgoWorkflows || false
    };

    try {
        const response = await axios.post(
            `${PLATFORM_API_URL}/api/platform/namespaces/request`,
            namespaceRequest,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        console.log(`✅ API Response: ${response.status}`);
        console.log(`📊 Status: ${response.data.data.status}`);
        console.log(`💬 Message: ${response.data.data.message}`);
        
        return { success: true, data: response.data, namespaceName: testCase.namespaceName };
    } catch (error) {
        console.log(`❌ Namespace creation failed: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
        if (error.response?.data) {
            console.log(`📄 Full error response:`, JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, error: error.response?.data || error.message };
    }
}

async function verifyKubernetesResources(namespaceName) {
    console.log(`\n🔍 Verifying Kubernetes Resources for: ${namespaceName}`);
    
    const { coreV1Api, rbacV1Api, networkingV1Api } = setupKubernetesClient();
    
    try {
        // 1. Verify namespace exists
        const namespace = await coreV1Api.readNamespace(namespaceName);
        console.log(`✅ Namespace exists: ${namespaceName}`);
        console.log(`   Created: ${namespace.body.metadata.creationTimestamp}`);
        
        // Check labels
        if (namespace.body.metadata.labels) {
            console.log(`   Labels:`);
            Object.entries(namespace.body.metadata.labels).forEach(([key, value]) => {
                console.log(`     ${key}: ${value}`);
            });
        }

        // 2. Verify ResourceQuota
        try {
            const quotas = await coreV1Api.listNamespacedResourceQuota(namespaceName);
            if (quotas.body.items.length > 0) {
                console.log(`✅ Resource Quotas: ${quotas.body.items.length} found`);
                quotas.body.items.forEach(quota => {
                    console.log(`   - ${quota.metadata.name}`);
                    if (quota.spec.hard) {
                        Object.entries(quota.spec.hard).slice(0, 3).forEach(([resource, limit]) => {
                            console.log(`     ${resource}: ${limit}`);
                        });
                    }
                });
            } else {
                console.log(`⚠️  No resource quotas found`);
            }
        } catch (e) {
            console.log(`⚠️  ResourceQuota check failed: ${e.message}`);
        }

        // 3. Verify LimitRange
        try {
            const limits = await coreV1Api.listNamespacedLimitRange(namespaceName);
            if (limits.body.items.length > 0) {
                console.log(`✅ Limit Ranges: ${limits.body.items.length} found`);
                limits.body.items.forEach(lr => {
                    console.log(`   - ${lr.metadata.name}`);
                });
            } else {
                console.log(`⚠️  No limit ranges found`);
            }
        } catch (e) {
            console.log(`⚠️  LimitRange check failed: ${e.message}`);
        }

        // 4. Verify RBAC
        try {
            const roleBindings = await rbacV1Api.listNamespacedRoleBinding(namespaceName);
            if (roleBindings.body.items.length > 0) {
                console.log(`✅ Role Bindings: ${roleBindings.body.items.length} found`);
                roleBindings.body.items.forEach(rb => {
                    console.log(`   - ${rb.metadata.name} → ${rb.roleRef.name}`);
                });
            } else {
                console.log(`⚠️  No role bindings found`);
            }
        } catch (e) {
            console.log(`⚠️  RBAC check failed: ${e.message}`);
        }

        // 5. Verify NetworkPolicy
        try {
            const policies = await networkingV1Api.listNamespacedNetworkPolicy(namespaceName);
            if (policies.body.items.length > 0) {
                console.log(`✅ Network Policies: ${policies.body.items.length} found`);
                policies.body.items.forEach(np => {
                    console.log(`   - ${np.metadata.name}`);
                });
            } else {
                console.log(`⚠️  No network policies found (might be 'open' policy)`);
            }
        } catch (e) {
            console.log(`⚠️  NetworkPolicy check failed: ${e.message}`);
        }

        return true;
    } catch (error) {
        console.log(`❌ Failed to verify namespace: ${error.message}`);
        return false;
    }
}

async function testNamespaceListingAndDetails(namespaceName) {
    const token = createTestToken({ roles: ['platform:admin', 'namespace:admin'] });
    
    console.log(`\n📋 Testing Namespace API Endpoints...`);
    
    try {
        // Test namespace details endpoint
        console.log(`   Testing GET /api/platform/namespaces/${namespaceName}`);
        const detailsResponse = await axios.get(
            `${PLATFORM_API_URL}/api/platform/namespaces/${namespaceName}`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            }
        );
        console.log(`   ✅ Namespace details: ${detailsResponse.status}`);
        console.log(`      Team: ${detailsResponse.data.data.namespace.team}`);
        console.log(`      Environment: ${detailsResponse.data.data.namespace.environment}`);
        
        // Test list all namespaces endpoint
        console.log(`   Testing GET /api/platform/namespaces`);
        const listResponse = await axios.get(
            `${PLATFORM_API_URL}/api/platform/namespaces`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            }
        );
        console.log(`   ✅ Namespace list: ${listResponse.status}`);
        console.log(`      Total platform-managed namespaces: ${listResponse.data.data.namespaces.length}`);
        
        return true;
    } catch (error) {
        console.log(`   ❌ API endpoint test failed: ${error.response?.status} - ${error.message}`);
        return false;
    }
}

async function cleanupTestNamespaces(namespaceNames) {
    console.log(`\n🧹 Cleaning up test namespaces...`);
    const { coreV1Api } = setupKubernetesClient();
    
    for (const namespaceName of namespaceNames) {
        try {
            await coreV1Api.deleteNamespace(namespaceName);
            console.log(`   ✅ Deleted namespace: ${namespaceName}`);
        } catch (error) {
            console.log(`   ⚠️  Failed to delete ${namespaceName}: ${error.message}`);
        }
    }
}

// Main test suite
async function runPlatformAPITest() {
    console.log('🧪 Platform API Minikube Integration Test');
    console.log('==========================================');
    
    // Wait a bit for the API to be ready
    console.log('⏳ Waiting 3 seconds for API to be ready...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test 1: Health check
    const healthOk = await testHealthEndpoint();
    if (!healthOk) {
        console.log('\n❌ Health check failed. Make sure the API is running on port 3000');
        process.exit(1);
    }
    
    const testCases = [
        {
            name: 'Development Namespace Test',
            namespaceName: `dev-test-${Date.now()}`,
            team: 'platform-test',
            environment: 'development',
            resourceTier: 'small',
            networkPolicy: 'team-shared',
            features: ['monitoring-enhanced'],
            description: 'Test development namespace for Platform API testing',
            requestedBy: 'test-dev@company.com',
            useArgoWorkflows: false
        },
        {
            name: 'Production Namespace Test',
            namespaceName: `prod-test-${Date.now()}`,
            team: 'platform-test',
            environment: 'production',
            resourceTier: 'medium',
            networkPolicy: 'isolated',
            features: ['istio-injection', 'monitoring-enhanced', 'backup-enabled'],
            description: 'Test production namespace with enhanced security',
            requestedBy: 'test-prod@company.com',
            useArgoWorkflows: false
        }
    ];
    
    const createdNamespaces = [];
    let allTestsPassed = true;
    
    // Test 2: Namespace creation
    for (const testCase of testCases) {
        console.log(`\n${'='.repeat(60)}`);
        const result = await testNamespaceCreation(testCase);
        
        if (result.success) {
            createdNamespaces.push(result.namespaceName);
            
            // Give Kubernetes a moment to complete the creation
            console.log('⏳ Waiting 5 seconds for resources to be created...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Verify the resources were actually created
            const verificationPassed = await verifyKubernetesResources(result.namespaceName);
            if (!verificationPassed) {
                allTestsPassed = false;
            }
            
            // Test API endpoints
            const apiTestPassed = await testNamespaceListingAndDetails(result.namespaceName);
            if (!apiTestPassed) {
                allTestsPassed = false;
            }
        } else {
            allTestsPassed = false;
        }
    }
    
    // Test Results Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 TEST RESULTS SUMMARY');
    console.log(`${'='.repeat(60)}`);
    
    if (allTestsPassed && createdNamespaces.length > 0) {
        console.log('🎉 ALL TESTS PASSED!');
        console.log(`✅ Successfully created ${createdNamespaces.length} namespaces:`);
        createdNamespaces.forEach(ns => console.log(`   - ${ns}`));
        console.log('\n✨ Platform API direct provisioning is working correctly with Minikube!');
        
        console.log('\n🔍 You can verify the namespaces manually:');
        console.log(`   kubectl get namespaces -l platform.io/managed=true`);
        console.log(`   kubectl describe namespace ${createdNamespaces[0]}`);
    } else {
        console.log('❌ SOME TESTS FAILED');
        console.log('Check the logs above for details on what went wrong.');
    }
    
    // Optional cleanup
    console.log('\n❓ Would you like to clean up the test namespaces? (Running cleanup automatically in 10 seconds...)');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    if (createdNamespaces.length > 0) {
        await cleanupTestNamespaces(createdNamespaces);
    }
    
    console.log('\n🏁 Platform API Test Complete!');
}

// Check if this script is run directly
if (require.main === module) {
    runPlatformAPITest().catch(error => {
        console.error('\n💥 Test suite failed with error:', error);
        process.exit(1);
    });
}

module.exports = {
    runPlatformAPITest,
    testHealthEndpoint,
    testNamespaceCreation,
    verifyKubernetesResources
};