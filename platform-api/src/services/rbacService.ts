// Remove unused imports
import { getKubernetesClient } from './kubernetesClient';
import { getClusterConfigService } from '../config/clusters';
import { getAzureADValidationService } from '../middleware/azureAdValidation';
import { logger } from '../utils/logger';
import {
  NamespaceRBACConfiguration,
  RoleAssignmentRequest,
  RBACProvisioningResult,
  AzureServiceOperatorRoleAssignment,
  ClusterConfiguration,
  AKS_ROLE_DEFINITIONS,
  AKSRoleDefinition
} from '../types/rbac';

export interface RBACIntegrationOptions {
  clusterName?: string;
  principalId: string;
  principalType?: 'User' | 'Group';
  roleDefinition?: AKSRoleDefinition;
  customRoleDefinitionId?: string;
  skipValidation?: boolean;
}

export class RBACService {
  private k8sClient = getKubernetesClient();
  private clusterConfigService = getClusterConfigService();
  private azureAdService = getAzureADValidationService();

  async provisionNamespaceRBAC(
    namespaceName: string,
    teamName: string,
    environment: string,
    options: RBACIntegrationOptions
  ): Promise<RBACProvisioningResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting RBAC provisioning', {
        namespaceName,
        teamName,
        environment,
        options
      });

      // Get cluster configuration
      const clusterConfig = this.getClusterConfig(options.clusterName, environment);
      
      // Validate Azure AD principal if not skipped
      if (!options.skipValidation) {
        const validationResult = await this.azureAdService.validatePrincipalById(options.principalId);
        if (!validationResult.valid) {
          throw new Error(`Invalid Azure AD principal: ${validationResult.errors.join(', ')}`);
        }
      }

      // Create role assignment request
      const roleAssignmentRequest = this.createRoleAssignmentRequest(
        clusterConfig,
        namespaceName,
        options
      );

      // Generate ASO manifests
      const asoManifests = this.generateASOManifests(
        clusterConfig,
        namespaceName,
        teamName,
        [roleAssignmentRequest]
      );

      // Apply ASO manifests to management cluster
      await this.applyASOManifests(asoManifests);

      // Create RBAC configuration object
      const rbacConfig: NamespaceRBACConfiguration = {
        namespaceName,
        clusterName: clusterConfig.name,
        teamName,
        environment,
        roleAssignments: [roleAssignmentRequest]
      };

      const result: RBACProvisioningResult = {
        namespaceRBAC: rbacConfig,
        roleAssignmentIds: asoManifests.map(manifest => manifest.metadata.name),
        asoManifests,
        status: 'created',
        message: `RBAC provisioning completed successfully in ${Date.now() - startTime}ms`,
        createdAt: new Date()
      };

      logger.info('RBAC provisioning completed successfully', {
        namespaceName,
        teamName,
        duration: Date.now() - startTime,
        roleAssignmentCount: result.roleAssignmentIds.length
      });

      return result;

    } catch (error) {
      logger.error('RBAC provisioning failed', {
        namespaceName,
        teamName,
        environment,
        error: error.message,
        duration: Date.now() - startTime
      });

      return {
        namespaceRBAC: {
          namespaceName,
          clusterName: options.clusterName || 'unknown',
          teamName,
          environment,
          roleAssignments: []
        },
        roleAssignmentIds: [],
        asoManifests: [],
        status: 'failed',
        message: `RBAC provisioning failed: ${error.message}`,
        createdAt: new Date()
      };
    }
  }

  async getRBACStatus(namespaceName: string, clusterName?: string): Promise<any> {
    try {
      const cluster = this.getClusterConfig(clusterName);
      const labelSelector = `platform.io/namespace=${namespaceName},platform.io/cluster=${cluster.name}`;
      
      // Get ASO RoleAssignment resources
      const roleAssignments = await this.k8sClient.listCustomResources(
        'authorization.azure.com/v1api20200801preview',
        'RoleAssignment',
        'aso-system', // ASO namespace
        labelSelector
      );

      return {
        namespace: namespaceName,
        cluster: cluster.name,
        roleAssignments: roleAssignments.map(ra => ({
          name: ra.metadata?.name,
          principalId: ra.spec?.principalId,
          roleDefinitionId: ra.spec?.roleDefinitionId,
          scope: ra.spec?.scope,
          status: ra.status?.phase || 'unknown',
          createdAt: ra.metadata?.creationTimestamp
        }))
      };

    } catch (error) {
      logger.error('Failed to get RBAC status', { namespaceName, error: error.message });
      throw error;
    }
  }

  async removeNamespaceRBAC(namespaceName: string, clusterName?: string): Promise<void> {
    try {
      const cluster = this.getClusterConfig(clusterName);
      const labelSelector = `platform.io/namespace=${namespaceName},platform.io/cluster=${cluster.name}`;
      
      // Delete ASO RoleAssignment resources
      await this.k8sClient.deleteCustomResourcesByLabel(
        'authorization.azure.com/v1api20200801preview',
        'RoleAssignment',
        'aso-system',
        labelSelector
      );

      logger.info('RBAC resources removed successfully', { namespaceName, clusterName: cluster.name });

    } catch (error) {
      logger.error('Failed to remove RBAC resources', { 
        namespaceName, 
        clusterName, 
        error: error.message 
      });
      throw error;
    }
  }

  private getClusterConfig(clusterName?: string, environment?: string): ClusterConfiguration {
    if (clusterName) {
      const cluster = this.clusterConfigService.getCluster(clusterName);
      if (!cluster) {
        throw new Error(`Cluster '${clusterName}' not found`);
      }
      return cluster;
    }

    if (environment) {
      const clusters = this.clusterConfigService.getClustersByEnvironment(environment);
      if (clusters.length === 0) {
        throw new Error(`No clusters found for environment '${environment}'`);
      }
      return clusters[0]; // Use first cluster for environment
    }

    const defaultCluster = this.clusterConfigService.getDefaultCluster();
    if (!defaultCluster) {
      throw new Error('No default cluster configured');
    }

    return defaultCluster;
  }

  private createRoleAssignmentRequest(
    clusterConfig: ClusterConfiguration,
    namespaceName: string,
    options: RBACIntegrationOptions
  ): RoleAssignmentRequest {
    // Determine role definition ID
    let roleDefinitionId: string;
    
    if (options.customRoleDefinitionId) {
      roleDefinitionId = options.customRoleDefinitionId;
    } else {
      const roleName = options.roleDefinition || 'aks-rbac-admin';
      roleDefinitionId = `/subscriptions/${clusterConfig.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${AKS_ROLE_DEFINITIONS[roleName]}`;
    }

    // Create namespace-scoped ARM ID
    const namespaceScope = this.clusterConfigService.generateNamespaceScopeArmId(clusterConfig, namespaceName);

    return {
      principalId: options.principalId,
      principalType: options.principalType || 'User',
      roleDefinitionId,
      scope: namespaceScope,
      description: `Platform-generated RBAC assignment for namespace ${namespaceName}`
    };
  }

  private generateASOManifests(
    clusterConfig: ClusterConfiguration,
    namespaceName: string,
    teamName: string,
    roleAssignments: RoleAssignmentRequest[]
  ): AzureServiceOperatorRoleAssignment[] {
    return roleAssignments.map((assignment, index) => {
      const manifestName = `rbac-${namespaceName}-${teamName}-${index + 1}`;
      
      const manifest: AzureServiceOperatorRoleAssignment = {
        apiVersion: 'authorization.azure.com/v1api20200801preview',
        kind: 'RoleAssignment',
        metadata: {
          name: manifestName,
          namespace: 'aso-system', // ASO operator namespace
          labels: {
            'platform.io/managed': 'true',
            'platform.io/namespace': namespaceName,
            'platform.io/cluster': clusterConfig.name,
            'platform.io/team': teamName,
            'platform.io/environment': clusterConfig.environment,
            'platform.io/component': 'rbac',
            'platform.io/created-by': 'platform-api'
          },
          annotations: {
            'platform.io/created-at': new Date().toISOString(),
            'platform.io/principal-id': assignment.principalId,
            'platform.io/role-definition': assignment.roleDefinitionId.split('/').pop() || 'unknown'
          }
        },
        spec: {
          owner: {
            armId: clusterConfig.armId
          },
          principalId: assignment.principalId,
          principalType: assignment.principalType,
          roleDefinitionId: assignment.roleDefinitionId,
          scope: assignment.scope,
          description: assignment.description
        }
      };

      return manifest;
    });
  }

  private async applyASOManifests(manifests: AzureServiceOperatorRoleAssignment[]): Promise<void> {
    const promises = manifests.map(async (manifest) => {
      try {
        // Apply custom resource to Kubernetes
        await this.k8sClient.createCustomResource(manifest);
        
        logger.info('ASO RoleAssignment manifest applied', { 
          name: manifest.metadata.name,
          namespace: manifest.metadata.namespace
        });
        
      } catch (error) {
        logger.error('Failed to apply ASO manifest', { 
          name: manifest.metadata.name,
          error: error.message 
        });
        throw error;
      }
    });

    await Promise.all(promises);
  }
}

// Singleton instance
let rbacService: RBACService;

export const getRBACService = (): RBACService => {
  if (!rbacService) {
    rbacService = new RBACService();
  }
  return rbacService;
};