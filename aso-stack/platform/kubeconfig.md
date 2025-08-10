⏺ The platform API specialist has provided a comprehensive analysis of the configuration
  changes needed to migrate from minikube to the AKS cluster. Here's the key documentation
  of what needs to be done:

  Configuration Changes Required for AKS Migration

  1. Primary Configuration Updates

  - Kubernetes Context: Update KUBE_CONTEXT from minikube to
  uk8s-tsshared-weu-gt025-int-prod
  - Kubeconfig Path: Point to AKS kubeconfig instead of local minikube config
  - Docker Compose: Update volume mount to use AKS kubeconfig file

  2. Authentication Setup

  The platform API is already configured for Azure AD but needs these environment
  variables:
  AZURE_CLIENT_ID=<service-principal-client-id>
  AZURE_CLIENT_SECRET=<service-principal-secret>
  AZURE_TENANT_ID=<azure-tenant-id>
  AZURE_SUBSCRIPTION_ID=133d5755-4074-4d6e-ad38-eb2a6ad12903

  3. AKS Cluster Connection

  # Get AKS credentials first
  az aks get-credentials --resource-group rg-my-aks-cluster --name
  uk8s-tsshared-weu-gt025-int-prod

  # Then update environment
  KUBECONFIG=/path/to/aks/kubeconfig
  KUBE_CONTEXT=uk8s-tsshared-weu-gt025-int-prod

  4. Network and Security Considerations

  - AKS cluster has public API endpoint (no VPN required)
  - Azure AD authentication is enabled with RBAC
  - Workload Identity is available for enhanced security
  - Istio service mesh integration is already configured

  5. Good News

  The Platform API is already well-architected for AKS:
  - AKS cluster definitions are already in the config
  - Azure RBAC service integration is implemented
  - ASO resource management is ready
  - Monitoring endpoints just need URL updates

  The migration is primarily about configuration changes rather than code changes, which
  makes it relatively straightforward once the AKS cluster is ready.