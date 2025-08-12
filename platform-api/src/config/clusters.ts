import { ClusterConfiguration } from "../types/rbac";

// In a production environment, this would be loaded from a database or configuration service
export class ClusterConfigurationService {
  private clusters: Map<string, ClusterConfiguration> = new Map();

  constructor() {
    this.loadDefaultClusters();
  }

  private loadDefaultClusters(): void {
    // These would typically be loaded from environment variables or a config service
    const defaultClusters: ClusterConfiguration[] = [
      {
        name: "dev-aks-cluster",
        armId:
          process.env.DEV_AKS_ARM_ID ||
          "/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/aks-cluster/providers/Microsoft.ContainerService/managedClusters/dev-cluster",
        resourceGroup: process.env.DEV_AKS_RG || "aks-cluster",
        subscriptionId:
          process.env.AZURE_SUBSCRIPTION_ID ||
          "133d5755-4074-4d6e-ad38-eb2a6ad12903",
        region: "uksouth",
        environment: "development",
        isDefault: true,
      },
      {
        name: "staging-aks-cluster",
        armId:
          process.env.STAGING_AKS_ARM_ID ||
          "/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/aks-cluster/providers/Microsoft.ContainerService/managedClusters/staging-cluster",
        resourceGroup: process.env.STAGING_AKS_RG || "aks-cluster",
        subscriptionId:
          process.env.AZURE_SUBSCRIPTION_ID ||
          "133d5755-4074-4d6e-ad38-eb2a6ad12903",
        region: "uksouth",
        environment: "staging",
      },
      {
        name: "prod-aks-cluster",
        armId:
          process.env.PROD_AKS_ARM_ID ||
          "/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/aks-cluster/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod",
        resourceGroup: process.env.PROD_AKS_RG || "aks-cluster",
        subscriptionId:
          process.env.AZURE_SUBSCRIPTION_ID ||
          "133d5755-4074-4d6e-ad38-eb2a6ad12903",
        region: "uksouth",
        environment: "production",
      },
    ];

    defaultClusters.forEach((cluster) => {
      this.clusters.set(cluster.name, cluster);
    });
  }

  getCluster(name: string): ClusterConfiguration | undefined {
    return this.clusters.get(name);
  }

  getAllClusters(): ClusterConfiguration[] {
    return Array.from(this.clusters.values());
  }

  getClustersByEnvironment(environment: string): ClusterConfiguration[] {
    return Array.from(this.clusters.values()).filter(
      (cluster) => cluster.environment === environment,
    );
  }

  getDefaultCluster(): ClusterConfiguration | undefined {
    return Array.from(this.clusters.values()).find(
      (cluster) => cluster.isDefault,
    );
  }

  addCluster(cluster: ClusterConfiguration): void {
    this.clusters.set(cluster.name, cluster);
  }

  removeCluster(name: string): boolean {
    return this.clusters.delete(name);
  }

  generateNamespaceScopeArmId(
    clusterConfig: ClusterConfiguration,
    namespaceName: string,
  ): string {
    return `${clusterConfig.armId}/namespaces/${namespaceName}`;
  }

  validateClusterConfiguration(cluster: ClusterConfiguration): string[] {
    const errors: string[] = [];

    if (!cluster.name) {
      errors.push("Cluster name is required");
    }

    if (!cluster.armId) {
      errors.push("ARM ID is required");
    }

    if (!cluster.resourceGroup) {
      errors.push("Resource group is required");
    }

    if (!cluster.subscriptionId) {
      errors.push("Subscription ID is required");
    }

    if (
      !["development", "staging", "production"].includes(cluster.environment)
    ) {
      errors.push("Environment must be development, staging, or production");
    }

    // Validate ARM ID format
    if (cluster.armId && !this.isValidArmId(cluster.armId)) {
      errors.push("Invalid ARM ID format");
    }

    return errors;
  }

  private isValidArmId(armId: string): boolean {
    const armIdPattern =
      /^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.ContainerService\/managedClusters\/[^/]+$/i;
    return armIdPattern.test(armId);
  }
}

// Singleton instance
let clusterConfigService: ClusterConfigurationService;

export const getClusterConfigService = (): ClusterConfigurationService => {
  if (!clusterConfigService) {
    clusterConfigService = new ClusterConfigurationService();
  }
  return clusterConfigService;
};
