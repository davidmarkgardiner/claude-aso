# Platform API RBAC Integration

This document explains the RBAC (Role-Based Access Control) integration with the Platform API, which enables secure, namespace-level Azure role assignments through Azure Service Operator (ASO).

## 🎯 Overview

The RBAC integration provides a way to automatically configure Azure role assignments at the Kubernetes namespace level, enabling fine-grained access control for teams and users. Instead of manually managing Azure RBAC through the Azure portal, teams can now request namespace access through the Platform API, which automatically provisions the necessary permissions using Azure Service Operator.

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   Platform API  │───▶│   Azure AD       │───▶│   RBAC Service  │───▶│   ASO Controller │
│   (REST API)    │    │   Validation     │    │   (ASO Manifests)│    │   (Azure RBAC)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └──────────────────┘
         │                       │                       │                       │
         │                       │                       │                       │
    HTTP Request            Graph API              K8s CRD              Azure ARM API
    (Team/User)            (Principal Val)        (RoleAssignment)      (Live Permissions)
```

### Components

1. **Platform API** - REST endpoints for RBAC configuration
2. **Azure AD Validation** - Validates users/groups via Microsoft Graph API
3. **RBAC Service** - Generates ASO RoleAssignment manifests
4. **Cluster Configuration** - Manages multi-cluster ARM ID mappings
5. **ASO Controller** - Applies role assignments to Azure

## 🚀 Getting Started

> 📖 **New to RBAC Integration?** Check out our [Production Deployment Guide](docs/RBAC-PRODUCTION-DEPLOYMENT.md) for complete setup instructions.

### Prerequisites

1. **Azure Service Operator** deployed in your cluster
2. **Azure AD Application** with Microsoft Graph permissions
3. **AKS Cluster** with Workload Identity enabled
4. **Platform API** running with appropriate service account

### Quick Start

For a production-ready deployment, run our setup script:

```bash
# Download and run the setup script
curl -sSL https://raw.githubusercontent.com/your-org/platform-api/main/scripts/setup-rbac.sh | bash

# Or manually follow the production deployment guide
open docs/RBAC-PRODUCTION-DEPLOYMENT.md
```

### Environment Setup

```bash
# Required environment variables
export AZURE_CLIENT_ID="your-app-client-id"
export AZURE_CLIENT_SECRET="your-app-client-secret"
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_SUBSCRIPTION_ID="your-subscription-id"

# Optional cluster configuration
export DEV_AKS_ARM_ID="/subscriptions/.../dev-cluster"
export STAGING_AKS_ARM_ID="/subscriptions/.../staging-cluster"
export PROD_AKS_ARM_ID="/subscriptions/.../prod-cluster"
```

## 📋 API Endpoints

### 1. Configure Namespace RBAC

```http
POST /api/platform/namespaces/{namespaceName}/rbac
Authorization: Bearer {token}
Content-Type: application/json

{
  "principalId": "user-object-id-or-group-id",
  "principalType": "User|Group",
  "roleDefinition": "aks-rbac-admin|aks-rbac-reader|aks-rbac-writer",
  "clusterName": "prod-aks-cluster",
  "customRoleDefinitionId": "optional-custom-role-id"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "namespaceRBAC": {
      "namespaceName": "frontend-prod",
      "clusterName": "prod-aks-cluster",
      "teamName": "frontend",
      "environment": "production",
      "roleAssignments": [...]
    },
    "roleAssignmentIds": ["rbac-frontend-prod-frontend-1"],
    "status": "created",
    "message": "RBAC provisioning completed successfully in 1247ms"
  }
}
```

### 2. Get RBAC Status

```http
GET /api/platform/namespaces/{namespaceName}/rbac?clusterName=prod-aks-cluster
Authorization: Bearer {token}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "namespace": "frontend-prod",
    "cluster": "prod-aks-cluster",
    "roleAssignments": [
      {
        "name": "rbac-frontend-prod-frontend-1",
        "principalId": "user-object-id",
        "roleDefinitionId": "/subscriptions/.../aks-rbac-admin",
        "scope": "/subscriptions/.../managedClusters/prod-cluster/namespaces/frontend-prod",
        "status": "Succeeded",
        "createdAt": "2024-01-20T10:30:00Z"
      }
    ]
  }
}
```

### 3. Remove RBAC Configuration

```http
DELETE /api/platform/namespaces/{namespaceName}/rbac?clusterName=prod-aks-cluster
Authorization: Bearer {token}
```

### 4. List Available Clusters

```http
GET /api/platform/namespaces/clusters
Authorization: Bearer {token}
```

## 🔐 Security Model

### Azure AD Integration

The system validates all principals through Azure AD before creating role assignments:

1. **User Validation** - Validates user principal names and object IDs
2. **Group Validation** - Validates Azure AD group memberships
3. **Principal Discovery** - Automatically determines if principal is user or group

### Permission Scoping

Role assignments are scoped to individual namespaces:

```
Scope: /subscriptions/{sub-id}/resourceGroups/{rg}/providers/Microsoft.ContainerService/managedClusters/{cluster}/namespaces/{namespace}
```

This ensures users only get access to their specific namespace, not the entire cluster.

### Supported Roles

| Role              | Description          | Permissions                      |
| ----------------- | -------------------- | -------------------------------- |
| `aks-rbac-admin`  | Full namespace admin | All operations in namespace      |
| `aks-rbac-writer` | Read/write access    | Create, update, delete resources |
| `aks-rbac-reader` | Read-only access     | View resources only              |

## 🛠️ Configuration

### Cluster Configuration

The system supports multiple AKS clusters through the `ClusterConfigurationService`:

```typescript
// Default cluster configurations
{
  name: 'prod-aks-cluster',
  armId: '/subscriptions/.../managedClusters/prod-cluster',
  resourceGroup: 'aks-prod-rg',
  subscriptionId: 'subscription-id',
  region: 'uksouth',
  environment: 'production'
}
```

### Environment-Based Routing

Clusters are automatically selected based on environment:

- `development` → dev-aks-cluster
- `staging` → staging-aks-cluster
- `production` → prod-aks-cluster

## 🔄 ASO Integration Details

### Generated ASO Manifests

The RBAC service generates Azure Service Operator `RoleAssignment` CRDs:

```yaml
apiVersion: authorization.azure.com/v1api20200801preview
kind: RoleAssignment
metadata:
  name: rbac-frontend-prod-frontend-1
  namespace: aso-system
  labels:
    platform.io/managed: "true"
    platform.io/namespace: frontend-prod
    platform.io/cluster: prod-aks-cluster
    platform.io/team: frontend
spec:
  owner:
    armId: /subscriptions/.../managedClusters/prod-cluster
  principalId: "user-object-id"
  principalType: User
  roleDefinitionId: /subscriptions/.../aks-rbac-admin
  scope: /subscriptions/.../managedClusters/prod-cluster/namespaces/frontend-prod
```

### ASO Workflow

1. Platform API receives RBAC request
2. Azure AD validation confirms principal exists
3. RBAC service generates ASO RoleAssignment manifest
4. Manifest applied to `aso-system` namespace
5. ASO controller detects new CRD
6. ASO calls Azure ARM API to create role assignment
7. Role assignment becomes active in Azure

## 🧪 Testing

### Unit Tests

```bash
# Run RBAC service tests
npm test -- tests/unit/services/rbacService.test.ts

# Run Azure AD validation tests
npm test -- tests/unit/middleware/azureAdValidation.test.ts
```

### Integration Tests

```bash
# Run full RBAC workflow tests
npm test -- tests/integration/rbac.test.ts
```

### Manual Testing

```bash
# Test with curl (basic example)
curl -X POST https://platform-api.example.com/api/platform/namespaces/test-ns/rbac \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "principalId": "user@company.com",
    "principalType": "User",
    "roleDefinition": "aks-rbac-admin"
  }'

# Production testing with validation
./scripts/test-rbac-integration.sh --environment staging --validate-all

# Load testing
k6 run tests/load/rbac-load-test.js
```

> 📖 **More Examples**: See [RBAC API Reference](docs/RBAC-API-REFERENCE.md) for comprehensive curl examples and testing scenarios.

```

## 🚨 Troubleshooting

### Common Issues

**1. Azure AD Validation Fails**
```

Error: Invalid Azure AD principal: User 'user@company.com' not found

```
- Verify user exists in Azure AD
- Check Microsoft Graph API permissions
- Ensure service principal has User.Read.All permission

**2. ASO Role Assignment Fails**
```

Error: Failed to create custom resource

```
- Verify ASO is installed and running
- Check `aso-system` namespace exists
- Ensure service account has ASO CRD permissions

**3. Permission Denied**
```

Error: Insufficient permissions. Required roles: platform:admin

````
- Verify user authentication token
- Check user has required platform roles
- Review role mapping configuration

### Debugging Commands

```bash
# Check ASO RoleAssignment status
kubectl get roleassignments -n aso-system -l platform.io/managed=true

# View ASO controller logs
kubectl logs -n aso-system deployment/azureserviceoperator-controller-manager

# Check Platform API logs
kubectl logs -n platform-system deployment/platform-api
````

## 🔧 Development

### Adding New Role Definitions

1. Update `AKS_ROLE_DEFINITIONS` in `src/types/rbac.ts`:

```typescript
export const AKS_ROLE_DEFINITIONS = {
  "aks-rbac-admin": "4abbcc35-c38f-4d58-a5d6-ebe1d4c24128",
  "aks-rbac-reader": "7f6c6a51-bcf8-42ba-9220-52d62157d7db",
  "aks-rbac-writer": "8311e382-0749-4cb8-b61a-304f252e45ec",
  "custom-role": "your-custom-role-definition-id", // Add here
};
```

2. Update role validation in RBAC service
3. Add tests for new role
4. Update documentation

### Adding New Clusters

1. Update cluster configuration:

```typescript
const newCluster: ClusterConfiguration = {
  name: "new-aks-cluster",
  armId: "/subscriptions/.../managedClusters/new-cluster",
  resourceGroup: "new-aks-rg",
  subscriptionId: "subscription-id",
  region: "westeurope",
  environment: "development",
};

clusterConfigService.addCluster(newCluster);
```

2. Set environment variables for new cluster
3. Update tests and documentation

## 📚 Additional Resources

### Documentation

- [📋 API Quick Reference](docs/RBAC-API-REFERENCE.md) - curl examples and endpoint documentation
- [🏗️ Architecture Guide](docs/RBAC-ARCHITECTURE.md) - detailed system design and components
- [🚀 Production Deployment](docs/RBAC-PRODUCTION-DEPLOYMENT.md) - complete setup and configuration
- [🛡️ Security Best Practices](docs/RBAC-SECURITY-GUIDE.md) - security hardening and compliance
- [🔧 Operations Runbook](docs/RBAC-OPERATIONS-RUNBOOK.md) - troubleshooting and maintenance

### External References

- [Azure Service Operator Documentation](https://azure.github.io/azure-service-operator/)
- [Azure RBAC Documentation](https://docs.microsoft.com/en-us/azure/role-based-access-control/)
- [Microsoft Graph API Reference](https://docs.microsoft.com/en-us/graph/api/resources/user)
- [AKS RBAC Integration Guide](https://docs.microsoft.com/en-us/azure/aks/manage-azure-rbac)

## 🤝 Contributing

1. Follow existing code patterns and TypeScript types
2. Add comprehensive tests for new features
3. Update documentation for API changes
4. Ensure ESLint passes before committing
5. Test with multiple cluster configurations

---

For questions or issues, please refer to the main project documentation or create an issue in the repository.
