import { v4 as uuidv4 } from 'uuid';
import { getKubernetesClient } from './kubernetesClient';
import { ArgoWorkflowsClient } from './argoWorkflowsClient';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import * as k8s from '@kubernetes/client-node';

export interface NamespaceRequest {
  namespaceName: string;
  team: string;
  environment: 'development' | 'staging' | 'production';
  resourceTier: 'micro' | 'small' | 'medium' | 'large';
  networkPolicy: 'isolated' | 'team-shared' | 'open';
  features: string[];
  requestedBy: string;
  description?: string;
  costCenter?: string;
}

export interface ProvisioningResult {
  requestId: string;
  status: 'submitted' | 'in-progress' | 'completed' | 'failed';
  workflowId?: string;
  message: string;
  estimatedCompletionTime?: Date;
}

export interface ResourceTierConfig {
  cpuLimit: string;
  memoryLimit: string;
  storageQuota: string;
  maxPods: number;
  maxServices: number;
  estimatedMonthlyCost: string;
}

export class NamespaceProvisioningService {
  private k8sClient = getKubernetesClient();
  private argoClient = new ArgoWorkflowsClient();
  
  private readonly resourceTiers: Record<string, ResourceTierConfig> = {
    micro: {
      cpuLimit: '1',
      memoryLimit: '2Gi',
      storageQuota: '10Gi',
      maxPods: 5,
      maxServices: 3,
      estimatedMonthlyCost: '$50'
    },
    small: {
      cpuLimit: '2',
      memoryLimit: '4Gi',
      storageQuota: '20Gi',
      maxPods: 10,
      maxServices: 5,
      estimatedMonthlyCost: '$100'
    },
    medium: {
      cpuLimit: '4',
      memoryLimit: '8Gi',
      storageQuota: '50Gi',
      maxPods: 20,
      maxServices: 10,
      estimatedMonthlyCost: '$200'
    },
    large: {
      cpuLimit: '8',
      memoryLimit: '16Gi',
      storageQuota: '100Gi',
      maxPods: 50,
      maxServices: 20,
      estimatedMonthlyCost: '$400'
    }
  };

  async provisionNamespace(request: NamespaceRequest): Promise<ProvisioningResult> {
    const requestId = `ns-${Date.now()}-${uuidv4().substr(0, 8)}`;
    
    try {
      logger.info(`Starting namespace provisioning for request ${requestId}`, { request });
      
      // Validate request
      await this.validateRequest(request);
      
      // Create Argo Workflow for provisioning
      const workflowSpec = this.generateWorkflowSpec(request, requestId);
      const workflow = await this.argoClient.submitWorkflow(workflowSpec);
      
      // Store request metadata (would typically use database)
      await this.storeRequestMetadata(requestId, request, workflow.metadata?.name);
      
      logger.info(`Namespace provisioning workflow submitted`, { 
        requestId, 
        workflowId: workflow.metadata?.name 
      });
      
      return {
        requestId,
        status: 'submitted',
        workflowId: workflow.metadata?.name,
        message: `Namespace provisioning request submitted successfully. Expected completion in 5-10 minutes.`,
        estimatedCompletionTime: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };
      
    } catch (error) {
      logger.error(`Failed to provision namespace for request ${requestId}:`, error);
      throw error;
    }
  }

  async getProvisioningStatus(requestId: string): Promise<ProvisioningResult> {
    try {
      // In production, this would query database for request metadata
      const requestMetadata = await this.getRequestMetadata(requestId);
      
      if (!requestMetadata) {
        throw new Error(`Request ${requestId} not found`);
      }

      // Check workflow status
      if (requestMetadata.workflowId) {
        const workflowStatus = await this.argoClient.getWorkflowStatus(requestMetadata.workflowId);
        
        return {
          requestId,
          status: this.mapWorkflowStatusToRequestStatus(workflowStatus.phase),
          workflowId: requestMetadata.workflowId,
          message: this.generateStatusMessage(workflowStatus.phase, workflowStatus.message)
        };
      }

      return requestMetadata;
    } catch (error) {
      logger.error(`Failed to get provisioning status for request ${requestId}:`, error);
      throw error;
    }
  }

  async cancelProvisioning(requestId: string, cancelledBy: string): Promise<void> {
    try {
      const requestMetadata = await this.getRequestMetadata(requestId);
      
      if (!requestMetadata || !requestMetadata.workflowId) {
        throw new Error(`Request ${requestId} not found or not in progress`);
      }

      await this.argoClient.terminateWorkflow(requestMetadata.workflowId);
      
      logger.info(`Namespace provisioning cancelled`, { requestId, cancelledBy });
    } catch (error) {
      logger.error(`Failed to cancel provisioning for request ${requestId}:`, error);
      throw error;
    }
  }

  async listTeamNamespaces(team: string): Promise<k8s.V1Namespace[]> {
    try {
      const labelSelector = `platform.io/team=${team}`;
      return await this.k8sClient.listNamespaces(labelSelector);
    } catch (error) {
      logger.error(`Failed to list namespaces for team ${team}:`, error);
      throw error;
    }
  }

  async getNamespaceDetails(namespaceName: string): Promise<{
    namespace: k8s.V1Namespace;
    resourceUsage: any;
    resourceQuota?: k8s.V1ResourceQuota;
    networkPolicies: k8s.V1NetworkPolicy[];
  }> {
    try {
      const namespace = await this.k8sClient.getNamespace(namespaceName);
      if (!namespace) {
        throw new Error(`Namespace ${namespaceName} not found`);
      }

      const [resourceUsage, networkPolicies] = await Promise.all([
        this.k8sClient.getNamespaceResourceUsage(namespaceName),
        this.getNetworkPolicies(namespaceName)
      ]);

      return {
        namespace,
        resourceUsage,
        networkPolicies
      };
    } catch (error) {
      logger.error(`Failed to get namespace details for ${namespaceName}:`, error);
      throw error;
    }
  }

  private async validateRequest(request: NamespaceRequest): Promise<void> {
    // Validate namespace naming conventions
    const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!namePattern.test(request.namespaceName)) {
      throw new Error('Invalid namespace name format. Must be lowercase alphanumeric with hyphens.');
    }

    if (request.namespaceName.length > 63) {
      throw new Error('Namespace name cannot exceed 63 characters');
    }

    // Check if namespace already exists
    const existingNamespace = await this.k8sClient.getNamespace(request.namespaceName);
    if (existingNamespace) {
      throw new Error(`Namespace ${request.namespaceName} already exists`);
    }

    // Validate resource tier
    if (!this.resourceTiers[request.resourceTier]) {
      throw new Error(`Invalid resource tier: ${request.resourceTier}`);
    }

    // Check team quotas
    const teamNamespaces = await this.listTeamNamespaces(request.team);
    if (teamNamespaces.length >= config.platform.maxNamespacesPerTeam) {
      throw new Error(`Team ${request.team} has reached namespace quota limit (${config.platform.maxNamespacesPerTeam})`);
    }

    // Validate features
    const invalidFeatures = request.features.filter(
      feature => !config.platform.allowedFeatures.includes(feature)
    );
    if (invalidFeatures.length > 0) {
      throw new Error(`Invalid features: ${invalidFeatures.join(', ')}`);
    }

    // Environment-specific validations
    if (request.environment === 'production') {
      if (request.resourceTier === 'micro') {
        throw new Error('Production environments require at least "small" resource tier');
      }
      if (request.networkPolicy === 'open') {
        throw new Error('Production environments cannot use "open" network policy');
      }
    }
  }

  private generateWorkflowSpec(request: NamespaceRequest, requestId: string): any {
    const resourceTierConfig = this.resourceTiers[request.resourceTier];
    
    return {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: `provision-namespace-${requestId}`,
        namespace: config.argo.namespace,
        labels: {
          'platform.io/request-id': requestId,
          'platform.io/team': request.team,
          'platform.io/environment': request.environment,
          'platform.io/resource-tier': request.resourceTier
        },
        annotations: {
          'platform.io/requested-by': request.requestedBy,
          'platform.io/requested-at': new Date().toISOString(),
          'platform.io/description': request.description || ''
        }
      },
      spec: {
        entrypoint: 'provision-namespace',
        serviceAccountName: 'platform-provisioner',
        arguments: {
          parameters: [
            { name: 'namespace-name', value: request.namespaceName },
            { name: 'team-name', value: request.team },
            { name: 'environment', value: request.environment },
            { name: 'resource-tier', value: request.resourceTier },
            { name: 'network-policy', value: request.networkPolicy },
            { name: 'features', value: JSON.stringify(request.features) },
            { name: 'cpu-limit', value: resourceTierConfig.cpuLimit },
            { name: 'memory-limit', value: resourceTierConfig.memoryLimit },
            { name: 'storage-quota', value: resourceTierConfig.storageQuota },
            { name: 'max-pods', value: resourceTierConfig.maxPods.toString() },
            { name: 'max-services', value: resourceTierConfig.maxServices.toString() },
            { name: 'requested-by', value: request.requestedBy },
            { name: 'cost-center', value: request.costCenter || request.team }
          ]
        },
        templates: [
          {
            name: 'provision-namespace',
            dag: {
              tasks: [
                {
                  name: 'create-namespace',
                  templateRef: {
                    name: 'create-namespace-template',
                    template: 'create-namespace'
                  },
                  arguments: {
                    parameters: [
                      { name: 'namespace-name', value: '{{workflow.parameters.namespace-name}}' },
                      { name: 'team-name', value: '{{workflow.parameters.team-name}}' },
                      { name: 'environment', value: '{{workflow.parameters.environment}}' }
                    ]
                  }
                },
                {
                  name: 'apply-resource-quotas',
                  templateRef: {
                    name: 'create-namespace-template',
                    template: 'apply-resource-quotas'
                  },
                  arguments: {
                    parameters: [
                      { name: 'namespace-name', value: '{{workflow.parameters.namespace-name}}' },
                      { name: 'cpu-limit', value: '{{workflow.parameters.cpu-limit}}' },
                      { name: 'memory-limit', value: '{{workflow.parameters.memory-limit}}' },
                      { name: 'storage-quota', value: '{{workflow.parameters.storage-quota}}' },
                      { name: 'max-pods', value: '{{workflow.parameters.max-pods}}' },
                      { name: 'max-services', value: '{{workflow.parameters.max-services}}' }
                    ]
                  },
                  dependencies: ['create-namespace']
                },
                {
                  name: 'setup-rbac',
                  templateRef: {
                    name: 'create-namespace-template',
                    template: 'setup-rbac'
                  },
                  arguments: {
                    parameters: [
                      { name: 'namespace-name', value: '{{workflow.parameters.namespace-name}}' },
                      { name: 'team-name', value: '{{workflow.parameters.team-name}}' }
                    ]
                  },
                  dependencies: ['create-namespace']
                },
                {
                  name: 'apply-network-policies',
                  templateRef: {
                    name: 'create-namespace-template',
                    template: 'apply-network-policies'
                  },
                  arguments: {
                    parameters: [
                      { name: 'namespace-name', value: '{{workflow.parameters.namespace-name}}' },
                      { name: 'team-name', value: '{{workflow.parameters.team-name}}' },
                      { name: 'network-policy', value: '{{workflow.parameters.network-policy}}' }
                    ]
                  },
                  dependencies: ['create-namespace']
                },
                {
                  name: 'setup-monitoring',
                  templateRef: {
                    name: 'create-namespace-template',
                    template: 'setup-monitoring'
                  },
                  arguments: {
                    parameters: [
                      { name: 'namespace-name', value: '{{workflow.parameters.namespace-name}}' },
                      { name: 'team-name', value: '{{workflow.parameters.team-name}}' }
                    ]
                  },
                  dependencies: ['create-namespace']
                }
              ]
            }
          }
        ]
      }
    };
  }

  private mapWorkflowStatusToRequestStatus(workflowPhase: string): 'submitted' | 'in-progress' | 'completed' | 'failed' {
    switch (workflowPhase?.toLowerCase()) {
      case 'pending':
      case 'running':
        return 'in-progress';
      case 'succeeded':
        return 'completed';
      case 'failed':
      case 'error':
        return 'failed';
      default:
        return 'submitted';
    }
  }

  private generateStatusMessage(workflowPhase: string, workflowMessage?: string): string {
    switch (workflowPhase?.toLowerCase()) {
      case 'pending':
        return 'Namespace provisioning is queued and will start shortly';
      case 'running':
        return 'Namespace provisioning is in progress';
      case 'succeeded':
        return 'Namespace provisioned successfully and is ready for use';
      case 'failed':
      case 'error':
        return `Namespace provisioning failed: ${workflowMessage || 'Unknown error'}`;
      default:
        return 'Namespace provisioning request submitted';
    }
  }

  private async getNetworkPolicies(_namespace: string): Promise<k8s.V1NetworkPolicy[]> {
    // const k8sClient = getKubernetesClient();
    // This would need to use the networking API
    // For now, return empty array
    return [];
  }

  // These methods would typically interact with a database
  private async storeRequestMetadata(requestId: string, _request: NamespaceRequest, workflowId?: string): Promise<void> {
    // TODO: Implement database storage
    logger.info('Storing request metadata', { requestId, workflowId });
  }

  private async getRequestMetadata(_requestId: string): Promise<ProvisioningResult | null> {
    // TODO: Implement database retrieval
    return null;
  }
}

// Singleton instance
let provisioningService: NamespaceProvisioningService;

export const getProvisioningService = (): NamespaceProvisioningService => {
  if (!provisioningService) {
    provisioningService = new NamespaceProvisioningService();
  }
  return provisioningService;
};