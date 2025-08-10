const k8s = require('@kubernetes/client-node');

// Create a new kubeconfig
const kc = new k8s.KubeConfig();

// Load from the AKS kubeconfig file
kc.loadFromFile('./platform-aks-kubeconfig');

// Create API clients
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
const appsV1Api = kc.makeApiClient(k8s.AppsV1Api);

async function testConnection() {
    try {
        console.log('🔍 Testing AKS cluster connection...');
        console.log(`📍 Current context: ${kc.getCurrentContext()}`);
        
        // Test basic connectivity
        const namespaces = await coreV1Api.listNamespace();
        console.log(`✅ Successfully connected to AKS cluster!`);
        console.log(`📝 Found ${namespaces.body.items.length} namespaces:`);
        
        namespaces.body.items.forEach(ns => {
            console.log(`   - ${ns.metadata.name} (${ns.status.phase})`);
        });

        // Test some common operations that Platform API would use
        console.log('\n🧪 Testing Platform API operations...');
        
        // Check if we can list pods in default namespace
        try {
            const pods = await coreV1Api.listNamespacedPod('default');
            console.log(`✅ Can list pods in default namespace: ${pods.body.items.length} pods`);
        } catch (error) {
            console.log(`⚠️  Cannot list pods in default namespace: ${error.message}`);
        }

        // Check if we can list deployments
        try {
            const deployments = await appsV1Api.listDeploymentForAllNamespaces();
            console.log(`✅ Can list deployments across all namespaces: ${deployments.body.items.length} deployments`);
        } catch (error) {
            console.log(`⚠️  Cannot list deployments: ${error.message}`);
        }

        // Check if Istio is available
        try {
            const istioNamespaces = namespaces.body.items.filter(ns => 
                ns.metadata.name.includes('istio')
            );
            if (istioNamespaces.length > 0) {
                console.log(`✅ Istio detected! Found namespaces: ${istioNamespaces.map(ns => ns.metadata.name).join(', ')}`);
            }
        } catch (error) {
            console.log('⚠️  Could not detect Istio');
        }

        console.log('\n🎉 Platform API should work great with this AKS cluster!');
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.statusCode);
            console.error('Response body:', error.response.body);
        }
        process.exit(1);
    }
}

testConnection();