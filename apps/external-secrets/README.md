# External Secrets Operator Configuration

This directory contains the configuration for External Secrets Operator, which synchronizes secrets from Azure Key Vault to Kubernetes.

## Existing Azure Key Vault

We're using the existing Key Vault:

- **Name**: `azwi-kv-e5d0`
- **Resource Group**: `azwi-quickstart-f2ac`
- **Subscription**: `133d5755-4074-4d6e-ad38-eb2a6ad12903`

## Quick Setup

### 1. Configure the existing Key Vault

Run the configuration script to set up identity and permissions:

```bash
./configure-existing-keyvault.sh
```

This script will:

- Create a managed identity for External Secrets
- Configure federated credentials with your AKS OIDC issuer
- Assign necessary RBAC roles to the Key Vault
- Create required secrets in the Key Vault
- Generate Helm values and ClusterSecretStore manifests

### 2. Deploy External Secrets Operator

Using Helm:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets-system --create-namespace \
  -f external-secrets-values.yaml
```

Or using Flux GitOps:

```bash
kubectl apply -k .
```

### 3. Apply ClusterSecretStore

After the operator is running:

```bash
kubectl apply -f cluster-secret-store-azwi.yaml
```

### 4. Deploy External Secrets

Apply the example configurations:

```bash
# Platform API secrets
kubectl apply -f examples/platform-secrets.yaml

# Development secrets (for minikube)
kubectl apply -f examples/dev-secrets.yaml
```

### 5. Validate

Run the validation script:

```bash
./scripts/validate-external-secrets.sh prod
```

## Directory Structure

```
external-secrets/
├── namespace.yaml                 # External Secrets system namespace
├── helm-repository.yaml          # Helm chart repository
├── helm-release.yaml            # Helm release configuration
├── cluster-secret-store.yaml    # Azure Key Vault secret store
├── rbac.yaml                    # RBAC roles and bindings
├── kustomization.yaml           # Kustomize configuration
├── configure-existing-keyvault.sh # Setup script for existing KV
├── examples/
│   ├── platform-secrets.yaml   # Production secret examples
│   └── dev-secrets.yaml        # Development secret examples
└── scripts/
    └── validate-external-secrets.sh # Validation script
```

## Secret Management

### Production (AKS)

- Secrets are stored in Azure Key Vault (`azwi-kv-e5d0`)
- External Secrets Operator syncs them to Kubernetes
- Uses Workload Identity for authentication

### Development (Minikube)

- Uses Kubernetes secrets backend
- Secrets stored in `external-secrets-system` namespace
- SecretStore references these for development

## Troubleshooting

### Check operator status

```bash
kubectl get pods -n external-secrets-system
kubectl logs -n external-secrets-system -l app.kubernetes.io/name=external-secrets
```

### Check secret store connection

```bash
kubectl get clustersecretstore azure-keyvault -o yaml
kubectl describe clustersecretstore azure-keyvault
```

### Check external secret sync

```bash
kubectl get externalsecrets --all-namespaces
kubectl describe externalsecret <name> -n <namespace>
```

### Verify workload identity

```bash
kubectl describe sa external-secrets -n external-secrets-system
kubectl describe pod -n external-secrets-system -l app.kubernetes.io/name=external-secrets
```

## Required Environment Variables

Export these after running the configuration script:

```bash
export KEY_VAULT_NAME=azwi-kv-e5d0
export KEY_VAULT_RESOURCE_GROUP=azwi-quickstart-f2ac
export EXTERNAL_SECRETS_CLIENT_ID=<identity-client-id>
export AZURE_TENANT_ID=<tenant-id>
export AZURE_SUBSCRIPTION_ID=133d5755-4074-4d6e-ad38-eb2a6ad12903
```
