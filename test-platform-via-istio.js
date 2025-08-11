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

console.log('🔑 Created platform admin token for Istio testing');

async function testPlatformAPIViaIstio() {
    const PLATFORM_API_URL = 'https://platform-api.davidmarkgardiner.co.uk';
    
    try {
        console.log('\n1️⃣ Testing Platform API via Istio Virtual Service...');
        console.log(`🌐 URL: ${PLATFORM_API_URL}`);
        
        console.log('\n2️⃣ Testing basic health endpoint...');
        const healthResponse = await axios.get(`${PLATFORM_API_URL}/health`, {
            timeout: 30000,
            headers: {
                'Host': 'platform-api.davidmarkgardiner.co.uk'
            }
        });
        console.log(`✅ Health check: ${healthResponse.status} - ${healthResponse.data.status}`);
        
        console.log('\n3️⃣ Testing namespace creation via Istio gateway...');
        
        const namespaceRequest = {
            namespaceName: `test-istio-${Date.now()}`,
            team: 'platform-test',
            environment: 'development', 
            resourceTier: 'small',
            networkPolicy: 'team-shared',
            features: ['istio-injection'],
            description: 'Test namespace created via Istio gateway'
        };
        
        console.log(`📝 Creating namespace: ${namespaceRequest.namespaceName}`);
        console.log(`   Request body:`, JSON.stringify(namespaceRequest, null, 2));
        
        const response = await axios.post(
            `${PLATFORM_API_URL}/api/platform/namespaces/request`,
            namespaceRequest,
            {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json',
                    'Host': 'platform-api.davidmarkgardiner.co.uk'
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
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.log('🔍 DNS or connection issue - checking if domain resolves...');
        }
        return { success: false, error: error.response?.data || error.message };
    }
}

testPlatformAPIViaIstio().then(result => {
    if (result.success) {
        console.log('\n🎉 Platform API Istio integration test SUCCESSFUL!');
        console.log(`✨ Namespace created via Istio gateway: ${result.namespaceName}`);
        console.log('🚀 Platform API is now accessible via https://platform-api.davidmarkgardiner.co.uk');
    } else {
        console.log('\n❌ Platform API Istio integration test failed. Check the logs above for details.');
        console.log('💡 This might be due to DNS propagation delay or Istio gateway configuration.');
    }
});