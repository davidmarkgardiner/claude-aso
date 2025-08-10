# RBAC Integration Production Deployment Guide

## 🚀 Pre-Production Checklist

### Infrastructure Prerequisites

```bash
# 1. Create Azure AD App Registration
az ad app create \
  --display-name "Platform-API-RBAC" \
  --required-resource-accesses '[{
    "resourceAppId": "00000003-0000-0000-c000-000000000000",
    "resourceAccess": [{
      "id": "df021288-bdef-4463-88db-98f22de89214",
      "type": "Role"
    }]
  }]'

# 2. Create Service Principal
az ad sp create --id <app-id>

# 3. Grant admin consent for Microsoft Graph permissions
az ad app permission admin-consent --id <app-id>

# 4. Create client secret with expiration
az ad app credential reset --id <app-id> --years 1
```

### Kubernetes Prerequisites

```yaml
# ASO Installation with RBAC
apiVersion: v1
kind: Namespace
metadata:
  name: aso-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: platform-api-rbac
rules:
- apiGroups: ["authorization.azure.com"]
  resources: ["roleassignments"]
  verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
```

## 🔧 Environment Configuration

### Production Environment Variables

```bash
# Azure Authentication
export AZURE_CLIENT_ID="production-app-id"
export AZURE_CLIENT_SECRET="production-client-secret"
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_SUBSCRIPTION_ID="production-subscription-id"

# Cluster Configuration
export PROD_AKS_ARM_ID="/subscriptions/.../managedClusters/prod-cluster"
export STAGING_AKS_ARM_ID="/subscriptions/.../managedClusters/staging-cluster"
export DEV_AKS_ARM_ID="/subscriptions/.../managedClusters/dev-cluster"

# API Configuration
export PLATFORM_API_BASE_URL="https://platform-api.production.com"
export LOG_LEVEL="info"
export ENABLE_REQUEST_LOGGING="true"
```

## 🔐 Security Hardening

### 1. Workload Identity Setup

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: platform-api-rbac
  namespace: platform-system
  annotations:
    azure.workload.identity/client-id: "${AZURE_CLIENT_ID}"
---
apiVersion: managedidentity.azure.com/v1api20181130
kind: UserAssignedIdentity
metadata:
  name: platform-api-identity
spec:
  location: uksouth
  owner:
    armId: /subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}
```

### 2. Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: platform-api-rbac-policy
  namespace: platform-system
spec:
  podSelector:
    matchLabels:
      app: platform-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-system
  egress:
  - to: []  # Azure AD Graph API
    ports:
    - protocol: TCP
      port: 443
```

## 📊 Production Monitoring

### Required Metrics

```typescript
// Application Insights Configuration
const config = {
  metrics: [
    'rbac_requests_total',
    'rbac_requests_duration',
    'azure_ad_validation_success_rate',
    'aso_deployment_success_rate',
    'principal_validation_errors_total'
  ],
  alerts: [
    {
      name: 'RBAC Assignment Failure Rate High',
      condition: 'rbac_failure_rate > 5%',
      severity: 'high'
    }
  ]
};
```

## 🚨 Disaster Recovery

### Backup Procedures

```bash
# 1. Backup ASO RoleAssignments
kubectl get roleassignments -n aso-system -o yaml > rbac-backup-$(date +%Y%m%d).yaml

# 2. Backup Platform API configuration
kubectl get configmap platform-api-config -o yaml > platform-config-backup.yaml
```

### Recovery Procedures

1. **ASO Controller Failure**
   - Redeploy ASO operator
   - Verify existing RoleAssignments are reconciled
   - Test with new assignment creation

2. **Azure AD Service Principal Compromise**
   - Rotate client secret immediately
   - Update Kubernetes secrets
   - Restart Platform API pods
   - Audit recent RBAC assignments

## ✅ Go-Live Checklist

- [ ] Azure AD app registration configured with correct permissions
- [ ] Service principal created and permissions granted
- [ ] ASO operator installed and healthy
- [ ] Platform API deployed with production configuration
- [ ] Network policies applied and tested
- [ ] Monitoring and alerting configured
- [ ] Backup procedures tested
- [ ] Security scan completed
- [ ] Performance testing completed
- [ ] Documentation reviewed and approved