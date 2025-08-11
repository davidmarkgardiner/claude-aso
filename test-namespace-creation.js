const axios = require('axios');
const jwt = require('jsonwebtoken');
const k8s = require('@kubernetes/client-node');

// Load AKS kubeconfig
const kc = new k8s.KubeConfig();
kc.loadFromFile('./aks-admin');
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
const rbacV1Api = kc.makeApiClient(k8s.RbacAuthorizationV1Api);

const PLATFORM_API_URL = 'http://localhost:8080';

// Generate test JWT token
function createTestToken(userInfo) {
    return jwt.sign({
        sub: userInfo.id || 'test-user-123',
        email: userInfo.email,
        name: userInfo.name,
        groups: userInfo.groups || [userInfo.team],
        roles: userInfo.roles || ['platform:admin', 'namespace:admin', `team:${userInfo.team}:admin`],
        tenant: userInfo.team,
        iss: 'platform-api',
        aud: 'platform-users'
    }, 'change-me-in-production', { 
        expiresIn: '1h'
    });
}

async function createNamespaceViaAPI(namespaceRequest) {
    const token = createTestToken({
        email: namespaceRequest.owner.email,
        name: namespaceRequest.owner.name,
        team: namespaceRequest.team,
        roles: ['namespace:admin', 'platform:user']
    });

    console.log(`📝 Creating namespace: ${namespaceRequest.name}`);
    console.log(`   Team: ${namespaceRequest.team}`);
    console.log(`   Environment: ${namespaceRequest.environment}`);
    console.log(`   Features: ${namespaceRequest.features.join(', ')}`);
    
    // Update request to match API schema
    const apiRequest = {
        namespaceName: namespaceRequest.name,
        team: namespaceRequest.team,
        environment: namespaceRequest.environment,
        resourceTier: namespaceRequest.resourceTier,
        networkPolicy: namespaceRequest.networkPolicy || 'team-shared',
        features: namespaceRequest.features,
        description: namespaceRequest.description,
        costCenter: namespaceRequest.costCenter || undefined
    };

    try {
        const response = await axios.post(
            `${PLATFORM_API_URL}/api/platform/namespaces/request`,
            apiRequest,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        console.log(`✅ API Response: ${response.status} - ${response.data.message || response.data.status}`);
        return { success: true, data: response.data };
    } catch (error) {
        console.log(`❌ API Error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
        return { success: false, error: error.response?.data || error.message };
    }
}

async function verifyNamespaceResources(namespaceName) {
    console.log(`\n🔍 Verifying resources created for namespace: ${namespaceName}`);
    
    try {
        // Check namespace exists
        const namespace = await coreV1Api.readNamespace(namespaceName);
        console.log(`✅ Namespace exists: ${namespaceName}`);
        console.log(`   Created: ${namespace.body.metadata.creationTimestamp}`);
        
        // Check labels and annotations
        if (namespace.body.metadata.labels) {
            console.log(`   Labels:`);
            Object.entries(namespace.body.metadata.labels).forEach(([key, value]) => {
                console.log(`     ${key}: ${value}`);
            });
        }
        
        if (namespace.body.metadata.annotations) {
            console.log(`   Annotations:`);
            Object.entries(namespace.body.metadata.annotations).slice(0, 5).forEach(([key, value]) => {
                console.log(`     ${key}: ${value}`);
            });
        }
        
        // Check ResourceQuota
        try {
            const quotas = await coreV1Api.listNamespacedResourceQuota(namespaceName);
            if (quotas.body.items.length > 0) {
                console.log(`✅ Resource Quotas: ${quotas.body.items.length} found`);
                quotas.body.items.forEach(quota => {
                    console.log(`   - ${quota.metadata.name}`);
                    if (quota.spec.hard) {
                        Object.entries(quota.spec.hard).forEach(([resource, limit]) => {
                            console.log(`     ${resource}: ${limit}`);
                        });
                    }
                });
            }
        } catch (e) {
            console.log(`   No resource quotas found`);
        }
        
        // Check LimitRanges
        try {
            const limits = await coreV1Api.listNamespacedLimitRange(namespaceName);
            if (limits.body.items.length > 0) {
                console.log(`✅ Limit Ranges: ${limits.body.items.length} found`);
            }
        } catch (e) {
            console.log(`   No limit ranges found`);
        }
        
        // Check RoleBindings
        try {
            const roleBindings = await rbacV1Api.listNamespacedRoleBinding(namespaceName);
            if (roleBindings.body.items.length > 0) {
                console.log(`✅ Role Bindings: ${roleBindings.body.items.length} found`);
                roleBindings.body.items.forEach(rb => {
                    console.log(`   - ${rb.metadata.name} (role: ${rb.roleRef.name})`);
                });
            }
        } catch (e) {
            console.log(`   No role bindings found`);
        }
        
        // Check NetworkPolicies
        try {
            const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
            const policies = await networkingApi.listNamespacedNetworkPolicy(namespaceName);
            if (policies.body.items.length > 0) {
                console.log(`✅ Network Policies: ${policies.body.items.length} found`);
            }
        } catch (e) {
            console.log(`   No network policies found`);
        }
        
        return true;
    } catch (error) {
        console.log(`❌ Failed to verify namespace: ${error.message}`);
        return false;
    }
}

async function runFullTest() {
    console.log('🧪 Platform API Namespace Creation Test\n');
    
    // Test 1: Development namespace
    const devNamespace = {
        name: `dev-team-alpha-${Date.now()}`,
        team: 'team-alpha',
        environment: 'development',
        resourceTier: 'small',
        networkPolicy: 'team-shared',
        features: ['istio-injection', 'monitoring-enhanced'],
        owner: {
            name: 'Alice Developer',
            email: 'alice@company.com',
            id: 'alice-123'
        },
        description: 'Development namespace for Team Alpha'
    };
    
    console.log('🏗️ Test 1: Creating Development Namespace');
    const result1 = await createNamespaceViaAPI(devNamespace);
    
    if (result1.success) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for async creation
        await verifyNamespaceResources(devNamespace.name);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test 2: Production namespace  
    const prodNamespace = {
        name: `prod-team-beta-${Date.now()}`,
        team: 'team-beta',
        environment: 'production',
        resourceTier: 'large',
        networkPolicy: 'isolated',
        features: ['istio-injection', 'monitoring-enhanced', 'backup-enabled'],
        owner: {
            name: 'Bob Lead',
            email: 'bob@company.com',
            id: 'bob-456'
        },
        description: 'Production namespace for Team Beta with enhanced features'
    };
    
    console.log('🏗️ Test 2: Creating Production Namespace');
    const result2 = await createNamespaceViaAPI(prodNamespace);
    
    if (result2.success) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for async creation
        await verifyNamespaceResources(prodNamespace.name);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Test 3: List all managed namespaces
    console.log('📋 Listing all Platform-managed namespaces:');
    try {
        const allNamespaces = await coreV1Api.listNamespace(
            undefined, undefined, undefined, undefined, 
            'platform.io/managed=true'
        );
        
        console.log(`✅ Found ${allNamespaces.body.items.length} platform-managed namespaces:`);
        allNamespaces.body.items.forEach(ns => {
            const team = ns.metadata.labels?.['platform.io/team'] || 'unknown';
            const env = ns.metadata.labels?.['platform.io/environment'] || 'unknown';
            const created = new Date(ns.metadata.creationTimestamp).toLocaleString();
            console.log(`   - ${ns.metadata.name} (team: ${team}, env: ${env}, created: ${created})`);
        });
        
    } catch (error) {
        console.log(`❌ Failed to list namespaces: ${error.message}`);
    }
    
    console.log('\n🎉 Platform API Testing Complete!');
    console.log('\nYou should now see the created namespaces and their resources in your AKS cluster.');
    console.log('Use: kubectl get namespaces -l platform.io/managed=true');
}

// Run the test
runFullTest().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});