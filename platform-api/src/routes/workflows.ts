import { Router } from 'express';
import Joi from 'joi';
import { asyncHandler } from '../middleware/errorHandler';
import { requireRole } from '../middleware/auth';
import { standardRateLimit } from '../middleware/rateLimit';
import { ArgoWorkflowsClient } from '../services/argoWorkflowsClient';
import { logger } from '../utils/logger';

const router = Router();
const argoClient = new ArgoWorkflowsClient();

// Validation schemas
const workflowSubmitSchema = Joi.object({
  workflowSpec: Joi.object().required(),
  namespace: Joi.string().optional()
});

const workflowListQuerySchema = Joi.object({
  namespace: Joi.string().optional(),
  labelSelector: Joi.string().optional(),
  limit: Joi.number().min(1).max(100).default(20)
});

// GET /api/platform/workflows/health - Check Argo Workflows health
router.get('/health',
  asyncHandler(async (_req, res) => {
    const health = await argoClient.healthCheck();
    
    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  })
);

// POST /api/platform/workflows - Submit a new workflow
router.post('/',
  standardRateLimit,
  requireRole(['workflow:admin', 'workflow:developer']),
  asyncHandler(async (req, res) => {
    const { error, value } = workflowSubmitSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid workflow specification',
        details: error.details.map(d => ({ 
          field: d.path.join('.'), 
          message: d.message 
        })),
        timestamp: new Date().toISOString()
      });
    }

    try {
      const workflow = await argoClient.submitWorkflow(value.workflowSpec);
      
      logger.info('Workflow submitted via API', {
        workflowId: workflow.metadata.name,
        namespace: workflow.metadata.namespace,
        submittedBy: req.user!.email
      });

      return res.status(201).json({
        success: true,
        data: workflow,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to submit workflow', {
        error: error instanceof Error ? error.message : String(error),
        submittedBy: req.user!.email
      });

      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'ConflictError',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }

      throw error;
    }
  })
);

// GET /api/platform/workflows - List workflows
router.get('/',
  requireRole(['workflow:admin', 'workflow:developer']),
  asyncHandler(async (req, res) => {
    const { error, value } = workflowListQuerySchema.validate(req.query);
    
    if (error) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid query parameters',
        details: error.details.map(d => ({ 
          field: d.path.join('.'), 
          message: d.message 
        })),
        timestamp: new Date().toISOString()
      });
    }

    const workflows = await argoClient.listWorkflows(
      value.namespace,
      value.labelSelector,
      value.limit
    );

    res.json({
      success: true,
      data: {
        workflows,
        count: workflows.length
      },
      timestamp: new Date().toISOString()
    });
  })
);

// GET /api/platform/workflows/:workflowName - Get workflow details
router.get('/:workflowName',
  requireRole(['workflow:admin', 'workflow:developer']),
  asyncHandler(async (req, res) => {
    const { workflowName } = req.params;
    const { namespace } = req.query;

    try {
      const workflow = await argoClient.getWorkflow(
        workflowName, 
        namespace as string | undefined
      );

      res.json({
        success: true,
        data: workflow,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Workflow ${workflowName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// GET /api/platform/workflows/:workflowName/status - Get workflow status
router.get('/:workflowName/status',
  requireRole(['workflow:admin', 'workflow:developer']),
  asyncHandler(async (req, res) => {
    const { workflowName } = req.params;
    const { namespace } = req.query;

    try {
      const status = await argoClient.getWorkflowStatus(
        workflowName,
        namespace as string | undefined
      );

      res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Workflow ${workflowName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// GET /api/platform/workflows/:workflowName/logs - Get workflow logs
router.get('/:workflowName/logs',
  requireRole(['workflow:admin', 'workflow:developer']),
  asyncHandler(async (req, res) => {
    const { workflowName } = req.params;
    const { namespace, podName, containerName } = req.query;

    try {
      const logs = await argoClient.getWorkflowLogs(
        workflowName,
        namespace as string | undefined,
        podName as string | undefined,
        containerName as string | undefined
      );

      res.json({
        success: true,
        data: {
          workflowName,
          logs
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Workflow ${workflowName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// POST /api/platform/workflows/:workflowName/terminate - Terminate a workflow
router.post('/:workflowName/terminate',
  requireRole(['workflow:admin']),
  asyncHandler(async (req, res) => {
    const { workflowName } = req.params;
    const { namespace } = req.body;

    try {
      await argoClient.terminateWorkflow(workflowName, namespace);
      
      logger.info('Workflow terminated via API', {
        workflowName,
        namespace,
        terminatedBy: req.user!.email
      });

      res.json({
        success: true,
        message: `Workflow ${workflowName} terminated successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Workflow ${workflowName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// POST /api/platform/workflows/:workflowName/retry - Retry a workflow
router.post('/:workflowName/retry',
  requireRole(['workflow:admin', 'workflow:developer']),
  asyncHandler(async (req, res) => {
    const { workflowName } = req.params;
    const { namespace } = req.body;

    try {
      const workflow = await argoClient.retryWorkflow(workflowName, namespace);
      
      logger.info('Workflow retry initiated via API', {
        workflowName,
        namespace,
        retriedBy: req.user!.email
      });

      res.json({
        success: true,
        data: workflow,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Workflow ${workflowName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

// POST /api/platform/workflows/:workflowName/wait - Wait for workflow completion
router.post('/:workflowName/wait',
  requireRole(['workflow:admin', 'workflow:developer']),
  asyncHandler(async (req, res) => {
    const { workflowName } = req.params;
    const { namespace, timeoutMs = 60000, pollIntervalMs = 5000 } = req.body;

    try {
      const status = await argoClient.waitForWorkflowCompletion(
        workflowName,
        namespace,
        timeoutMs,
        pollIntervalMs
      );
      
      res.json({
        success: true,
        data: {
          workflowName,
          finalStatus: status
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Timeout')) {
        return res.status(408).json({
          error: 'TimeoutError',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: 'NotFoundError',
          message: `Workflow ${workflowName} not found`,
          timestamp: new Date().toISOString()
        });
      }
      throw error;
    }
  })
);

export { router as workflowRouter };