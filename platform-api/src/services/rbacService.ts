import { getKubernetesClient } from './kubernetesClient';
import { getManagedIdentityAuthService } from './managedIdentityAuth';
import { getClusterConfigService } from '../config/clusters';
import { getAzureADValidationService } from '../middleware/azureAdValidation';
import { auditService, RBACauditEvent } from './auditService';
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
import { Request } from 'express';

// Enhanced error classes for better error handling
export class RBACError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public retryable: boolean = false,
    public details?: any
  ) {
    super(message);
    this.name = 'RBACError';
  }
}

export const RBAC_ERROR_CODES = {
  PRINCIPAL_NOT_FOUND: { status: 400, message: 'User or group not found in Azure AD', retryable: false },
  ASO_TIMEOUT: { status: 408, message: 'Role assignment timeout - check status later', retryable: true },
  PERMISSION_DENIED: { status: 403, message: 'Insufficient permissions for this operation', retryable: false },
  CLUSTER_UNAVAILABLE: { status: 503, message: 'Target cluster temporarily unavailable', retryable: true },
  APPROVAL_REQUIRED: { status: 202, message: 'Admin role assignment requires approval', retryable: false },
  QUOTA_EXCEEDED: { status: 429, message: 'Resource quota exceeded', retryable: false },
  VALIDATION_FAILED: { status: 400, message: 'Request validation failed', retryable: false }
};

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
    options: RBACIntegrationOptions,
    req?: Request
  ): Promise<RBACProvisioningResult> {
    const startTime = Date.now();
    const correlationId = req?.headers['x-correlation-id'] as string || this.generateCorrelationId();
    
    // Create audit event template
    const auditEvent: Partial<RBACauditEvent> = {
      action: 'create',
      namespace: namespaceName,
      principalId: options.principalId,
      principalType: options.principalType || 'User',
      roleDefinition: options.roleDefinition || 'aks-rbac-reader',
      clusterName: options.clusterName || this.getDefaultCluster(environment),
      requestedBy: {
        userId: req?.user?.id || 'system',
        email: req?.user?.email || 'system@platform.local',
        roles: req?.user?.roles || ['system']
      },
      sourceIP: req?.ip || 'unknown',
      userAgent: req?.get('user-agent') || 'unknown',
      correlationId,
      timestamp: new Date().toISOString(),
      success: false
    };
    
    try {
      logger.info('Starting RBAC provisioning', {
        namespaceName,
        teamName,
        environment,
        correlationId,
        options: { ...options, principalId: this.maskPrincipalId(options.principalId) }
      });

      // Check if approval is required for admin roles
      if (this.requiresApproval(options.roleDefinition, environment)) {
        await auditService.logApprovalEvent({
          namespace: namespaceName,
          principalId: options.principalId,
          roleDefinition: options.roleDefinition!,
          requestedBy: auditEvent.requestedBy!.userId,
          action: 'requested',
          correlationId
        });
        
        throw new RBACError(
          RBAC_ERROR_CODES.APPROVAL_REQUIRED.message,
          'APPROVAL_REQUIRED',
          RBAC_ERROR_CODES.APPROVAL_REQUIRED.status
        );
      }

      // Get cluster configuration with validation
      const clusterConfig = await this.getClusterConfigWithValidation(options.clusterName, environment);
      auditEvent.clusterName = clusterConfig.name;
      
      // Check resource quotas
      await this.checkResourceQuotas(namespaceName, teamName);
      
      // Validate Azure AD principal with retry logic
      if (!options.skipValidation) {
        const validationResult = await this.validatePrincipalWithRetry(options.principalId);
        if (!validationResult.valid) {
          throw new RBACError(
            `${RBAC_ERROR_CODES.PRINCIPAL_NOT_FOUND.message}: ${validationResult.errors.join(', ')}`,
            'PRINCIPAL_NOT_FOUND',
            RBAC_ERROR_CODES.PRINCIPAL_NOT_FOUND.status,
            false,
            { validationErrors: validationResult.errors }
          );
        }
        
        // Update audit event with resolved principal type
        auditEvent.principalType = validationResult.principalType || auditEvent.principalType;
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

      // Apply ASO manifests with timeout and retry
      await this.applyASOManifestsWithRetry(asoManifests, correlationId);

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

      // Log successful audit event
      auditEvent.success = true;
      auditEvent.details = {
        roleAssignmentIds: result.roleAssignmentIds,
        scope: this.generateNamespaceScopeArmId(clusterConfig, namespaceName),
        duration: Date.now() - startTime
      };
      await auditService.logRBACEvent(auditEvent as RBACauditEvent);

      logger.info('RBAC provisioning completed successfully', {
        namespaceName,
        teamName,
        correlationId,
        duration: Date.now() - startTime,
        roleAssignmentCount: result.roleAssignmentIds.length
      });

      return result;

    } catch (error) {
      // Enhanced error logging with correlation
      logger.error('RBAC provisioning failed', {
        namespaceName,
        teamName,
        environment,
        correlationId,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          code: (error as any)?.code,
          retryable: (error as any)?.retryable || false
        },
        duration: Date.now() - startTime
      });

      // Log failed audit event
      auditEvent.success = false;
      auditEvent.error = error instanceof Error ? error.message : 'Unknown error';
      auditEvent.details = {
        duration: Date.now() - startTime
      };
      await auditService.logRBACEvent(auditEvent as RBACauditEvent);

      // Re-throw as RBACError if not already
      if (error instanceof RBACError) {
        throw error;
      }

      throw new RBACError(
        `RBAC provisioning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PROVISIONING_FAILED',
        500,
        false,
        { originalError: error instanceof Error ? error.name : 'Unknown' }
      );
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
      logger.error('Failed to get RBAC status', { namespaceName, error: error instanceof Error ? error.message : 'Unknown error' });
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
        error: error instanceof Error ? error.message : 'Unknown error' 
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
          namespace: 'azure-system', // ASO operator namespace
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

  private instantiateNamespaceRBACTemplate(
    namespaceName: string,
    teamName: string,
    environment: string,
    teamPrincipalId: string,
    principalType: 'User' | 'Group' = 'Group',
    roleDefinition: AKSRoleDefinition = 'aks-rbac-admin'
  ): AzureServiceOperatorRoleAssignment {
    // Get role definition ID from the AKS_ROLE_DEFINITIONS mapping
    const roleDefinitionId = `/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/providers/Microsoft.Authorization/roleDefinitions/${AKS_ROLE_DEFINITIONS[roleDefinition]}`;
    
    const manifest: AzureServiceOperatorRoleAssignment = {
      apiVersion: 'authorization.azure.com/v1api20200801preview',
      kind: 'RoleAssignment',
      metadata: {
        name: `${namespaceName}-${teamName}-admin`,
        namespace: 'azure-system',
        labels: {
          'platform.io/managed': 'true',
          'platform.io/namespace': namespaceName,
          'platform.io/team': teamName,
          'platform.io/environment': environment,
          'platform.io/component': 'namespace-rbac',
          'platform.io/created-by': 'platform-api'
        },
        annotations: {
          'platform.io/created-at': new Date().toISOString(),
          'platform.io/role-definition': roleDefinition,
          'platform.io/principal-type': principalType
        }
      },
      spec: {
        principalId: teamPrincipalId,
        principalType: principalType,
        roleDefinitionId: roleDefinitionId,
        scope: `/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod/namespaces/${namespaceName}`,
        owner: {
          armId: '/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod'
        },
        description: `Platform-generated RBAC assignment for ${teamName} team access to ${namespaceName} namespace`
      }
    };

    return manifest;
  }

  private async applyASOManifests(manifests: AzureServiceOperatorRoleAssignment[]): Promise<void> {
    const promises = manifests.map(async (manifest) => {
      try {
        // Apply custom resource to Kubernetes
        const [group, version] = manifest.apiVersion.split('/');
        const plural = manifest.kind.toLowerCase() + 's';
        await this.k8sClient.createCustomResource(
          group,
          version,
          plural,
          manifest.metadata.namespace,
          manifest
        );
        
        logger.info('ASO RoleAssignment manifest applied', { 
          name: manifest.metadata.name,
          namespace: manifest.metadata.namespace
        });
        
      } catch (error: unknown) {
        logger.error('Failed to apply ASO manifest', { 
          name: manifest.metadata.name,
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        throw error;
      }
    });

    await Promise.all(promises);
  }

  // Helper methods for enhanced functionality
  
  private generateCorrelationId(): string {
    return `rbac-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private maskPrincipalId(principalId: string): string {
    if (principalId.includes('@')) {
      const [name, domain] = principalId.split('@');
      return `${name.substr(0, 2)}***@${domain}`;
    }
    return `${principalId.substr(0, 8)}***`;
  }

  private requiresApproval(roleDefinition?: AKSRoleDefinition, environment?: string): boolean {
    return roleDefinition === 'aks-rbac-admin' && environment === 'production';
  }

  private getDefaultCluster(environment: string): string {
    const defaults: { [key: string]: string } = {
      'development': 'dev-aks-cluster',
      'staging': 'staging-aks-cluster',
      'production': 'prod-aks-cluster'
    };
    return defaults[environment] || 'dev-aks-cluster';
  }

  private async getClusterConfigWithValidation(clusterName?: string, environment?: string): Promise<ClusterConfiguration> {
    try {
      return this.getClusterConfig(clusterName, environment);
    } catch (error) {
      throw new RBACError(
        RBAC_ERROR_CODES.CLUSTER_UNAVAILABLE.message,
        'CLUSTER_UNAVAILABLE',
        RBAC_ERROR_CODES.CLUSTER_UNAVAILABLE.status,
        true
      );
    }
  }

  private async checkResourceQuotas(namespaceName: string, teamName: string): Promise<void> {
    try {
      // Check current role assignment count for namespace
      const existing = await this.k8sClient.listCustomResources(
        'authorization.azure.com/v1api20200801preview',
        'RoleAssignment',
        'aso-system',
        `platform.io/namespace=${namespaceName}`
      ) as { items?: any[] };

      const maxAssignments = this.getMaxRoleAssignments(teamName);
      if (existing?.items && Array.isArray(existing.items) && existing.items.length >= maxAssignments) {
        throw new RBACError(
          `Maximum role assignments (${maxAssignments}) exceeded for namespace ${namespaceName}`,
          'QUOTA_EXCEEDED',
          RBAC_ERROR_CODES.QUOTA_EXCEEDED.status
        );
      }
    } catch (error) {
      if (error instanceof RBACError) throw error;
      // Log but don't fail on quota check errors
      logger.warn('Resource quota check failed', { namespaceName, teamName, error: error instanceof Error ? error instanceof Error ? error.message : 'Unknown error' : 'Unknown error' });
    }
  }

  private getMaxRoleAssignments(_teamName: string): number {
    // Default quota - can be made configurable per team
    return 10;
  }

  private async validatePrincipalWithRetry(principalId: string, maxRetries: number = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.azureAdService.validatePrincipalById(principalId);
      } catch (error: unknown) {
        if (attempt === maxRetries) {
          logger.error('Azure AD validation failed after all retries', {
            principalId: this.maskPrincipalId(principalId),
            attempts: maxRetries,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt - 1) * 1000;
        logger.warn('Azure AD validation attempt failed, retrying', {
          principalId: this.maskPrincipalId(principalId),
          attempt,
          retryAfter: delay
        });
        await this.sleep(delay);
      }
    }
  }

  private async applyASOManifestsWithRetry(manifests: AzureServiceOperatorRoleAssignment[], correlationId: string): Promise<void> {
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    try {
      await Promise.race([
        this.applyASOManifests(manifests),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('ASO manifest application timeout')), timeout)
        )
      ]);
    } catch (error) {
      if (Date.now() - startTime >= timeout) {
        throw new RBACError(
          RBAC_ERROR_CODES.ASO_TIMEOUT.message,
          'ASO_TIMEOUT',
          RBAC_ERROR_CODES.ASO_TIMEOUT.status,
          true,
          { correlationId, timeout }
        );
      }
      throw error;
    }
  }

  private generateNamespaceScopeArmId(clusterConfig: ClusterConfiguration, namespaceName: string): string {
    return `${clusterConfig.armId}/namespaces/${namespaceName}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async validateManagedIdentityAuthentication(): Promise<void> {
    try {
      const managedIdentityService = getManagedIdentityAuthService();
      const isValid = await managedIdentityService.validateAuthentication();
      
      if (!isValid) {
        throw new RBACError(
          'Managed identity authentication failed',
          'AUTHENTICATION_FAILED',
          401,
          false
        );
      }

      logger.info('Managed identity authentication validated successfully');
    } catch (error) {
      logger.error('Managed identity authentication validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new RBACError(
        `Authentication validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AUTHENTICATION_FAILED',
        401,
        false
      );
    }
  }

  async validatePlatformApiPermissions(): Promise<boolean> {
    try {
      // Validate that the platform API service account has cluster admin permissions
      const testNamespace = `platform-test-${Date.now()}`;
      
      // Try to create a test namespace
      await this.k8sClient.createNamespace(testNamespace, {
        'platform.io/test': 'true'
      });
      
      // Clean up the test namespace
      await this.k8sClient.deleteNamespace(testNamespace);
      
      logger.info('Platform API permissions validated successfully');
      return true;
      
    } catch (error) {
      logger.error('Platform API permissions validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  async createNamespaceWithEnhancedRBAC(
    request: {
      name: string;
      teamName: string;
      environment: string;
      teamPrincipalId: string;
      principalType?: 'User' | 'Group';
      roleDefinition?: AKSRoleDefinition;
      features?: string[];
      resourceTier?: string;
    }
  ): Promise<RBACProvisioningResult> {
    const startTime = Date.now();
    
    try {
      // Validate managed identity authentication first
      await this.validateManagedIdentityAuthentication();
      
      // Create the namespace
      await this.k8sClient.createNamespace(request.name, {
        'platform.io/managed': 'true',
        'platform.io/team': request.teamName,
        'platform.io/environment': request.environment,
        'istio-injection': request.features?.includes('istio-injection') ? 'enabled' : 'disabled'
      }, {
        'platform.io/created-by': 'platform-api',
        'platform.io/team-principal-id': request.teamPrincipalId
      });

      // Create namespace-scoped RBAC using ASO template
      const rbacManifest = this.instantiateNamespaceRBACTemplate(
        request.name,
        request.teamName,
        request.environment,
        request.teamPrincipalId,
        request.principalType || 'Group',
        request.roleDefinition || 'aks-rbac-admin'
      );

      // Apply the ASO RoleAssignment manifest
      const [group, version] = rbacManifest.apiVersion.split('/');
      const plural = rbacManifest.kind.toLowerCase() + 's';
      await this.k8sClient.createCustomResource(
        group,
        version,
        plural,
        rbacManifest.metadata.namespace,
        rbacManifest
      );

      // Apply resource quotas based on tier
      if (request.resourceTier) {
        await this.applyResourceQuotaForTier(request.name, request.resourceTier);
      }

      // Apply default network policies
      await this.applyDefaultNetworkPolicies(request.name);

      const result: RBACProvisioningResult = {
        namespaceRBAC: {
          namespaceName: request.name,
          clusterName: 'uk8s-tsshared-weu-gt025-int-prod',
          teamName: request.teamName,
          environment: request.environment,
          roleAssignments: [{
            principalId: request.teamPrincipalId,
            principalType: request.principalType || 'Group',
            roleDefinitionId: `/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/providers/Microsoft.Authorization/roleDefinitions/${AKS_ROLE_DEFINITIONS[request.roleDefinition || 'aks-rbac-admin']}`,
            scope: `/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod/namespaces/${request.name}`,
            description: `Platform-generated RBAC assignment for ${request.teamName} team access to ${request.name} namespace`
          }]
        },
        roleAssignmentIds: [rbacManifest.metadata.name],
        asoManifests: [rbacManifest],
        status: 'created',
        message: `Namespace ${request.name} created successfully with RBAC in ${Date.now() - startTime}ms`,
        createdAt: new Date()
      };

      logger.info('Enhanced namespace creation with RBAC completed successfully', {
        namespaceName: request.name,
        teamName: request.teamName,
        duration: Date.now() - startTime
      });

      return result;

    } catch (error) {
      logger.error('Enhanced namespace creation with RBAC failed', {
        namespaceName: request.name,
        teamName: request.teamName,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  private async applyResourceQuotaForTier(namespaceName: string, tier: string): Promise<void> {
    const quotaSpecs = {
      small: {
        hard: {
          'requests.cpu': '2',
          'requests.memory': '4Gi',
          'limits.cpu': '4',
          'limits.memory': '8Gi',
          'persistentvolumeclaims': '4',
          'services': '5',
          'secrets': '10'
        }
      },
      medium: {
        hard: {
          'requests.cpu': '4',
          'requests.memory': '8Gi',
          'limits.cpu': '8',
          'limits.memory': '16Gi',
          'persistentvolumeclaims': '10',
          'services': '10',
          'secrets': '20'
        }
      },
      large: {
        hard: {
          'requests.cpu': '8',
          'requests.memory': '16Gi',
          'limits.cpu': '16',
          'limits.memory': '32Gi',
          'persistentvolumeclaims': '20',
          'services': '20',
          'secrets': '40'
        }
      }
    };

    const quotaSpec = (quotaSpecs as any)[tier] || quotaSpecs.small;
    await this.k8sClient.createResourceQuota(namespaceName, quotaSpec);
  }

  private async applyDefaultNetworkPolicies(namespaceName: string): Promise<void> {
    // Default deny all ingress traffic policy
    const denyAllIngressPolicy = {
      podSelector: {},
      policyTypes: ['Ingress']
    };

    await this.k8sClient.createNetworkPolicy(
      namespaceName,
      'deny-all-ingress',
      denyAllIngressPolicy
    );

    // Allow ingress from same namespace
    const allowSameNamespacePolicy = {
      podSelector: {},
      ingress: [{
        from: [{ namespaceSelector: { matchLabels: { name: namespaceName } } }]
      }],
      policyTypes: ['Ingress']
    };

    await this.k8sClient.createNetworkPolicy(
      namespaceName,
      'allow-same-namespace',
      allowSameNamespacePolicy
    );
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