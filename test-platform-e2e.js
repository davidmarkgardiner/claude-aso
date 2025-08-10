const k8s = require('@kubernetes/client-node');
const axios = require('axios');

// Load AKS kubeconfig
const kc = new k8s.KubeConfig();
kc.loadFromFile('./platform-aks-kubeconfig');
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

const PLATFORM_API_URL = 'http://localhost:3003';
const TEST_NAMESPACE = `platform-test-${Date.now()}`;

async function waitForAPI() {
    console.log('⏳ Waiting for Platform API to be ready...');
    const maxRetries = 30;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            const response = await axios.get(`${PLATFORM_API_URL}/health`);
            if (response.status === 200) {
                console.log('✅ Platform API is ready!\n');
                return true;
            }
        } catch (error) {
            retries++;
            console.log(`   Attempt ${retries}/${maxRetries} failed, retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    throw new Error('Platform API failed to start');
}

async function testNamespaceCreation() {
    console.log('🧪 Testing Platform API Namespace Creation with AKS Cluster\n');
    
    try {
        // Wait for API to be ready
        await waitForAPI();
        
        // Create test payload for namespace creation
        console.log('📝 Creating test payload for namespace creation...');
        const namespaceRequest = {
            name: TEST_NAMESPACE,
            team: 'platform-test-team',
            environment: 'development',
            resourceTier: 'small',
            features: ['istio-injection'],
            owner: {
                name: 'Test User',
                email: 'test@example.com'
            },
            description: 'End-to-end test namespace for Platform API'
        };
        
        console.log(`   Namespace to create: ${TEST_NAMESPACE}`);
        console.log(`   Team: ${namespaceRequest.team}`);
        console.log(`   Features: ${namespaceRequest.features.join(', ')}\n`);
        
        // Step 1: Check namespace doesn't exist yet
        console.log('1️⃣ Checking if namespace already exists...');
        try {
            await coreV1Api.readNamespace(TEST_NAMESPACE);
            throw new Error(`Namespace ${TEST_NAMESPACE} already exists!`);
        } catch (error) {
            if (error.response && error.response.statusCode === 404) {
                console.log(`✅ Namespace ${TEST_NAMESPACE} doesn't exist (good)\n`);
            } else {
                throw error;
            }
        }
        
        // Step 2: Send API request to create namespace
        console.log('2️⃣ Sending API request to create namespace...');
        
        // Generate a simple test JWT token (in production this would come from Azure AD)
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({
            id: 'test-user-123',
            email: 'test@example.com',
            name: 'Test User',
            groups: ['platform-test-team'],
            roles: ['namespace:admin'],
            tenant: 'platform-test-team'
        }, 'dev-secret-key');
        
        const response = await axios.post(
            `${PLATFORM_API_URL}/api/v1/namespaces`,
            namespaceRequest,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log(`✅ API responded with status: ${response.status}`);
        console.log(`   Request ID: ${response.data.requestId || 'N/A'}`);
        console.log(`   Status: ${response.data.status || response.data.message}\n`);
        
        // Step 3: Wait and check if namespace was created in AKS
        console.log('3️⃣ Checking if namespace was created in AKS cluster...');
        
        // Wait a bit for async creation
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
            const namespace = await coreV1Api.readNamespace(TEST_NAMESPACE);
            console.log(`✅ Namespace ${TEST_NAMESPACE} successfully created in AKS!`);
            console.log(`   Creation time: ${namespace.body.metadata.creationTimestamp}`);
            
            // Check labels
            if (namespace.body.metadata.labels) {
                console.log(`   Labels:`);
                Object.entries(namespace.body.metadata.labels).forEach(([key, value]) => {
                    console.log(`     ${key}: ${value}`);
                });
            }
            
            // Check annotations
            if (namespace.body.metadata.annotations) {
                console.log(`   Annotations:`);
                Object.entries(namespace.body.metadata.annotations).forEach(([key, value]) => {
                    console.log(`     ${key}: ${value}`);
                });
            }
            
        } catch (error) {
            if (error.response && error.response.statusCode === 404) {
                console.log(`❌ Namespace ${TEST_NAMESPACE} was not created in AKS`);
                return false;
            } else {
                throw error;
            }
        }
        
        // Step 4: Clean up - delete the test namespace
        console.log('\n4️⃣ Cleaning up test namespace...');
        try {
            await coreV1Api.deleteNamespace(TEST_NAMESPACE);
            console.log(`✅ Test namespace ${TEST_NAMESPACE} deleted successfully\n`);
        } catch (error) {
            console.log(`⚠️  Could not delete test namespace: ${error.message}\n`);
        }
        
        console.log('🎉 End-to-End Test Results:');
        console.log('   ✅ Platform API connectivity: WORKING');
        console.log('   ✅ Namespace creation API: WORKING');
        console.log('   ✅ AKS cluster integration: WORKING');
        console.log('   ✅ Full workflow: SUCCESS!');
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('   API Response:', error.response.status, error.response.statusText);
            if (error.response.data) {
                console.error('   Response body:', JSON.stringify(error.response.data, null, 2));
            }
        }
        return false;
    }
}

// Run the test
testNamespaceCreation()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });