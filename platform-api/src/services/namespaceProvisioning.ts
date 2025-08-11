import { v4 as uuidv4 } from 'uuid';
import { getKubernetesClient } from './kubernetesClient';
import { ArgoWorkflowsClient } from './argoWorkflowsClient';
import { getDirectProvisioningService } from './directProvisioningService';
import { logger } from '../utils/logger';
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
  private directProvisioner = getDirectProvisioningService();
  
  // resourceTiers moved to DirectProvisioningService

  async provisionNamespace(request: NamespaceRequest, useArgoWorkflows: boolean = false): Promise<ProvisioningResult> {
    const requestId = `ns-${Date.now()}-${uuidv4().substr(0, 8)}`;
    
    try {
      logger.info(`Starting namespace provisioning for request ${requestId}`, { request, useArgoWorkflows });
      
      if (useArgoWorkflows) {
        // Use Argo Workflows for provisioning
        const workflowSpec = this.generateWorkflowSpec(request, requestId);
        const workflowResponse = await this.argoClient.submitWorkflow(workflowSpec);
        
        logger.info(`Namespace provisioning workflow submitted`, { 
          requestId, 
          workflowId: workflowResponse.metadata.name 
        });
        
        // Store request metadata for tracking
        await this.storeRequestMetadata(requestId, request, workflowResponse.metadata.name);
        
        return {
          requestId,
          status: 'submitted',
          workflowId: workflowResponse.metadata.name,
          message: `Namespace provisioning workflow ${workflowResponse.metadata.name} has been submitted`,
          estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes estimate
        };
      } else {
        // Use direct provisioning
        await this.directProvisioner.provisionNamespace(request);
        
        logger.info(`Namespace provisioning completed successfully`, { 
          requestId, 
          namespaceName: request.namespaceName
        });
        
        return {
          requestId,
          status: 'completed',
          message: `Namespace ${request.namespaceName} created successfully with all resources (ResourceQuota, LimitRange, RBAC, NetworkPolicy).`,
        };
      }
      
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

  // validateRequest method moved to DirectProvisioningService

  private generateWorkflowSpec(request: NamespaceRequest, requestId: string): any {
    const resourceTier = this.directProvisioner.getResourceTier(request.resourceTier);
    
    return {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        generateName: `provision-namespace-${request.namespaceName}-`,
        namespace: 'argo',
        labels: {
          'platform.io/request-id': requestId,
          'platform.io/team': request.team,
          'platform.io/environment': request.environment
        }
      },
      spec: {
        entrypoint: 'provision-namespace',
        serviceAccountName: 'argo-workflow',
        templates: [
          {
            name: 'provision-namespace',
            dag: {
              tasks: [
                {
                  name: 'create-namespace',
                  template: 'kubectl-apply',
                  arguments: {
                    parameters: [
                      {
                        name: 'manifest',
                        value: JSON.stringify({
                          apiVersion: 'v1',
                          kind: 'Namespace',
                          metadata: {
                            name: request.namespaceName,
                            labels: {
                              'platform.io/managed': 'true',
                              'platform.io/team': request.team,
                              'platform.io/environment': request.environment,
                              'platform.io/resource-tier': request.resourceTier,
                              'platform.io/request-id': requestId
                            },
                            annotations: {
                              'platform.io/created-by': request.requestedBy,
                              'platform.io/description': request.description || '',
                              'platform.io/cost-center': request.costCenter || ''
                            }
                          }
                        })
                      }
                    ]
                  }
                },
                {
                  name: 'apply-resource-quota',
                  template: 'kubectl-apply',
                  dependencies: ['create-namespace'],
                  arguments: {
                    parameters: [
                      {
                        name: 'manifest',
                        value: JSON.stringify({
                          apiVersion: 'v1',
                          kind: 'ResourceQuota',
                          metadata: {
                            name: 'namespace-quota',
                            namespace: request.namespaceName
                          },
                          spec: {
                            hard: {
                              'requests.cpu': resourceTier.cpuLimit,
                              'requests.memory': resourceTier.memoryLimit,
                              'requests.storage': resourceTier.storageQuota,
                              'persistentvolumeclaims': '10',
                              'pods': String(resourceTier.maxPods),
                              'services': String(resourceTier.maxServices)
                            }
                          }
                        })
                      }
                    ]
                  }
                },
                {
                  name: 'apply-limit-range',
                  template: 'kubectl-apply',
                  dependencies: ['create-namespace'],
                  arguments: {
                    parameters: [
                      {
                        name: 'manifest',
                        value: JSON.stringify({
                          apiVersion: 'v1',
                          kind: 'LimitRange',
                          metadata: {
                            name: 'namespace-limits',
                            namespace: request.namespaceName
                          },
                          spec: {
                            limits: [
                              {
                                type: 'Container',
                                default: {
                                  cpu: '500m',
                                  memory: '512Mi'
                                },
                                defaultRequest: {
                                  cpu: '100m',
                                  memory: '128Mi'
                                }
                              }
                            ]
                          }
                        })
                      }
                    ]
                  }
                },
                {
                  name: 'setup-rbac',
                  template: 'kubectl-apply',
                  dependencies: ['create-namespace'],
                  arguments: {
                    parameters: [
                      {
                        name: 'manifest',
                        value: JSON.stringify({
                          apiVersion: 'rbac.authorization.k8s.io/v1',
                          kind: 'RoleBinding',
                          metadata: {
                            name: `${request.team}-namespace-admin`,
                            namespace: request.namespaceName
                          },
                          subjects: [
                            {
                              kind: 'Group',
                              name: `platform-team-${request.team}`,
                              apiGroup: 'rbac.authorization.k8s.io'
                            }
                          ],
                          roleRef: {
                            kind: 'ClusterRole',
                            name: 'edit',
                            apiGroup: 'rbac.authorization.k8s.io'
                          }
                        })
                      }
                    ]
                  }
                },
                {
                  name: 'apply-network-policy',
                  template: 'kubectl-apply',
                  dependencies: ['create-namespace'],
                  when: request.networkPolicy !== 'open',
                  arguments: {
                    parameters: [
                      {
                        name: 'manifest',
                        value: JSON.stringify(this.generateNetworkPolicySpec(request))
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            name: 'kubectl-apply',
            inputs: {
              parameters: [
                { name: 'manifest' }
              ]
            },
            container: {
              image: 'bitnami/kubectl:latest',
              command: ['sh', '-c'],
              args: [
                'echo "{{inputs.parameters.manifest}}" | kubectl apply -f -'
              ]
            }
          }
        ]
      }
    };
  }

  private generateNetworkPolicySpec(request: NamespaceRequest): any {
    const basePolicy = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'default-network-policy',
        namespace: request.namespaceName
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress']
      }
    };

    if (request.networkPolicy === 'isolated') {
      // Deny all ingress/egress except DNS
      basePolicy.spec = {
        ...basePolicy.spec,
        egress: [
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'kubernetes.io/metadata.name': 'kube-system'
                  }
                }
              }
            ],
            ports: [
              { protocol: 'UDP', port: 53 },
              { protocol: 'TCP', port: 53 }
            ]
          }
        ]
      };
    } else if (request.networkPolicy === 'team-shared') {
      // Allow traffic within team namespaces
      basePolicy.spec = {
        ...basePolicy.spec,
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'platform.io/team': request.team
                  }
                }
              }
            ]
          }
        ],
        egress: [
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'platform.io/team': request.team
                  }
                }
              }
            ]
          },
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'kubernetes.io/metadata.name': 'kube-system'
                  }
                }
              }
            ],
            ports: [
              { protocol: 'UDP', port: 53 },
              { protocol: 'TCP', port: 53 }
            ]
          }
        ]
      };
    }

    return basePolicy;
  }

  private async storeRequestMetadata(requestId: string, request: NamespaceRequest, workflowId: string): Promise<void> {
    // TODO: In production, this would store to a database
    // For now, we'll use an in-memory store or log it
    logger.info('Storing request metadata', {
      requestId,
      request,
      workflowId
    });
    
    // In a real implementation, this would be something like:
    // await this.db.requestMetadata.create({
    //   requestId,
    //   ...request,
    //   workflowId,
    //   createdAt: new Date()
    // });
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

  // Database methods no longer needed for direct provisioning

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