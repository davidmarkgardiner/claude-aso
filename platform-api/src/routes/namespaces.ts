import { Router } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../middleware/errorHandler';
import { requireRole, requireTeamAccess } from '../middleware/auth';
import { strictRateLimit, teamRateLimit } from '../middleware/rateLimit';
import { validateAzureADPrincipal } from '../middleware/azureAdValidation';
import { getProvisioningService, NamespaceRequest } from '../services/namespaceProvisioning';
import { getRBACService } from '../services/rbacService';
import { getClusterConfigService } from '../config/clusters';
import { AKS_ROLE_DEFINITIONS } from '../types/rbac';
import { logger } from '../utils/logger';

const router = Router();
const provisioningService = getProvisioningService();
const rbacService = getRBACService();
const clusterConfigService = getClusterConfigService();

// Validation schemas
const namespaceRequestSchema = Joi.object({
  namespaceName: Joi.string()
    .pattern(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
    .min(1)
    .max(63)
    .required()
    .messages({
      'string.pattern.base': 'Namespace name must be lowercase alphanumeric with hyphens'
    }),
  
  team: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .min(2)
    .max(32)
    .required(),
  
  environment: Joi.string()
    .valid('development', 'staging', 'production')
    .required(),
  
  resourceTier: Joi.string()
    .valid('micro', 'small', 'medium', 'large')
    .required(),
  
  networkPolicy: Joi.string()
    .valid('isolated', 'team-shared', 'open')
    .required(),
  
  features: Joi.array()
    .items(Joi.string().valid(
      'istio-injection',
      'monitoring-enhanced',
      'backup-enabled',
      'gpu-access',
      'database-access',
      'external-ingress'
    ))
    .default([]),
  
  description: Joi.string()
    .max(500)
    .optional(),
  
  costCenter: Joi.string()
    .max(50)
    .optional(),
  
  // RBAC integration options
  rbacConfig: Joi.object({
    principalId: Joi.string()
      .guid()
      .required()
      .messages({
        'string.guid': 'Principal ID must be a valid GUID'
      }),
    principalType: Joi.string()
      .valid('User', 'Group')
      .default('User'),
    roleDefinition: Joi.string()
      .valid(...Object.keys(AKS_ROLE_DEFINITIONS))
      .default('aks-rbac-admin'),
    clusterName: Joi.string()
      .optional()
  }).optional()
});

// POST /api/platform/namespaces/request - Request a new namespace
router.post('/request',
  strictRateLimit, // Apply strict rate limiting for namespace creation
  requireRole(['namespace:admin', 'namespace:developer']),
  requireTeamAccess,
  asyncHandler(async (req, res) => {
    const { error, value } = namespaceRequestSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid request data',
        details: error.details.map(d => ({ 
          field: d.path.join('.'), 
          message: d.message 
        })),
        timestamp: new Date().toISOString()
      });
    }

    const namespaceRequest: NamespaceRequest = {
      ...value,
      requestedBy: req.user!.email
    };

    try {
      const result = await provisioningService.provisionNamespace(namespaceRequest);
      
      // If RBAC configuration is provided, provision RBAC alongside namespace
      let rbacResult = null;
      if (value.rbacConfig) {
        try {
          rbacResult = await rbacService.provisionNamespaceRBAC(
            namespaceRequest.namespaceName,
            namespaceRequest.team,
            namespaceRequest.environment,
            {
              principalId: value.rbacConfig.principalId,
              principalType: value.rbacConfig.principalType,
              roleDefinition: value.rbacConfig.roleDefinition,
              clusterName: value.rbacConfig.clusterName
            }
          );

          logger.info('RBAC provisioning completed', {
            requestId: result.requestId,
            namespaceName: namespaceRequest.namespaceName,
            rbacStatus: rbacResult.status,
            roleAssignmentCount: rbacResult.roleAssignmentIds.length
          });
        } catch (rbacError) {
          logger.error('RBAC provisioning failed', {
            requestId: result.requestId,
            namespaceName: namespaceRequest.namespaceName,
            error: rbacError.message
          });
          // Continue with namespace provisioning even if RBAC fails
        }
      }
      
      logger.info('Namespace provision request submitted', {
        requestId: result.requestId,
        namespaceName: namespaceRequest.namespaceName,
        team: namespaceRequest.team,
        requestedBy: req.user!.email,
        rbacEnabled: !!rbacResult
      });

      const responseData = {
        ...result,
        rbac: rbacResult ? {
          status: rbacResult.status,
          roleAssignmentIds: rbacResult.roleAssignmentIds,
          message: rbacResult.message
        } : null
      };

      res.status(202).json({
        success: true,
        data: responseData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Namespace provisioning failed', {
        namespaceName: namespaceRequest.namespaceName,
        error: error.message,
        requestedBy: req.user!.email
      });

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'ConflictError',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }

      if (error.message.includes('quota limit') || error.message.includes('Invalid')) {
        return res.status(400).json({
          error: 'ValidationError',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }

      throw error; // Let error handler handle other errors
    }
  })
);

// GET /api/platform/namespaces/request/:requestId/status - Get provisioning status
router.get('/request/:requestId/status',
  requireRole(['namespace:admin', 'namespace:developer']),
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    const result = await provisioningService.getProvisioningStatus(requestId);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  })
);

// DELETE /api/platform/namespaces/request/:requestId - Cancel provisioning request
router.delete('/request/:requestId',
  requireRole(['namespace:admin', 'namespace:developer']),
  asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    await provisioningService.cancelProvisioning(requestId, req.user!.email);
    
    res.json({
      success: true,
      message: 'Provisioning request cancelled successfully',
      timestamp: new Date().toISOString()
    });
  })
);

// GET /api/platform/namespaces/team/:team - List team namespaces
router.get('/team/:team',
  teamRateLimit,
  requireRole(['namespace:admin', 'namespace:developer']),
  requireTeamAccess,
  asyncHandler(async (req, res) => {
    const { team } = req.params;
    
    const namespaces = await provisioningService.listTeamNamespaces(team);
    
    const namespaceList = namespaces.map(ns => ({
      name: ns.metadata?.name,
      creationTimestamp: ns.metadata?.creationTimestamp,
      labels: ns.metadata?.labels,
      annotations: ns.metadata?.annotations,
      status: ns.status?.phase
    }));

    res.json({
      success: true,
      data: {
        team,
        count: namespaceList.length,
        namespaces: namespaceList
      },
      timestamp: new Date().toISOString()
    });
  })
);

// GET /api/platform/namespaces/:namespaceName - Get namespace details
router.get('/:namespaceName',
  requireRole(['namespace:admin', 'namespace:developer']),
  asyncHandler(async (req, res) => {
    const { namespaceName } = req.params;
    
    // Check team access for the namespace
    try {
      const namespaceDetails = await provisioningService.getNamespaceDetails(namespaceName);
      
      // Check if user has access to this namespace's team
      const namespaceTeam = namespaceDetails.namespace.metadata?.labels?.['platform.io/team'];
      if (namespaceTeam && !req.user!.roles.includes('platform:admin')) {
        const hasTeamAccess = req.user!.roles.some(role => 
          role.startsWith(`team:${namespaceTeam}:`)
        );
        
        if (!hasTeamAccess) {
          return res.status(403).json({
            error: 'AuthorizationError',
            message: `Access denied to namespace: ${namespaceName}`,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      res.json({
        success: true,
        data: {
          namespace: {
            name: namespaceDetails.namespace.metadata?.name,
            team: namespaceTeam,
            environment: namespaceDetails.namespace.metadata?.labels?.['platform.io/environment'],
            creationTimestamp: namespaceDetails.namespace.metadata?.creationTimestamp,
            labels: namespaceDetails.namespace.metadata?.labels,
            annotations: namespaceDetails.namespace.metadata?.annotations
          },
          resourceUsage: namespaceDetails.resourceUsage,
          networkPolicies: namespaceDetails.networkPolicies.map(np => ({
            name: np.metadata?.name,
            creationTimestamp: np.metadata?.creationTimestamp
          }))
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Namespace ${namespaceName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// GET /api/platform/namespaces/:namespaceName/cost - Get namespace cost information
router.get('/:namespaceName/cost',
  requireRole(['namespace:admin', 'namespace:developer']),
  asyncHandler(async (req, res) => {
    const { namespaceName } = req.params;
    const { timeRange = '7d' } = req.query;
    
    // This would integrate with KubeCost or similar cost tracking service
    // For now, return mock data
    const mockCostData = {
      namespace: namespaceName,
      timeRange,
      totalCost: '$125.50',
      breakdown: {
        compute: '$75.30',
        storage: '$35.20',
        network: '$15.00'
      },
      trend: 'increasing',
      recommendations: [
        'Consider reducing CPU requests for idle pods',
        'Storage usage is within optimal range',
        'Network costs are higher than average'
      ]
    };

    res.json({
      success: true,
      data: mockCostData,
      timestamp: new Date().toISOString()
    });
  })
);

// GET /api/platform/namespaces - List all namespaces (admin only)
router.get('/',
  requireRole(['platform:admin']),
  asyncHandler(async (req, res) => {
    const { team, environment, limit = 100, offset = 0 } = req.query;
    
    let labelSelector = 'platform.io/managed=true';
    if (team) labelSelector += `,platform.io/team=${team}`;
    if (environment) labelSelector += `,platform.io/environment=${environment}`;
    
    const k8sClient = getProvisioningService()['k8sClient'];
    const allNamespaces = await k8sClient.listNamespaces(labelSelector);
    
    // Apply pagination
    const startIndex = Number(offset);
    const endIndex = startIndex + Number(limit);
    const paginatedNamespaces = allNamespaces.slice(startIndex, endIndex);
    
    const namespaceList = paginatedNamespaces.map(ns => ({
      name: ns.metadata?.name,
      team: ns.metadata?.labels?.['platform.io/team'],
      environment: ns.metadata?.labels?.['platform.io/environment'],
      creationTimestamp: ns.metadata?.creationTimestamp,
      status: ns.status?.phase
    }));

    res.json({
      success: true,
      data: {
        namespaces: namespaceList,
        pagination: {
          total: allNamespaces.length,
          offset: Number(offset),
          limit: Number(limit),
          hasMore: endIndex < allNamespaces.length
        }
      },
      timestamp: new Date().toISOString()
    });
  })
);

// GET /api/platform/namespaces/:namespaceName/rbac - Get RBAC status for namespace
router.get('/:namespaceName/rbac',
  requireRole(['namespace:admin', 'namespace:developer']),
  asyncHandler(async (req, res) => {
    const { namespaceName } = req.params;
    const { clusterName } = req.query;
    
    try {
      const rbacStatus = await rbacService.getRBACStatus(namespaceName, clusterName as string);
      
      res.json({
        success: true,
        data: rbacStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `RBAC configuration for namespace ${namespaceName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// POST /api/platform/namespaces/:namespaceName/rbac - Add RBAC to existing namespace
router.post('/:namespaceName/rbac',
  requireRole(['namespace:admin']),
  validateAzureADPrincipal('principalId'),
  asyncHandler(async (req, res) => {
    const { namespaceName } = req.params;
    const { principalId, principalType, roleDefinition, clusterName } = req.body;
    
    try {
      // Get namespace details to extract team info
      const namespaceDetails = await provisioningService.getNamespaceDetails(namespaceName);
      const teamName = namespaceDetails.namespace.metadata?.labels?.['platform.io/team'];
      const environment = namespaceDetails.namespace.metadata?.labels?.['platform.io/environment'];
      
      if (!teamName || !environment) {
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Namespace must have team and environment labels',
          timestamp: new Date().toISOString()
        });
      }
      
      const rbacResult = await rbacService.provisionNamespaceRBAC(
        namespaceName,
        teamName,
        environment,
        {
          principalId,
          principalType: principalType || 'User',
          roleDefinition: roleDefinition || 'aks-rbac-admin',
          clusterName
        }
      );

      res.status(201).json({
        success: true,
        data: rbacResult,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Namespace ${namespaceName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// DELETE /api/platform/namespaces/:namespaceName/rbac - Remove RBAC from namespace
router.delete('/:namespaceName/rbac',
  requireRole(['namespace:admin']),
  asyncHandler(async (req, res) => {
    const { namespaceName } = req.params;
    const { clusterName } = req.query;
    
    try {
      await rbacService.removeNamespaceRBAC(namespaceName, clusterName as string);
      
      res.json({
        success: true,
        message: `RBAC removed from namespace ${namespaceName}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `RBAC configuration for namespace ${namespaceName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// GET /api/platform/clusters - List available clusters
router.get('/clusters',
  requireRole(['namespace:admin', 'namespace:developer']),
  asyncHandler(async (req, res) => {
    const clusters = clusterConfigService.getAllClusters();
    
    const clusterList = clusters.map(cluster => ({
      name: cluster.name,
      environment: cluster.environment,
      region: cluster.region,
      resourceGroup: cluster.resourceGroup,
      isDefault: cluster.isDefault || false
    }));

    res.json({
      success: true,
      data: {
        clusters: clusterList,
        count: clusterList.length
      },
      timestamp: new Date().toISOString()
    });
  })
);

export { router as namespaceRouter };