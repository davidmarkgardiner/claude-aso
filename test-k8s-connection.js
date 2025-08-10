const k8s = require('@kubernetes/client-node');

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

console.log('🔍 Testing Kubernetes connection to minikube...\n');

async function testConnection() {
  try {
    console.log('📡 Current context:', kc.getCurrentContext());
    console.log('🏠 Current cluster:', kc.getCurrentCluster()?.server);
    
    // Test basic API access
    console.log('\n🌐 Testing API access...');
    const response = await k8sApi.listNode();
    console.log(`✅ Successfully connected! Found ${response.body.items.length} nodes:`);
    
    response.body.items.forEach((node, index) => {
      console.log(`   ${index + 1}. ${node.metadata.name} (${node.status.conditions.find(c => c.type === 'Ready')?.status})`);
    });
    
    // Test namespace access
    console.log('\n📁 Testing namespace access...');
    const nsResponse = await k8sApi.listNamespace();
    console.log(`✅ Found ${nsResponse.body.items.length} namespaces:`);
    
    nsResponse.body.items.slice(0, 5).forEach((ns, index) => {
      console.log(`   ${index + 1}. ${ns.metadata.name} (${ns.status.phase})`);
    });
    
    console.log('\n🎉 Platform API can successfully connect to minikube!');
    console.log('✨ Ready to test platform API with minikube cluster');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.statusCode);
      console.error('Details:', error.response.body?.message || 'Unknown error');
    }
  }
}

testConnection();