import { v4 as uuidv4 } from 'uuid';
import { getKubernetesClient } from './kubernetesClient';
import { logger } from '../utils/logger';
import * as k8s from '@kubernetes/client-node';
import { NamespaceRequest, ProvisioningResult, ResourceTierConfig } from './namespaceProvisioning';

export class DirectProvisioningService {
  private k8sClient = getKubernetesClient();
  
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
      logger.info(`Starting direct namespace provisioning for request ${requestId}`, { request });
      
      // Validate request first
      await this.validateRequest(request);
      
      // Create namespace with all resources directly
      await this.createNamespaceResources(request);
      
      logger.info(`Namespace provisioning completed successfully`, { requestId, namespaceName: request.namespaceName });
      
      return {
        requestId,
        status: 'completed',
        message: `Namespace ${request.namespaceName} created successfully with all resources.`
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to provision namespace for request ${requestId}:`, { 
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Failed to provision namespace: ${errorMessage}`);
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

  private async createNamespaceResources(request: NamespaceRequest): Promise<void> {
    const resourceTierConfig = this.resourceTiers[request.resourceTier];
    
    // 1. Create namespace with labels and annotations
    await this.createNamespace(request);
    
    // 2. Create resource quota
    await this.createResourceQuota(request.namespaceName, resourceTierConfig);
    
    // 3. Create limit range
    await this.createLimitRange(request.namespaceName, resourceTierConfig);
    
    // 4. Create RBAC (RoleBinding for team access)
    await this.createTeamRBAC(request.namespaceName, request.team);
    
    // 5. Create network policy
    await this.createNetworkPolicy(request.namespaceName, request.team, request.networkPolicy);
    
    // 6. Apply Istio injection if requested
    if (request.features.includes('istio-injection')) {
      await this.enableIstioInjection(request.namespaceName);
    }
    
    logger.info(`All resources created for namespace ${request.namespaceName}`, {
      resourceQuota: true,
      limitRange: true, 
      rbac: true,
      networkPolicy: true,
      istioInjection: request.features.includes('istio-injection')
    });
  }

  private async createNamespace(request: NamespaceRequest): Promise<void> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    
    const namespace: k8s.V1Namespace = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: request.namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': request.team,
          'platform.io/environment': request.environment,
          'platform.io/resource-tier': request.resourceTier,
          'platform.io/network-policy': request.networkPolicy,
          'platform.io/provisioned-by': 'platform-api'
        },
        annotations: {
          'platform.io/requested-by': request.requestedBy,
          'platform.io/requested-at': new Date().toISOString(),
          'platform.io/description': request.description || '',
          'platform.io/cost-center': request.costCenter || request.team,
          'platform.io/features': JSON.stringify(request.features)
        }
      }
    };

    await k8sApi.createNamespace(namespace);
    logger.info(`Namespace created: ${request.namespaceName}`);
  }

  private async createResourceQuota(namespaceName: string, config: ResourceTierConfig): Promise<void> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    
    const resourceQuota: k8s.V1ResourceQuota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: 'platform-resource-quota',
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/resource-type': 'quota'
        }
      },
      spec: {
        hard: {
          'requests.cpu': config.cpuLimit,
          'requests.memory': config.memoryLimit,
          'persistentvolumeclaims': config.storageQuota,
          'pods': config.maxPods.toString(),
          'services': config.maxServices.toString(),
          'secrets': '10',
          'configmaps': '10'
        }
      }
    };

    await k8sApi.createNamespacedResourceQuota(namespaceName, resourceQuota);
    logger.info(`Resource quota created for namespace: ${namespaceName}`);
  }

  private async createLimitRange(namespaceName: string, config: ResourceTierConfig): Promise<void> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    
    const limitRange: k8s.V1LimitRange = {
      apiVersion: 'v1',
      kind: 'LimitRange',
      metadata: {
        name: 'platform-limit-range',
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/resource-type': 'limits'
        }
      },
      spec: {
        limits: [
          {
            type: 'Container',
            _default: {
              cpu: '500m',
              memory: '512Mi'
            },
            defaultRequest: {
              cpu: '100m', 
              memory: '128Mi'
            },
            max: {
              cpu: config.cpuLimit,
              memory: config.memoryLimit
            }
          },
          {
            type: 'PersistentVolumeClaim',
            max: {
              storage: config.storageQuota
            }
          }
        ]
      }
    };

    await k8sApi.createNamespacedLimitRange(namespaceName, limitRange);
    logger.info(`Limit range created for namespace: ${namespaceName}`);
  }

  private async createTeamRBAC(namespaceName: string, teamName: string): Promise<void> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
    
    // Create RoleBinding for team developers
    const roleBinding: k8s.V1RoleBinding = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: {
        name: `${teamName}-developers`,
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': teamName,
          'platform.io/resource-type': 'rbac'
        }
      },
      subjects: [
        {
          kind: 'Group',
          name: `${teamName}-developers`,
          apiGroup: 'rbac.authorization.k8s.io'
        }
      ],
      roleRef: {
        kind: 'ClusterRole',
        name: 'edit', // Built-in role allowing editing resources in the namespace
        apiGroup: 'rbac.authorization.k8s.io'
      }
    };

    await rbacApi.createNamespacedRoleBinding(namespaceName, roleBinding);
    logger.info(`RBAC created for team ${teamName} in namespace: ${namespaceName}`);
  }

  private async createNetworkPolicy(namespaceName: string, teamName: string, policyType: string): Promise<void> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);
    
    let networkPolicy: k8s.V1NetworkPolicy;
    
    switch (policyType) {
      case 'isolated':
        networkPolicy = this.createIsolatedNetworkPolicy(namespaceName, teamName);
        break;
      case 'team-shared':
        networkPolicy = this.createTeamSharedNetworkPolicy(namespaceName, teamName);
        break;
      case 'open':
        // No network policy needed for open access
        logger.info(`Open network policy - no restrictions for namespace: ${namespaceName}`);
        return;
      default:
        networkPolicy = this.createTeamSharedNetworkPolicy(namespaceName, teamName);
    }

    await networkingApi.createNamespacedNetworkPolicy(namespaceName, networkPolicy);
    logger.info(`Network policy (${policyType}) created for namespace: ${namespaceName}`);
  }

  private createIsolatedNetworkPolicy(namespaceName: string, teamName: string): k8s.V1NetworkPolicy {
    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'platform-isolated-policy',
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': teamName,
          'platform.io/network-policy': 'isolated'
        }
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'name': namespaceName
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
                    'name': namespaceName
                  }
                }
              }
            ]
          },
          {
            // Allow DNS
            to: [],
            ports: [
              {
                protocol: 'UDP',
                port: 53
              }
            ]
          }
        ]
      }
    };
  }

  private createTeamSharedNetworkPolicy(namespaceName: string, teamName: string): k8s.V1NetworkPolicy {
    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'platform-team-shared-policy',
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': teamName,
          'platform.io/network-policy': 'team-shared'
        }
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: {
                    'platform.io/team': teamName
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
                    'platform.io/team': teamName
                  }
                }
              }
            ]
          },
          {
            // Allow DNS and external traffic
            to: []
          }
        ]
      }
    };
  }

  private async enableIstioInjection(namespaceName: string): Promise<void> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    
    // Add istio-injection label to namespace
    const patch = [
      {
        op: 'add',
        path: '/metadata/labels/istio-injection',
        value: 'enabled'
      }
    ];
    
    await k8sApi.patchNamespace(namespaceName, patch, undefined, undefined, undefined, undefined, {
      headers: { 'Content-Type': 'application/json-patch+json' }
    } as any);
    logger.info(`Istio injection enabled for namespace: ${namespaceName}`);
  }
}

// Singleton instance
let directProvisioningService: DirectProvisioningService;

export const getDirectProvisioningService = (): DirectProvisioningService => {
  if (!directProvisioningService) {
    directProvisioningService = new DirectProvisioningService();
  }
  return directProvisioningService;
};