const jwt = require('jsonwebtoken');
const axios = require('axios');

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

console.log('🔑 Created platform admin token for HTTP testing');

async function testPlatformAPIViaHTTP() {
    const PLATFORM_API_URL = 'http://platform-api.davidmarkgardiner.co.uk';
    
    try {
        console.log('\n1️⃣ Testing Platform API via HTTP Istio gateway...');
        console.log(`🌐 URL: ${PLATFORM_API_URL}`);
        
        console.log('\n2️⃣ Testing basic health endpoint...');
        const healthResponse = await axios.get(`${PLATFORM_API_URL}/health`, {
            timeout: 30000,
            headers: {
                'Host': 'platform-api.davidmarkgardiner.co.uk'
            }
        });
        console.log(`✅ Health check: ${healthResponse.status} - ${healthResponse.data.status}`);
        
        console.log('\n3️⃣ Testing namespace creation via HTTP gateway...');
        
        const namespaceRequest = {
            namespaceName: `test-http-${Date.now()}`,
            team: 'platform-test',
            environment: 'development', 
            resourceTier: 'small',
            networkPolicy: 'team-shared',
            features: ['istio-injection'],
            description: 'Test namespace created via HTTP Istio gateway'
        };
        
        console.log(`📝 Creating namespace: ${namespaceRequest.namespaceName}`);
        
        const response = await axios.post(
            `${PLATFORM_API_URL}/api/platform/namespaces/request`,
            namespaceRequest,
            {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json',
                    'Host': 'platform-api.davidmarkgardiner.co.uk'
                },
                timeout: 60000
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
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.log('🔍 DNS or connection issue - checking if domain resolves...');
        }
        return { success: false, error: error.response?.data || error.message };
    }
}

testPlatformAPIViaHTTP().then(result => {
    if (result.success) {
        console.log('\n🎉 Platform API HTTP integration test SUCCESSFUL!');
        console.log(`✨ Namespace created via HTTP Istio gateway: ${result.namespaceName}`);
        console.log('🚀 Platform API is accessible via HTTP (http://platform-api.davidmarkgardiner.co.uk)');
        console.log('💡 Next step: Set up TLS certificate for HTTPS access');
    } else {
        console.log('\n❌ Platform API HTTP integration test failed.');
    }
});