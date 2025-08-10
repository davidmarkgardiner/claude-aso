# Platform API RBAC Setup - Next Steps

## Current Status ✅

The Platform API has been successfully tested with AKS cluster integration:

- ✅ **End-to-End Testing**: Platform API can create/delete namespaces via API calls
- ✅ **AKS Connectivity**: Full integration with `uk8s-tsshared-weu-gt025-int-prod` cluster
- ✅ **Basic RBAC**: Current user has `Azure Kubernetes Service RBAC Cluster Admin` role
- ✅ **Istio Integration**: Cluster has Istio service mesh available for workloads

## Production Architecture Goals 🎯

### Current State (Development)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Platform API  │────│  Personal User   │────│   AKS Cluster   │
│   (Local Dev)   │    │  Identity (AAD)  │    │   (Full Admin)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Target State (Production)
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Platform API  │────│ Managed Identity │────│   AKS Cluster   │
│   (K8s Pod)     │    │ + Workload ID    │    │ (Cluster Admin) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Namespaces    │
                       │  (Admin Role)   │
                       └─────────────────┘
```

## Implementation Roadmap 🚀

### Phase 1: Managed Identity Setup

#### 1.1 Create Platform API Managed Identity
```bash
# Create the managed identity for Platform API
PLATFORM_IDENTITY_NAME="platform-api-identity"
RESOURCE_GROUP="at39473-weu-dev-prod"

az identity create \
  --name $PLATFORM_IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --location uksouth
```

#### 1.2 Configure Workload Identity Federation
```bash
# Get the identity details
PLATFORM_IDENTITY_CLIENT_ID=$(az identity show \
  --name $PLATFORM_IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query clientId -o tsv)

PLATFORM_IDENTITY_PRINCIPAL_ID=$(az identity show \
  --name $PLATFORM_IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --query principalId -o tsv)

# Create federated credential for the Platform API service account
az identity federated-credential create \
  --name "platform-api-federated-credential" \
  --identity-name $PLATFORM_IDENTITY_NAME \
  --resource-group $RESOURCE_GROUP \
  --issuer "https://uk8s-tsshared-weu-gt025-int-prodk8s-cvtz403w.hcp.uksouth.azmk8s.io/" \
  --subject "system:serviceaccount:platform-system:platform-api" \
  --audience api://AzureADTokenExchange
```

### Phase 2: AKS Cluster RBAC Setup

#### 2.1 Assign Cluster Admin Role to Platform API Identity
```bash
# Assign Azure Kubernetes Service RBAC Cluster Admin role
az role assignment create \
  --assignee $PLATFORM_IDENTITY_CLIENT_ID \
  --role "Azure Kubernetes Service RBAC Cluster Admin" \
  --scope /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod
```

#### 2.2 Remove Development User Permissions
```bash
# Remove the development user cluster admin role (security cleanup)
az role assignment delete \
  --assignee "1e63547c-4443-4bbf-8a3c-49f790cdd7c4" \
  --role "Azure Kubernetes Service RBAC Cluster Admin" \
  --scope /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod
```

### Phase 3: Platform API Kubernetes Deployment

#### 3.1 Create Platform System Namespace
```yaml
# platform-system-namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: platform-system
  labels:
    name: platform-system
    managed-by: platform-ops
```

#### 3.2 Create Service Account with Workload Identity
```yaml
# platform-api-serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: platform-api
  namespace: platform-system
  annotations:
    azure.workload.identity/client-id: "${PLATFORM_IDENTITY_CLIENT_ID}"
  labels:
    azure.workload.identity/use: "true"
```

#### 3.3 Deploy Platform API with Workload Identity
```yaml
# platform-api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform-api
  namespace: platform-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: platform-api
  template:
    metadata:
      labels:
        app: platform-api
        azure.workload.identity/use: "true"
    spec:
      serviceAccountName: platform-api
      containers:
      - name: platform-api
        image: platform-api:latest
        env:
        - name: AZURE_CLIENT_ID
          value: "${PLATFORM_IDENTITY_CLIENT_ID}"
        - name: KUBE_CONTEXT
          value: "current"
        - name: NODE_ENV
          value: "production"
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Phase 4: Namespace-Scoped RBAC with ASO

#### 4.1 Create ASO RoleAssignment Template
```yaml
# namespace-rbac-template.yaml
apiVersion: authorization.azure.com/v1beta20200801preview
kind: RoleAssignment
metadata:
  name: "{{ .namespaceName }}-admin-assignment"
  namespace: platform-system
spec:
  properties:
    principalId: "{{ .teamPrincipalId }}"
    principalType: Group
    roleDefinitionId: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/providers/Microsoft.Authorization/roleDefinitions/b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b # AKS RBAC Admin
    scope: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod/namespaces/{{ .namespaceName }}
```

#### 4.2 Enhanced Platform API Namespace Creation Logic
```typescript
// Enhanced namespace creation with ASO RBAC
async function createNamespaceWithRBAC(request: NamespaceRequest): Promise<NamespaceResponse> {
    // 1. Create the namespace
    const namespace = await k8sClient.createNamespace({
        metadata: {
            name: request.name,
            labels: {
                'platform.managed': 'true',
                'platform.team': request.team,
                'platform.environment': request.environment,
                'istio-injection': request.features.includes('istio-injection') ? 'enabled' : 'disabled'
            },
            annotations: {
                'platform.owner': request.owner.email,
                'platform.created-by': 'platform-api'
            }
        }
    });

    // 2. Create ASO RoleAssignment for namespace-scoped admin access
    const roleAssignment = await createRoleAssignment({
        namespaceName: request.name,
        teamPrincipalId: await getTeamPrincipalId(request.team),
        roleDefinitionId: AKS_RBAC_ADMIN_ROLE_ID,
        scope: `${AKS_CLUSTER_SCOPE}/namespaces/${request.name}`
    });

    // 3. Create resource quotas and network policies
    await applyResourceQuota(request.name, request.resourceTier);
    await applyNetworkPolicies(request.name, request.networkPolicy);

    return {
        status: 'success',
        namespaceName: request.name,
        rbacAssignmentId: roleAssignment.metadata.name
    };
}
```

### Phase 5: Security & Compliance

#### 5.1 RBAC Role Definitions
| Role | Scope | Use Case | Permissions |
|------|--------|----------|-------------|
| `AKS RBAC Cluster Admin` | Cluster | Platform API Service | Create/delete namespaces, manage cluster resources |
| `AKS RBAC Admin` | Namespace | Team Members | Full namespace admin (except quotas) |
| `AKS RBAC Writer` | Namespace | Developers | Deploy apps, manage workloads |
| `AKS RBAC Reader` | Namespace | Read-only access | View resources, logs |

#### 5.2 Security Controls
- ✅ **Workload Identity**: No service account keys or secrets
- ✅ **Namespace Isolation**: Teams can only access their namespaces
- ✅ **Resource Quotas**: Prevent resource exhaustion
- ✅ **Network Policies**: Isolate namespace network traffic
- ✅ **Audit Logging**: All Platform API actions logged

### Phase 6: Testing & Validation

#### 6.1 Integration Tests
```bash
# Test Platform API with Managed Identity
curl -X POST http://platform-api.platform-system.svc.cluster.local/api/v1/namespaces \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-team-dev",
    "team": "test-team", 
    "environment": "development",
    "resourceTier": "small",
    "features": ["istio-injection"],
    "owner": {"name": "Test User", "email": "test@company.com"}
  }'
```

#### 6.2 RBAC Validation
```bash
# Verify team member can access their namespace
kubectl auth can-i "*" --as="azure:team-member@company.com" -n test-team-dev

# Verify team member cannot access other namespaces  
kubectl auth can-i "*" --as="azure:team-member@company.com" -n other-team-prod
```

## Migration Strategy 📋

### Step 1: Deploy Alongside Current Setup
- Deploy Platform API with Managed Identity alongside current development setup
- Test all functionality without disrupting current operations

### Step 2: Gradual Permission Migration
- Create namespaces with new RBAC model
- Migrate existing namespaces to use ASO RoleAssignments
- Validate team access to their namespaces

### Step 3: Remove Development Permissions
- Remove personal user cluster admin role
- Ensure all operations work through Platform API service account
- Update documentation and runbooks

### Step 4: Production Hardening
- Enable audit logging for all Platform API operations
- Implement resource quotas and limits
- Set up monitoring and alerting

## Key Benefits 🌟

1. **Security**: No personal accounts with cluster admin privileges
2. **Automation**: ASO manages RBAC assignments as code
3. **Scalability**: Teams get appropriate namespace-scoped permissions  
4. **Compliance**: All access auditable and traceable
5. **Maintainability**: Infrastructure as Code for all RBAC configurations

## Files to Create

1. `aso-stack/platform/identity.yaml` - Platform API Managed Identity
2. `aso-stack/platform/rbac.yaml` - ASO RoleAssignment templates
3. `apps/platform-api/` - Kubernetes manifests for Platform API deployment
4. `platform-api/src/services/rbacService.ts` - Enhanced RBAC management logic

## Next Action Items ✅

- [ ] Create Platform API Managed Identity  
- [ ] Configure Workload Identity Federation
- [ ] Deploy Platform API to AKS cluster
- [ ] Implement ASO-based namespace RBAC
- [ ] Create integration tests
- [ ] Migrate from development to production RBAC model

---

**Ready to implement production-grade namespace-as-a-service with proper security boundaries!** 🚀