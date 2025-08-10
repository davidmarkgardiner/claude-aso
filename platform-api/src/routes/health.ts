import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getKubernetesClient } from '../services/kubernetesClient';
import { ArgoWorkflowsClient } from '../services/argoWorkflowsClient';
import { logger } from '../utils/logger';
import { config } from '../config/config';

const router = Router();

// GET /health - Basic health check
router.get('/',
  asyncHandler(async (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.nodeEnv
    });
  })
);

// GET /health/detailed - Detailed health check including dependencies
router.get('/detailed',
  asyncHandler(async (req, res) => {
    const checks = await Promise.allSettled([
      checkKubernetes(),
      checkArgoWorkflows(),
      checkRedis(),
      checkDatabase()
    ]);

    const healthChecks = {
      kubernetes: getCheckResult(checks[0]),
      argoWorkflows: getCheckResult(checks[1]),
      redis: getCheckResult(checks[2]),
      database: getCheckResult(checks[3])
    };

    const overallHealthy = Object.values(healthChecks).every(check => check.healthy);
    const httpStatus = overallHealthy ? 200 : 503;

    res.status(httpStatus).json({
      status: overallHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.nodeEnv,
      checks: healthChecks,
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    });
  })
);

// GET /health/ready - Kubernetes readiness probe
router.get('/ready',
  asyncHandler(async (req, res) => {
    try {
      // Check if critical services are available
      const k8sClient = getKubernetesClient();
      const k8sHealth = await k8sClient.healthCheck();
      
      if (!k8sHealth.healthy) {
        throw new Error('Kubernetes connection not ready');
      }

      res.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        status: 'not ready',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  })
);

// GET /health/live - Kubernetes liveness probe
router.get('/live',
  asyncHandler(async (req, res) => {
    // Basic liveness check - just verify the service is running
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  })
);

// Helper functions for health checks
async function checkKubernetes(): Promise<{ healthy: boolean; message?: string; details?: any }> {
  try {
    const k8sClient = getKubernetesClient();
    const health = await k8sClient.healthCheck();
    
    return {
      healthy: health.healthy,
      message: health.healthy ? 'Connected' : 'Connection failed',
      details: {
        context: health.context,
        server: health.server
      }
    };
  } catch (error) {
    return {
      healthy: false,
      message: error.message,
      details: { error: 'Connection error' }
    };
  }
}

async function checkArgoWorkflows(): Promise<{ healthy: boolean; message?: string; details?: any }> {
  try {
    const argoClient = new ArgoWorkflowsClient();
    const health = await argoClient.healthCheck();
    
    return {
      healthy: health.healthy,
      message: health.healthy ? 'Connected' : 'Connection failed',
      details: {
        version: health.version || 'unknown'
      }
    };
  } catch (error) {
    return {
      healthy: false,
      message: error.message,
      details: { error: 'Connection error' }
    };
  }
}

async function checkRedis(): Promise<{ healthy: boolean; message?: string; details?: any }> {
  try {
    // In production, you would actually test Redis connection
    // For now, just check if Redis URL is configured
    const redisConfigured = !!config.redis.url;
    
    return {
      healthy: redisConfigured,
      message: redisConfigured ? 'Configured' : 'Not configured',
      details: {
        url: config.redis.url ? 'configured' : 'not configured'
      }
    };
  } catch (error) {
    return {
      healthy: false,
      message: error.message,
      details: { error: 'Configuration error' }
    };
  }
}

async function checkDatabase(): Promise<{ healthy: boolean; message?: string; details?: any }> {
  try {
    // In production, you would actually test database connection
    // For now, just check if database is configured
    const dbConfigured = !!(config.database.host && config.database.database);
    
    return {
      healthy: dbConfigured,
      message: dbConfigured ? 'Configured' : 'Not configured',
      details: {
        host: config.database.host || 'not configured',
        database: config.database.database || 'not configured'
      }
    };
  } catch (error) {
    return {
      healthy: false,
      message: error.message,
      details: { error: 'Configuration error' }
    };
  }
}

function getCheckResult(settledResult: PromiseSettledResult<{ healthy: boolean; message?: string; details?: any }>): any {
  if (settledResult.status === 'fulfilled') {
    return settledResult.value;
  } else {
    return {
      healthy: false,
      message: 'Health check failed',
      details: { error: settledResult.reason?.message || 'Unknown error' }
    };
  }
}

// GET /health/metrics - Prometheus-style metrics endpoint
router.get('/metrics',
  asyncHandler(async (req, res) => {
    // In production, this would expose actual Prometheus metrics
    const metrics = `
# HELP platform_api_requests_total Total number of API requests
# TYPE platform_api_requests_total counter
platform_api_requests_total{method="GET",status="200"} 1247
platform_api_requests_total{method="POST",status="201"} 89
platform_api_requests_total{method="POST",status="400"} 12

# HELP platform_api_request_duration_seconds API request duration
# TYPE platform_api_request_duration_seconds histogram
platform_api_request_duration_seconds_bucket{le="0.1"} 892
platform_api_request_duration_seconds_bucket{le="0.5"} 1156
platform_api_request_duration_seconds_bucket{le="1.0"} 1298
platform_api_request_duration_seconds_bucket{le="2.0"} 1334
platform_api_request_duration_seconds_bucket{le="+Inf"} 1348

# HELP platform_namespaces_total Total number of managed namespaces
# TYPE platform_namespaces_total gauge
platform_namespaces_total 47

# HELP platform_namespace_provisioning_duration_seconds Namespace provisioning time
# TYPE platform_namespace_provisioning_duration_seconds histogram
platform_namespace_provisioning_duration_seconds_bucket{le="60"} 0
platform_namespace_provisioning_duration_seconds_bucket{le="180"} 23
platform_namespace_provisioning_duration_seconds_bucket{le="300"} 78
platform_namespace_provisioning_duration_seconds_bucket{le="600"} 89
platform_namespace_provisioning_duration_seconds_bucket{le="+Inf"} 89

# HELP platform_api_info API information
# TYPE platform_api_info gauge
platform_api_info{version="1.0.0",environment="${config.nodeEnv}"} 1
`.trim();

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  })
);

export { router as healthRouter };