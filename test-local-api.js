const jwt = require('jsonwebtoken');

// Create a proper platform admin token 
const adminToken = jwt.sign({
    sub: 'platform-admin-123',
    email: 'admin@company.com', 
    name: 'Platform Admin',
    groups: ['Platform-Admins'],
    roles: ['platform:admin', 'namespace:admin'],
    tenant: 'platform',
    iss: 'platform-api',
    aud: 'platform-users'
}, 'change-me-in-production', { expiresIn: '1h' });

console.log('🔑 Created platform admin token');
console.log('Token payload:', JSON.stringify(jwt.decode(adminToken), null, 2));

// Test the local API (port 3001)
const axios = require('axios');

async function testLocalPlatformAPI() {
    const PLATFORM_API_URL = 'http://localhost:3001';
    
    try {
        console.log('\n1️⃣ Testing basic health endpoint...');
        const healthResponse = await axios.get(`${PLATFORM_API_URL}/health`);
        console.log(`✅ Health check: ${healthResponse.status} - ${healthResponse.data.status}`);
        
        console.log('\n2️⃣ Testing namespace creation with platform admin...');
        
        const namespaceRequest = {
            namespaceName: `test-local-${Date.now()}`,
            team: 'platform-test',
            environment: 'development',
            resourceTier: 'small',
            networkPolicy: 'team-shared',
            features: ['istio-injection'],
            description: 'Test namespace created via local Platform API'
        };
        
        console.log(`📝 Creating namespace: ${namespaceRequest.namespaceName}`);
        console.log(`   Request body:`, JSON.stringify(namespaceRequest, null, 2));
        
        const response = await axios.post(
            `${PLATFORM_API_URL}/api/platform/namespaces/request`,
            namespaceRequest,
            {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // Increased timeout for resource creation
            }
        );
        
        console.log(`✅ Success! Status: ${response.status}`);
        console.log(`📊 Response:`, JSON.stringify(response.data, null, 2));
        
        return { success: true, data: response.data, namespaceName: namespaceRequest.namespaceName };
        
    } catch (error) {
        console.log(`❌ Error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
        if (error.response?.data) {
            console.log(`📄 Full error response:`, JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, error: error.response?.data || error.message };
    }
}

testLocalPlatformAPI().then(result => {
    if (result.success) {
        console.log('\n🎉 Local Platform API namespace creation test SUCCESSFUL!');
        console.log(`✨ Namespace created: ${result.namespaceName}`);
        console.log('Now let\'s verify the resources were created in the AKS cluster...');
    } else {
        console.log('\n❌ Local Platform API test failed. Check the logs above for details.');
    }
});