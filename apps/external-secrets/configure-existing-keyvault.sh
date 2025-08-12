#!/bin/bash

# Configure existing Azure Key Vault for External Secrets
# Uses the existing Key Vault: azwi-kv-e5d0

set -e

# Configuration - Using your existing Key Vault
SUBSCRIPTION_ID="133d5755-4074-4d6e-ad38-eb2a6ad12903"
RESOURCE_GROUP="azwi-quickstart-f2ac"
KEY_VAULT_NAME="azwi-kv-e5d0"
LOCATION="${LOCATION:-uksouth}"

# External Secrets Identity
EXTERNAL_SECRETS_IDENTITY="${EXTERNAL_SECRETS_IDENTITY:-external-secrets-identity}"
EXTERNAL_SECRETS_CLIENT_ID=""

# AKS Configuration
AKS_NAME="${AKS_NAME:-uk8s-tsshared-weu-gt025-int-prod}"
AKS_RESOURCE_GROUP="${AKS_RESOURCE_GROUP:-aks-cluster}"
AKS_OIDC_ISSUER=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "================================================"
echo "🔐 Configuring Existing Azure Key Vault for External Secrets"
echo "================================================"
echo ""
echo "Key Vault: $KEY_VAULT_NAME"
echo "Resource Group: $RESOURCE_GROUP"
echo "Subscription: $SUBSCRIPTION_ID"
echo ""

# Function to check Azure CLI login
check_azure_login() {
    echo -e "${YELLOW}Checking Azure CLI login...${NC}"
    
    if ! az account show &>/dev/null; then
        echo -e "${RED}✗${NC} Not logged in to Azure CLI"
        echo "Please run: az login"
        exit 1
    fi
    
    echo -e "${GREEN}✓${NC} Azure CLI authenticated"
    
    # Set subscription
    az account set --subscription "$SUBSCRIPTION_ID"
    echo -e "${GREEN}✓${NC} Subscription set to: $SUBSCRIPTION_ID"
    
    # Get tenant ID
    TENANT_ID=$(az account show --query tenantId -o tsv)
    echo -e "${GREEN}✓${NC} Tenant ID: $TENANT_ID"
}

# Function to verify Key Vault exists
verify_key_vault() {
    echo -e "\n${BLUE}Verifying Azure Key Vault...${NC}"
    
    if az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
        echo -e "${GREEN}✓${NC} Key Vault $KEY_VAULT_NAME exists"
        
        # Get Key Vault details
        local vault_url=$(az keyvault show \
            --name "$KEY_VAULT_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --query properties.vaultUri -o tsv)
        
        echo -e "${GREEN}✓${NC} Key Vault URL: $vault_url"
    else
        echo -e "${RED}✗${NC} Key Vault $KEY_VAULT_NAME not found in resource group $RESOURCE_GROUP"
        exit 1
    fi
}

# Function to create managed identity for External Secrets
create_managed_identity() {
    echo -e "\n${BLUE}Creating Managed Identity for External Secrets...${NC}"
    
    # Create identity in the same resource group as Key Vault
    if az identity show --name "$EXTERNAL_SECRETS_IDENTITY" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
        echo -e "${YELLOW}⚠${NC} Identity $EXTERNAL_SECRETS_IDENTITY already exists"
    else
        az identity create \
            --name "$EXTERNAL_SECRETS_IDENTITY" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION"
        
        echo -e "${GREEN}✓${NC} Identity $EXTERNAL_SECRETS_IDENTITY created"
    fi
    
    # Get identity details
    EXTERNAL_SECRETS_CLIENT_ID=$(az identity show \
        --name "$EXTERNAL_SECRETS_IDENTITY" \
        --resource-group "$RESOURCE_GROUP" \
        --query clientId -o tsv)
    
    local identity_principal_id=$(az identity show \
        --name "$EXTERNAL_SECRETS_IDENTITY" \
        --resource-group "$RESOURCE_GROUP" \
        --query principalId -o tsv)
    
    echo -e "${GREEN}✓${NC} Identity Client ID: $EXTERNAL_SECRETS_CLIENT_ID"
    echo -e "${GREEN}✓${NC} Identity Principal ID: $identity_principal_id"
}

# Function to configure federated credentials
configure_federated_credentials() {
    echo -e "\n${BLUE}Configuring Federated Credentials...${NC}"
    
    # Get AKS OIDC issuer
    AKS_OIDC_ISSUER=$(az aks show \
        --name "$AKS_NAME" \
        --resource-group "$AKS_RESOURCE_GROUP" \
        --query "oidcIssuerProfile.issuerUrl" -o tsv)
    
    if [ -z "$AKS_OIDC_ISSUER" ]; then
        echo -e "${YELLOW}⚠${NC} No AKS OIDC issuer found. Checking if OIDC is enabled..."
        
        # Try to enable OIDC if not enabled
        echo -e "${YELLOW}Enabling OIDC on AKS cluster...${NC}"
        az aks update \
            --name "$AKS_NAME" \
            --resource-group "$AKS_RESOURCE_GROUP" \
            --enable-oidc-issuer
        
        # Get OIDC issuer again
        AKS_OIDC_ISSUER=$(az aks show \
            --name "$AKS_NAME" \
            --resource-group "$AKS_RESOURCE_GROUP" \
            --query "oidcIssuerProfile.issuerUrl" -o tsv)
    fi
    
    echo -e "${GREEN}✓${NC} AKS OIDC Issuer: $AKS_OIDC_ISSUER"
    
    # Create federated credential
    local fed_cred_name="external-secrets-federated"
    
    if az identity federated-credential show \
        --name "$fed_cred_name" \
        --identity-name "$EXTERNAL_SECRETS_IDENTITY" \
        --resource-group "$RESOURCE_GROUP" &>/dev/null; then
        echo -e "${YELLOW}⚠${NC} Federated credential already exists"
    else
        az identity federated-credential create \
            --name "$fed_cred_name" \
            --identity-name "$EXTERNAL_SECRETS_IDENTITY" \
            --resource-group "$RESOURCE_GROUP" \
            --issuer "$AKS_OIDC_ISSUER" \
            --subject "system:serviceaccount:external-secrets-system:external-secrets" \
            --audiences "api://AzureADTokenExchange"
        
        echo -e "${GREEN}✓${NC} Federated credential configured"
    fi
}

# Function to assign RBAC roles
assign_rbac_roles() {
    echo -e "\n${BLUE}Assigning RBAC roles...${NC}"
    
    local key_vault_id=$(az keyvault show \
        --name "$KEY_VAULT_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query id -o tsv)
    
    # Assign Key Vault Secrets User role
    echo -e "${YELLOW}Assigning Key Vault Secrets User role...${NC}"
    az role assignment create \
        --role "Key Vault Secrets User" \
        --assignee "$EXTERNAL_SECRETS_CLIENT_ID" \
        --scope "$key_vault_id" 2>/dev/null || {
            echo -e "${YELLOW}⚠${NC} Key Vault Secrets User role may already be assigned"
        }
    
    echo -e "${GREEN}✓${NC} Key Vault Secrets User role processed"
    
    # Assign Key Vault Reader role
    echo -e "${YELLOW}Assigning Key Vault Reader role...${NC}"
    az role assignment create \
        --role "Key Vault Reader" \
        --assignee "$EXTERNAL_SECRETS_CLIENT_ID" \
        --scope "$key_vault_id" 2>/dev/null || {
            echo -e "${YELLOW}⚠${NC} Key Vault Reader role may already be assigned"
        }
    
    echo -e "${GREEN}✓${NC} Key Vault Reader role processed"
}

# Function to create External Secrets specific secrets
create_external_secrets_secrets() {
    echo -e "\n${BLUE}Creating External Secrets specific secrets in Key Vault...${NC}"
    
    # Platform API secrets
    local secrets=(
        "platform-jwt-secret:$(openssl rand -base64 32)"
        "platform-db-password:$(openssl rand -base64 16)"
        "platform-azure-client-id:$EXTERNAL_SECRETS_CLIENT_ID"
        "platform-azure-client-secret:$(openssl rand -base64 24)"
        "platform-azure-tenant-id:$TENANT_ID"
        "platform-encryption-key:$(openssl rand -base64 32)"
        "platform-api-key:$(openssl rand -hex 32)"
    )
    
    # Database configuration
    local db_secrets=(
        "platform-db-user:platform_user"
        "platform-db-host:postgres.platform-system.svc.cluster.local"
        "platform-db-port:5432"
        "platform-db-name:platform_db"
        "platform-db-ssl-mode:require"
    )
    
    # Platform UI configuration
    local ui_secrets=(
        "platform-ui-api-url:https://api.platform.example.com"
        "platform-ui-auth-enabled:true"
        "platform-ui-environment:production"
        "platform-ui-feature-darkmode:true"
        "platform-ui-feature-analytics:false"
        "platform-ui-feature-cost-tracking:true"
        "platform-ui-oauth-client-id:$EXTERNAL_SECRETS_CLIENT_ID"
        "platform-ui-oauth-authority:https://login.microsoftonline.com/$TENANT_ID"
        "platform-ui-oauth-redirect-uri:https://platform.example.com/auth/callback"
    )
    
    # External DNS secrets (if not already present)
    local dns_secrets=(
        "external-dns-client-id:$EXTERNAL_SECRETS_CLIENT_ID"
        "external-dns-client-secret:$(openssl rand -base64 24)"
        "dns-resource-group:dns"
        "azure-subscription-id:$SUBSCRIPTION_ID"
        "azure-tenant-id:$TENANT_ID"
    )
    
    # ACME account key for cert-manager (if not already present)
    local cert_secrets=(
        "acme-account-private-key:$(openssl genrsa 2048 2>/dev/null | base64 -w 0)"
    )
    
    # Process all secret arrays
    for secret_array in secrets db_secrets ui_secrets dns_secrets cert_secrets; do
        local -n arr=$secret_array
        for secret_pair in "${arr[@]}"; do
            IFS=':' read -r name value <<< "$secret_pair"
            
            # Check if secret exists
            if az keyvault secret show \
                --vault-name "$KEY_VAULT_NAME" \
                --name "$name" &>/dev/null; then
                echo -e "${YELLOW}⚠${NC} Secret $name already exists (skipping)"
            else
                # Create secret
                az keyvault secret set \
                    --vault-name "$KEY_VAULT_NAME" \
                    --name "$name" \
                    --value "$value" &>/dev/null
                
                echo -e "${GREEN}✓${NC} Secret $name created"
            fi
        done
    done
}

# Function to generate Helm values
generate_helm_values() {
    echo -e "\n${BLUE}Generating Helm values file...${NC}"
    
    cat > external-secrets-values.yaml <<EOF
# External Secrets Helm Values for existing Key Vault
# Generated on $(date)
# Key Vault: $KEY_VAULT_NAME

installCRDs: true

replicaCount: 2

serviceAccount:
  create: true
  name: external-secrets
  annotations:
    azure.workload.identity/client-id: "$EXTERNAL_SECRETS_CLIENT_ID"
  labels:
    azure.workload.identity/use: "true"

podLabels:
  azure.workload.identity/use: "true"
  app.kubernetes.io/component: "external-secrets"

webhook:
  replicaCount: 2

certController:
  replicaCount: 1

resources:
  limits:
    memory: 256Mi
  requests:
    cpu: 10m
    memory: 128Mi

webhook:
  resources:
    limits:
      memory: 128Mi
    requests:
      cpu: 10m
      memory: 64Mi

certController:
  resources:
    limits:
      memory: 128Mi
    requests:
      cpu: 10m
      memory: 64Mi

metrics:
  service:
    enabled: true

securityContext:
  runAsNonRoot: true
  runAsUser: 65534
  fsGroup: 65534

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 65534
  fsGroup: 65534
  seccompProfile:
    type: RuntimeDefault
EOF
    
    echo -e "${GREEN}✓${NC} Helm values file created: external-secrets-values.yaml"
}

# Function to generate ClusterSecretStore manifest
generate_cluster_secret_store() {
    echo -e "\n${BLUE}Generating ClusterSecretStore manifest...${NC}"
    
    cat > cluster-secret-store-azwi.yaml <<EOF
# ClusterSecretStore for existing Azure Key Vault
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-keyvault
  labels:
    platform.io/component: "external-secrets"
spec:
  provider:
    azurekv:
      tenantId: "$TENANT_ID"
      vaultUrl: "https://$KEY_VAULT_NAME.vault.azure.net"
      authType: WorkloadIdentity
      serviceAccountRef:
        name: external-secrets
        namespace: external-secrets-system
EOF
    
    echo -e "${GREEN}✓${NC} ClusterSecretStore manifest created: cluster-secret-store-azwi.yaml"
}

# Function to update kustomization
update_kustomization() {
    echo -e "\n${BLUE}Updating kustomization.yaml...${NC}"
    
    cat > apps/external-secrets/kustomization.yaml <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: external-secrets-system

resources:
  - namespace.yaml
  - helm-repository.yaml
  - helm-release.yaml
  - rbac.yaml

configMapGenerator:
  - name: external-secrets-config
    literals:
      - AZURE_TENANT_ID=$TENANT_ID
      - AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID
      - KEY_VAULT_NAME=$KEY_VAULT_NAME
      - KEY_VAULT_RESOURCE_GROUP=$RESOURCE_GROUP
      - EXTERNAL_SECRETS_CLIENT_ID=$EXTERNAL_SECRETS_CLIENT_ID

patchesStrategicMerge:
  - |-
    apiVersion: helm.toolkit.fluxcd.io/v2
    kind: HelmRelease
    metadata:
      name: external-secrets
      namespace: external-secrets-system
    spec:
      values:
        serviceAccount:
          annotations:
            azure.workload.identity/client-id: "$EXTERNAL_SECRETS_CLIENT_ID"
EOF
    
    echo -e "${GREEN}✓${NC} Kustomization updated with Key Vault details"
}

# Function to display deployment instructions
display_instructions() {
    echo ""
    echo "================================================"
    echo -e "${GREEN}Azure Key Vault configuration completed!${NC}"
    echo "================================================"
    echo ""
    echo "Configuration Summary:"
    echo "  Key Vault Name: $KEY_VAULT_NAME"
    echo "  Key Vault Resource Group: $RESOURCE_GROUP"
    echo "  Identity Name: $EXTERNAL_SECRETS_IDENTITY"
    echo "  Identity Client ID: $EXTERNAL_SECRETS_CLIENT_ID"
    echo "  AKS OIDC Issuer: $AKS_OIDC_ISSUER"
    echo ""
    echo "Next Steps:"
    echo ""
    echo "1. Deploy External Secrets Operator:"
    echo "   helm repo add external-secrets https://charts.external-secrets.io"
    echo "   helm repo update"
    echo "   helm install external-secrets external-secrets/external-secrets \\"
    echo "     -n external-secrets-system --create-namespace \\"
    echo "     -f external-secrets-values.yaml"
    echo ""
    echo "2. Apply ClusterSecretStore:"
    echo "   kubectl apply -f cluster-secret-store-azwi.yaml"
    echo ""
    echo "3. Deploy example secrets:"
    echo "   kubectl apply -f apps/external-secrets/examples/platform-secrets.yaml"
    echo ""
    echo "4. Verify synchronization:"
    echo "   ./apps/external-secrets/scripts/validate-external-secrets.sh prod"
    echo ""
    echo "Environment variables to export:"
    echo "  export KEY_VAULT_NAME=$KEY_VAULT_NAME"
    echo "  export KEY_VAULT_RESOURCE_GROUP=$RESOURCE_GROUP"
    echo "  export EXTERNAL_SECRETS_CLIENT_ID=$EXTERNAL_SECRETS_CLIENT_ID"
    echo "  export AZURE_TENANT_ID=$TENANT_ID"
    echo "  export AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
    echo ""
    echo "To use with Flux GitOps:"
    echo "  kubectl apply -k apps/external-secrets/"
}

# Main execution
main() {
    echo "Starting configuration for existing Azure Key Vault..."
    echo ""
    
    # Check prerequisites
    check_azure_login
    
    # Verify existing Key Vault
    verify_key_vault
    
    # Create and configure identity
    create_managed_identity
    configure_federated_credentials
    assign_rbac_roles
    
    # Create secrets
    create_external_secrets_secrets
    
    # Generate configuration files
    generate_helm_values
    generate_cluster_secret_store
    update_kustomization
    
    # Display instructions
    display_instructions
}

# Run main function
main "$@"