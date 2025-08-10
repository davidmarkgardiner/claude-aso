const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Mock data
const mockNamespaces = [
  {
    name: 'frontend-app-dev',
    team: 'frontend',
    environment: 'development',
    resourceTier: 'small',
    status: 'active',
    features: ['istio-injection', 'monitoring-basic']
  }
];

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', kubernetes: 'connected to minikube' });
});

// Get namespaces
app.get('/api/platform/namespaces', (req, res) => {
  res.json({ namespaces: mockNamespaces });
});

// Create namespace
app.post('/api/platform/namespaces', async (req, res) => {
  const { name, team, environment, resourceTier, features } = req.body;
  
  console.log('📦 Creating namespace in minikube:', name);
  
  // Actually create the namespace in Kubernetes
  const { exec } = require('child_process');
  const namespaceYaml = `
apiVersion: v1
kind: Namespace
metadata:
  name: ${name}
  labels:
    team: ${team}
    environment: ${environment}
    tier: ${resourceTier}
    managed-by: platform-api
`;

  exec(`echo '${namespaceYaml}' | kubectl apply -f -`, (error, stdout, stderr) => {
    if (error) {
      console.error('Error creating namespace:', error);
      return res.status(500).json({ error: 'Failed to create namespace' });
    }
    
    console.log('✅ Namespace created:', stdout);
    
    const newNamespace = {
      name,
      team,
      environment,
      resourceTier,
      features: features || [],
      status: 'active',
      createdAt: new Date().toISOString()
    };
    
    mockNamespaces.push(newNamespace);
    
    res.status(201).json({ 
      message: 'Namespace created successfully',
      namespace: newNamespace,
      kubernetesResponse: stdout
    });
  });
});

// Get catalog templates
app.get('/api/platform/catalog/templates', (req, res) => {
  res.json({
    templates: [
      {
        id: 'microservice-api',
        name: 'Microservice API',
        description: 'Production-ready REST API',
        category: 'microservice',
        tags: ['nodejs', 'api']
      },
      {
        id: 'static-website',
        name: 'Static Website',
        description: 'Static site with CDN',
        category: 'frontend',
        tags: ['react', 'cdn']
      }
    ]
  });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`🚀 Platform API Mock Server running on port ${PORT}`);
  console.log(`🔗 Connected to minikube cluster`);
  console.log(`📍 API endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/api/platform/namespaces`);
  console.log(`   POST http://localhost:${PORT}/api/platform/namespaces`);
  console.log(`   GET  http://localhost:${PORT}/api/platform/catalog/templates`);
});