#!/bin/bash

# Azure Key Vault Setup Script for External Secrets
# Creates and configures Azure Key Vault with required secrets

set -e

# Configuration
RESOURCE_GROUP="${RESOURCE_GROUP:-aks-cluster}"
KEY_VAULT_NAME="${KEY_VAULT_NAME:-aks-secrets-vault}"
LOCATION="${LOCATION:-uksouth}"
SUBSCRIPTION_ID="${SUBSCRIPTION_ID}"
TENANT_ID="${TENANT_ID}"

# External Secrets Identity
EXTERNAL_SECRETS_IDENTITY="${EXTERNAL_SECRETS_IDENTITY:-external-secrets-identity}"
EXTERNAL_SECRETS_CLIENT_ID=""

# AKS Configuration
AKS_NAME="${AKS_NAME:-uk8s-tsshared-weu-gt025-int-prod}"
AKS_OIDC_ISSUER=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "================================================"
echo "🔐 Azure Key Vault Setup for External Secrets"
echo "================================================"

# Function to check Azure CLI login
check_azure_login() {
    echo -e "${YELLOW}Checking Azure CLI login...${NC}"
    
    if ! az account show &>/dev/null; then
        echo -e "${RED}✗${NC} Not logged in to Azure CLI"
        echo "Please run: az login"
        exit 1
    fi
    
    echo -e "${GREEN}✓${NC} Azure CLI authenticated"
    
    # Set subscription if provided
    if [ -n "$SUBSCRIPTION_ID" ]; then
        az account set --subscription "$SUBSCRIPTION_ID"
        echo -e "${GREEN}✓${NC} Subscription set to: $SUBSCRIPTION_ID"
    fi
}

# Function to create Key Vault
create_key_vault() {
    echo -e "\n${BLUE}Creating Azure Key Vault...${NC}"
    
    # Check if Key Vault exists
    if az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
        echo -e "${YELLOW}⚠${NC} Key Vault $KEY_VAULT_NAME already exists"
    else
        # Create Key Vault
        az keyvault create \
            --name "$KEY_VAULT_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --enable-rbac-authorization true \
            --enable-soft-delete true \
            --retention-days 7 \
            --enable-purge-protection true
        
        echo -e "${GREEN}✓${NC} Key Vault $KEY_VAULT_NAME created"
    fi
}

# Function to create managed identity
create_managed_identity() {
    echo -e "\n${BLUE}Creating Managed Identity for External Secrets...${NC}"
    
    # Check if identity exists
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
    
    echo -e "${GREEN}✓${NC} Identity Client ID: $EXTERNAL_SECRETS_CLIENT_ID"
}

# Function to configure federated credentials
configure_federated_credentials() {
    echo -e "\n${BLUE}Configuring Federated Credentials...${NC}"
    
    # Get AKS OIDC issuer
    AKS_OIDC_ISSUER=$(az aks show \
        --name "$AKS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query "oidcIssuerProfile.issuerUrl" -o tsv)
    
    if [ -z "$AKS_OIDC_ISSUER" ]; then
        echo -e "${RED}✗${NC} Failed to get AKS OIDC issuer URL"
        echo "Make sure OIDC is enabled on your AKS cluster"
        exit 1
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
    az role assignment create \
        --role "Key Vault Secrets User" \
        --assignee "$EXTERNAL_SECRETS_CLIENT_ID" \
        --scope "$key_vault_id" &>/dev/null || true
    
    echo -e "${GREEN}✓${NC} Key Vault Secrets User role assigned"
    
    # Assign Key Vault Reader role
    az role assignment create \
        --role "Key Vault Reader" \
        --assignee "$EXTERNAL_SECRETS_CLIENT_ID" \
        --scope "$key_vault_id" &>/dev/null || true
    
    echo -e "${GREEN}✓${NC} Key Vault Reader role assigned"
}

# Function to create sample secrets
create_sample_secrets() {
    echo -e "\n${BLUE}Creating sample secrets in Key Vault...${NC}"
    
    local secrets=(
        "platform-jwt-secret:$(openssl rand -base64 32)"
        "platform-db-password:$(openssl rand -base64 16)"
        "platform-azure-client-id:00000000-0000-0000-0000-000000000000"
        "platform-azure-client-secret:$(openssl rand -base64 24)"
        "platform-azure-tenant-id:$TENANT_ID"
        "acme-account-private-key:$(openssl genrsa 2048 2>/dev/null | base64 -w 0)"
        "external-dns-client-id:$EXTERNAL_SECRETS_CLIENT_ID"
        "external-dns-client-secret:$(openssl rand -base64 24)"
        "dns-resource-group:dns"
        "azure-subscription-id:$SUBSCRIPTION_ID"
        "azure-tenant-id:$TENANT_ID"
    )
    
    for secret_pair in "${secrets[@]}"; do
        IFS=':' read -r name value <<< "$secret_pair"
        
        # Check if secret exists
        if az keyvault secret show \
            --vault-name "$KEY_VAULT_NAME" \
            --name "$name" &>/dev/null; then
            echo -e "${YELLOW}⚠${NC} Secret $name already exists"
        else
            # Create secret
            az keyvault secret set \
                --vault-name "$KEY_VAULT_NAME" \
                --name "$name" \
                --value "$value" &>/dev/null
            
            echo -e "${GREEN}✓${NC} Secret $name created"
        fi
    done
}

# Function to generate Helm values
generate_helm_values() {
    echo -e "\n${BLUE}Generating Helm values file...${NC}"
    
    cat > external-secrets-values.yaml <<EOF
# External Secrets Helm Values
# Generated on $(date)

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

metrics:
  service:
    enabled: true

# Azure Key Vault Configuration
azureKeyVault:
  tenantId: "$TENANT_ID"
  vaultUrl: "https://$KEY_VAULT_NAME.vault.azure.net"
  identityClientId: "$EXTERNAL_SECRETS_CLIENT_ID"
EOF
    
    echo -e "${GREEN}✓${NC} Helm values file created: external-secrets-values.yaml"
}

# Function to generate ClusterSecretStore manifest
generate_cluster_secret_store() {
    echo -e "\n${BLUE}Generating ClusterSecretStore manifest...${NC}"
    
    cat > cluster-secret-store.yaml <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-keyvault
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
    
    echo -e "${GREEN}✓${NC} ClusterSecretStore manifest created: cluster-secret-store.yaml"
}

# Function to display deployment instructions
display_instructions() {
    echo ""
    echo "================================================"
    echo -e "${GREEN}Azure Key Vault setup completed successfully!${NC}"
    echo "================================================"
    echo ""
    echo "Configuration Summary:"
    echo "  Key Vault Name: $KEY_VAULT_NAME"
    echo "  Resource Group: $RESOURCE_GROUP"
    echo "  Identity Name: $EXTERNAL_SECRETS_IDENTITY"
    echo "  Identity Client ID: $EXTERNAL_SECRETS_CLIENT_ID"
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
    echo "   kubectl apply -f cluster-secret-store.yaml"
    echo ""
    echo "3. Test secret synchronization:"
    echo "   kubectl apply -f apps/external-secrets/examples/platform-secrets.yaml"
    echo ""
    echo "4. Verify synchronization:"
    echo "   ./apps/external-secrets/scripts/validate-external-secrets.sh prod"
    echo ""
    echo "Environment variables to export:"
    echo "  export KEY_VAULT_NAME=$KEY_VAULT_NAME"
    echo "  export EXTERNAL_SECRETS_CLIENT_ID=$EXTERNAL_SECRETS_CLIENT_ID"
    echo "  export AZURE_TENANT_ID=$TENANT_ID"
    echo "  export AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
}

# Main execution
main() {
    echo "Starting Azure Key Vault setup..."
    echo ""
    
    # Check prerequisites
    check_azure_login
    
    # Get tenant ID if not set
    if [ -z "$TENANT_ID" ]; then
        TENANT_ID=$(az account show --query tenantId -o tsv)
        echo -e "${GREEN}✓${NC} Tenant ID: $TENANT_ID"
    fi
    
    # Get subscription ID if not set
    if [ -z "$SUBSCRIPTION_ID" ]; then
        SUBSCRIPTION_ID=$(az account show --query id -o tsv)
        echo -e "${GREEN}✓${NC} Subscription ID: $SUBSCRIPTION_ID"
    fi
    
    # Create resources
    create_key_vault
    create_managed_identity
    configure_federated_credentials
    assign_rbac_roles
    create_sample_secrets
    
    # Generate configuration files
    generate_helm_values
    generate_cluster_secret_store
    
    # Display instructions
    display_instructions
}

# Run main function
main "$@"