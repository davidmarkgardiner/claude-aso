const k8s = require('@kubernetes/client-node');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Load AKS kubeconfig
const kc = new k8s.KubeConfig();
kc.loadFromFile('./platform-aks-kubeconfig');
const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);

const app = express();
const PORT = 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Simple namespace creation endpoint
app.post('/api/v1/namespaces', async (req, res) => {
    try {
        console.log('🔄 Received namespace creation request:', req.body);
        
        const { name, team, environment, resourceTier, features, owner } = req.body;
        
        // Create namespace manifest
        const namespaceManifest = {
            metadata: {
                name: name,
                labels: {
                    'platform.managed': 'true',
                    'platform.team': team,
                    'platform.environment': environment,
                    'platform.tier': resourceTier,
                    'istio-injection': features.includes('istio-injection') ? 'enabled' : 'disabled'
                },
                annotations: {
                    'platform.created-by': 'platform-api',
                    'platform.owner': owner.email,
                    'platform.created-at': new Date().toISOString()
                }
            }
        };
        
        console.log('🏗️  Creating namespace in AKS cluster...');
        const result = await coreV1Api.createNamespace(namespaceManifest);
        
        console.log('✅ Namespace created successfully!');
        
        res.status(201).json({
            status: 'success',
            requestId: `req-${Date.now()}`,
            namespaceName: name,
            message: `Namespace ${name} created successfully`,
            kubernetesResponse: {
                uid: result.body.metadata.uid,
                creationTimestamp: result.body.metadata.creationTimestamp
            }
        });
        
    } catch (error) {
        console.error('❌ Error creating namespace:', error.message);
        
        if (error.response) {
            console.error('Kubernetes API error:', error.response.body);
            
            if (error.response.statusCode === 409) {
                return res.status(409).json({
                    status: 'error',
                    error: 'NamespaceAlreadyExists',
                    message: `Namespace ${req.body.name} already exists`
                });
            }
            
            if (error.response.statusCode === 403) {
                return res.status(403).json({
                    status: 'error',
                    error: 'Forbidden',
                    message: 'Insufficient permissions to create namespace'
                });
            }
        }
        
        res.status(500).json({
            status: 'error',
            error: 'InternalServerError',
            message: 'Failed to create namespace'
        });
    }
});

// List namespaces endpoint
app.get('/api/v1/namespaces', async (req, res) => {
    try {
        console.log('📋 Listing namespaces...');
        const result = await coreV1Api.listNamespace();
        
        const namespaces = result.body.items.map(ns => ({
            name: ns.metadata.name,
            status: ns.status.phase,
            createdAt: ns.metadata.creationTimestamp,
            labels: ns.metadata.labels || {},
            managedByPlatform: ns.metadata.labels?.['platform.managed'] === 'true'
        }));
        
        res.json({
            status: 'success',
            count: namespaces.length,
            namespaces: namespaces
        });
        
    } catch (error) {
        console.error('❌ Error listing namespaces:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Failed to list namespaces'
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Simple Platform API running on http://localhost:${PORT}`);
    console.log(`📍 Connected to AKS cluster: ${kc.getCurrentContext()}`);
    console.log(`✅ Ready to test namespace creation!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully');  
    process.exit(0);
});