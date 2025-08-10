import * as k8s from '@kubernetes/client-node';
import { logger } from '../utils/logger';
import { config } from '../config/config';

export class KubernetesClient {
  private kubeConfig: k8s.KubeConfig;
  private coreApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private rbacApi: k8s.RbacAuthorizationV1Api;
  private networkingApi: k8s.NetworkingV1Api;
  private customObjectsApi: k8s.CustomObjectsApi;

  constructor() {
    this.kubeConfig = new k8s.KubeConfig();
    
    try {
      if (config.kubernetes.configPath) {
        this.kubeConfig.loadFromFile(config.kubernetes.configPath);
      } else if (process.env.KUBECONFIG) {
        this.kubeConfig.loadFromDefault();
      } else {
        // Try in-cluster config first, fallback to default
        try {
          this.kubeConfig.loadFromCluster();
        } catch {
          this.kubeConfig.loadFromDefault();
        }
      }
      
      if (config.kubernetes.context) {
        this.kubeConfig.setCurrentContext(config.kubernetes.context);
      }
      
      this.coreApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
      this.appsApi = this.kubeConfig.makeApiClient(k8s.AppsV1Api);
      this.rbacApi = this.kubeConfig.makeApiClient(k8s.RbacAuthorizationV1Api);
      this.networkingApi = this.kubeConfig.makeApiClient(k8s.NetworkingV1Api);
      this.customObjectsApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi);
      
      logger.info('Kubernetes client initialized successfully');
      logger.info(`Current context: ${this.kubeConfig.getCurrentContext()}`);
      
    } catch (error) {
      logger.error('Failed to initialize Kubernetes client:', error);
      throw error;
    }
  }

  // Namespace operations
  async createNamespace(name: string, labels: Record<string, string> = {}, annotations: Record<string, string> = {}): Promise<k8s.V1Namespace> {
    try {
      const namespace: k8s.V1Namespace = {
        metadata: {
          name,
          labels: {
            'platform.io/managed': 'true',
            ...labels
          },
          annotations: {
            'platform.io/provisioned-by': 'namespace-as-a-service',
            'platform.io/provisioned-at': new Date().toISOString(),
            ...annotations
          }
        }
      };

      const response = await this.coreApi.createNamespace(namespace);
      logger.info(`Namespace ${name} created successfully`);
      return response.body;
    } catch (error) {
      logger.error(`Failed to create namespace ${name}:`, error);
      throw error;
    }
  }

  async getNamespace(name: string): Promise<k8s.V1Namespace | null> {
    try {
      const response = await this.coreApi.readNamespace(name);
      return response.body;
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return null;
      }
      logger.error(`Failed to get namespace ${name}:`, error);
      throw error;
    }
  }

  async deleteNamespace(name: string): Promise<void> {
    try {
      await this.coreApi.deleteNamespace(name);
      logger.info(`Namespace ${name} deleted successfully`);
    } catch (error) {
      logger.error(`Failed to delete namespace ${name}:`, error);
      throw error;
    }
  }

  async listNamespaces(labelSelector?: string): Promise<k8s.V1Namespace[]> {
    try {
      const response = await this.coreApi.listNamespace(
        undefined, // pretty
        undefined, // allowWatchBookmarks
        undefined, // _continue
        undefined, // fieldSelector
        labelSelector
      );
      return response.body.items;
    } catch (error) {
      logger.error('Failed to list namespaces:', error);
      throw error;
    }
  }

  // ResourceQuota operations
  async createResourceQuota(namespace: string, quotaSpec: k8s.V1ResourceQuotaSpec): Promise<k8s.V1ResourceQuota> {
    try {
      const resourceQuota: k8s.V1ResourceQuota = {
        metadata: {
          name: `${namespace}-quota`,
          namespace,
          labels: {
            'platform.io/managed': 'true'
          }
        },
        spec: quotaSpec
      };

      const response = await this.coreApi.createNamespacedResourceQuota(namespace, resourceQuota);
      logger.info(`ResourceQuota created for namespace ${namespace}`);
      return response.body;
    } catch (error) {
      logger.error(`Failed to create ResourceQuota for namespace ${namespace}:`, error);
      throw error;
    }
  }

  // LimitRange operations
  async createLimitRange(namespace: string, limits: k8s.V1LimitRangeItem[]): Promise<k8s.V1LimitRange> {
    try {
      const limitRange: k8s.V1LimitRange = {
        metadata: {
          name: `${namespace}-limits`,
          namespace,
          labels: {
            'platform.io/managed': 'true'
          }
        },
        spec: {
          limits
        }
      };

      const response = await this.coreApi.createNamespacedLimitRange(namespace, limitRange);
      logger.info(`LimitRange created for namespace ${namespace}`);
      return response.body;
    } catch (error) {
      logger.error(`Failed to create LimitRange for namespace ${namespace}:`, error);
      throw error;
    }
  }

  // RBAC operations
  async createRoleBinding(
    namespace: string,
    name: string,
    roleRef: k8s.V1RoleRef,
    subjects: k8s.V1Subject[]
  ): Promise<k8s.V1RoleBinding> {
    try {
      const roleBinding: k8s.V1RoleBinding = {
        metadata: {
          name,
          namespace,
          labels: {
            'platform.io/managed': 'true'
          }
        },
        roleRef,
        subjects
      };

      const response = await this.rbacApi.createNamespacedRoleBinding(namespace, roleBinding);
      logger.info(`RoleBinding ${name} created in namespace ${namespace}`);
      return response.body;
    } catch (error) {
      logger.error(`Failed to create RoleBinding ${name} in namespace ${namespace}:`, error);
      throw error;
    }
  }

  // NetworkPolicy operations
  async createNetworkPolicy(
    namespace: string,
    name: string,
    spec: k8s.V1NetworkPolicySpec
  ): Promise<k8s.V1NetworkPolicy> {
    try {
      const networkPolicy: k8s.V1NetworkPolicy = {
        metadata: {
          name,
          namespace,
          labels: {
            'platform.io/managed': 'true'
          }
        },
        spec
      };

      const response = await this.networkingApi.createNamespacedNetworkPolicy(namespace, networkPolicy);
      logger.info(`NetworkPolicy ${name} created in namespace ${namespace}`);
      return response.body;
    } catch (error) {
      logger.error(`Failed to create NetworkPolicy ${name} in namespace ${namespace}:`, error);
      throw error;
    }
  }

  // Custom Resource operations (for Capsule, Istio, etc.)
  async createCustomResource(
    group: string,
    version: string,
    plural: string,
    namespace: string | undefined,
    resource: any
  ): Promise<any> {
    try {
      const response = namespace
        ? await this.customObjectsApi.createNamespacedCustomObject(group, version, namespace, plural, resource)
        : await this.customObjectsApi.createClusterCustomObject(group, version, plural, resource);
      
      logger.info(`Custom resource ${resource.metadata?.name} created`);
      return response.body;
    } catch (error) {
      logger.error(`Failed to create custom resource:`, error);
      throw error;
    }
  }

  async getCustomResource(
    group: string,
    version: string,
    plural: string,
    namespace: string | undefined,
    name: string
  ): Promise<any> {
    try {
      const response = namespace
        ? await this.customObjectsApi.getNamespacedCustomObject(group, version, namespace, plural, name)
        : await this.customObjectsApi.getClusterCustomObject(group, version, plural, name);
      
      return response.body;
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return null;
      }
      logger.error(`Failed to get custom resource ${name}:`, error);
      throw error;
    }
  }

  // Utility methods
  async healthCheck(): Promise<{ healthy: boolean; context: string; server: string }> {
    try {
      const response = await this.coreApi.getAPIVersions();
      return {
        healthy: true,
        context: this.kubeConfig.getCurrentContext(),
        server: this.kubeConfig.getCurrentCluster()?.server || 'unknown'
      };
    } catch (error) {
      logger.error('Kubernetes health check failed:', error);
      return {
        healthy: false,
        context: this.kubeConfig.getCurrentContext(),
        server: this.kubeConfig.getCurrentCluster()?.server || 'unknown'
      };
    }
  }

  // Get resource usage metrics
  async getNamespaceResourceUsage(namespace: string): Promise<{
    podCount: number;
    serviceCount: number;
    deploymentCount: number;
  }> {
    try {
      const [pods, services, deployments] = await Promise.all([
        this.coreApi.listNamespacedPod(namespace),
        this.coreApi.listNamespacedService(namespace),
        this.appsApi.listNamespacedDeployment(namespace)
      ]);

      return {
        podCount: pods.body.items.length,
        serviceCount: services.body.items.length,
        deploymentCount: deployments.body.items.length
      };
    } catch (error) {
      logger.error(`Failed to get resource usage for namespace ${namespace}:`, error);
      throw error;
    }
  }
}

// Singleton instance
let kubernetesClient: KubernetesClient;

export const getKubernetesClient = (): KubernetesClient => {
  if (!kubernetesClient) {
    kubernetesClient = new KubernetesClient();
  }
  return kubernetesClient;
};