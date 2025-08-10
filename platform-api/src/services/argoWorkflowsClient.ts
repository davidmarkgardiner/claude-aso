import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface WorkflowStatus {
  phase: string;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
  progress?: string;
  estimatedDuration?: number;
}

export interface WorkflowResponse {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
  };
  status: WorkflowStatus;
}

export class ArgoWorkflowsClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.argo.baseUrl,
      timeout: config.argo.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(config.argo.token && { 'Authorization': `Bearer ${config.argo.token}` })
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logger.debug(`Argo API Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Argo API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('Argo API Error:', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  async submitWorkflow(workflowSpec: any): Promise<WorkflowResponse> {
    try {
      logger.info('Submitting workflow to Argo', { 
        workflowName: workflowSpec.metadata?.name 
      });
      
      const response = await this.client.post(
        `/api/v1/workflows/${config.argo.namespace}`,
        workflowSpec
      );

      const workflow = response.data;
      
      logger.info('Workflow submitted successfully', {
        workflowName: workflow.metadata?.name,
        namespace: workflow.metadata?.namespace
      });

      return {
        metadata: {
          name: workflow.metadata.name,
          namespace: workflow.metadata.namespace,
          creationTimestamp: workflow.metadata.creationTimestamp,
          labels: workflow.metadata.labels
        },
        status: {
          phase: workflow.status?.phase || 'Pending',
          message: workflow.status?.message,
          startedAt: workflow.status?.startedAt,
          finishedAt: workflow.status?.finishedAt,
          progress: workflow.status?.progress
        }
      };
    } catch (error) {
      logger.error('Failed to submit workflow:', error);
      throw new Error(`Failed to submit workflow: ${error.response?.data?.message || error.message}`);
    }
  }

  async getWorkflow(workflowName: string, namespace?: string): Promise<WorkflowResponse> {
    try {
      const ns = namespace || config.argo.namespace;
      
      const response = await this.client.get(
        `/api/v1/workflows/${ns}/${workflowName}`
      );

      const workflow = response.data;
      
      return {
        metadata: {
          name: workflow.metadata.name,
          namespace: workflow.metadata.namespace,
          creationTimestamp: workflow.metadata.creationTimestamp,
          labels: workflow.metadata.labels
        },
        status: {
          phase: workflow.status?.phase || 'Unknown',
          message: workflow.status?.message,
          startedAt: workflow.status?.startedAt,
          finishedAt: workflow.status?.finishedAt,
          progress: workflow.status?.progress,
          estimatedDuration: workflow.status?.estimatedDuration
        }
      };
    } catch (error) {
      logger.error(`Failed to get workflow ${workflowName}:`, error);
      if (error.response?.status === 404) {
        throw new Error(`Workflow ${workflowName} not found`);
      }
      throw new Error(`Failed to get workflow: ${error.response?.data?.message || error.message}`);
    }
  }

  async getWorkflowStatus(workflowName: string, namespace?: string): Promise<WorkflowStatus> {
    const workflow = await this.getWorkflow(workflowName, namespace);
    return workflow.status;
  }

  async listWorkflows(
    namespace?: string,
    labelSelector?: string,
    limit?: number
  ): Promise<WorkflowResponse[]> {
    try {
      const ns = namespace || config.argo.namespace;
      const params: any = {};
      
      if (labelSelector) {
        params.labelSelector = labelSelector;
      }
      if (limit) {
        params.limit = limit;
      }

      const response = await this.client.get(
        `/api/v1/workflows/${ns}`,
        { params }
      );

      const workflows = response.data.items || [];
      
      return workflows.map((workflow: any) => ({
        metadata: {
          name: workflow.metadata.name,
          namespace: workflow.metadata.namespace,
          creationTimestamp: workflow.metadata.creationTimestamp,
          labels: workflow.metadata.labels
        },
        status: {
          phase: workflow.status?.phase || 'Unknown',
          message: workflow.status?.message,
          startedAt: workflow.status?.startedAt,
          finishedAt: workflow.status?.finishedAt,
          progress: workflow.status?.progress
        }
      }));
    } catch (error) {
      logger.error('Failed to list workflows:', error);
      throw new Error(`Failed to list workflows: ${error.response?.data?.message || error.message}`);
    }
  }

  async terminateWorkflow(workflowName: string, namespace?: string): Promise<void> {
    try {
      const ns = namespace || config.argo.namespace;
      
      await this.client.put(
        `/api/v1/workflows/${ns}/${workflowName}/terminate`
      );
      
      logger.info(`Workflow ${workflowName} terminated successfully`);
    } catch (error) {
      logger.error(`Failed to terminate workflow ${workflowName}:`, error);
      throw new Error(`Failed to terminate workflow: ${error.response?.data?.message || error.message}`);
    }
  }

  async retryWorkflow(workflowName: string, namespace?: string): Promise<WorkflowResponse> {
    try {
      const ns = namespace || config.argo.namespace;
      
      const response = await this.client.put(
        `/api/v1/workflows/${ns}/${workflowName}/retry`
      );

      const workflow = response.data;
      
      logger.info(`Workflow ${workflowName} retry initiated successfully`);
      
      return {
        metadata: {
          name: workflow.metadata.name,
          namespace: workflow.metadata.namespace,
          creationTimestamp: workflow.metadata.creationTimestamp,
          labels: workflow.metadata.labels
        },
        status: {
          phase: workflow.status?.phase || 'Pending',
          message: workflow.status?.message,
          startedAt: workflow.status?.startedAt,
          finishedAt: workflow.status?.finishedAt,
          progress: workflow.status?.progress
        }
      };
    } catch (error) {
      logger.error(`Failed to retry workflow ${workflowName}:`, error);
      throw new Error(`Failed to retry workflow: ${error.response?.data?.message || error.message}`);
    }
  }

  async getWorkflowLogs(
    workflowName: string,
    namespace?: string,
    podName?: string,
    containerName?: string
  ): Promise<string> {
    try {
      const ns = namespace || config.argo.namespace;
      const params: any = {};
      
      if (podName) params.podName = podName;
      if (containerName) params.container = containerName;

      const response = await this.client.get(
        `/api/v1/workflows/${ns}/${workflowName}/log`,
        { params }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to get workflow logs for ${workflowName}:`, error);
      throw new Error(`Failed to get workflow logs: ${error.response?.data?.message || error.message}`);
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; version?: string }> {
    try {
      const response = await this.client.get('/api/v1/version');
      return {
        healthy: true,
        version: response.data?.version
      };
    } catch (error) {
      logger.error('Argo Workflows health check failed:', error);
      return { healthy: false };
    }
  }

  // Utility method to wait for workflow completion
  async waitForWorkflowCompletion(
    workflowName: string,
    namespace?: string,
    timeoutMs: number = 600000, // 10 minutes default
    pollIntervalMs: number = 5000 // 5 seconds default
  ): Promise<WorkflowStatus> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getWorkflowStatus(workflowName, namespace);
        
        if (status.phase === 'Succeeded' || status.phase === 'Failed' || status.phase === 'Error') {
          return status;
        }
        
        logger.debug(`Workflow ${workflowName} still running (${status.phase}), waiting...`);
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        
      } catch (error) {
        logger.error(`Error polling workflow status for ${workflowName}:`, error);
        throw error;
      }
    }
    
    throw new Error(`Timeout waiting for workflow ${workflowName} to complete`);
  }
}