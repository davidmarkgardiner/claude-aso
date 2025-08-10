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

### Phase 1: Managed Identity Setup (using ASO)

#### 1.1 Create Platform API Managed Identity
```yaml
# aso-stack/platform/platform-identity.yaml
apiVersion: managedidentity.azure.com/v1api20230131
kind: UserAssignedIdentity
metadata:
  name: platform-api-identity
  namespace: azure-system
spec:
  azureName: platform-api-identity
  location: uksouth
  owner:
    armId: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod
```

#### 1.2 Configure Workload Identity Federation
```yaml
# aso-stack/platform/platform-federated-credential.yaml
apiVersion: managedidentity.azure.com/v1api20230131
kind: FederatedIdentityCredential
metadata:
  name: platform-api-federated-credential
  namespace: azure-system
spec:
  azureName: platform-api-federated-credential
  audience: api://AzureADTokenExchange
  issuer: https://uk8s-tsshared-weu-gt025-int-prodk8s-cvtz403w.hcp.uksouth.azmk8s.io/
  subject: system:serviceaccount:platform-system:platform-api
  owner:
    name: platform-api-identity
```

Apply the ASO manifests:
```bash
kubectl apply -f aso-stack/platform/platform-identity.yaml
kubectl apply -f aso-stack/platform/platform-federated-credential.yaml
```

### Phase 2: AKS Cluster RBAC Setup (using ASO)

#### 2.1 Assign Cluster Admin Role to Platform API Identity
```yaml
# aso-stack/platform/platform-cluster-rbac.yaml
apiVersion: authorization.azure.com/v1api20200801preview
kind: RoleAssignment
metadata:
  name: platform-api-cluster-admin
  namespace: azure-system
spec:
  principalId: $(platform-api-identity.status.principalId)
  principalType: ServicePrincipal
  roleDefinitionId: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/providers/Microsoft.Authorization/roleDefinitions/b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b # AKS RBAC Cluster Admin
  scope: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod
  owner:
    armId: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod
```

#### 2.2 Remove Development User Permissions (using ASO)
Note: To remove existing role assignments using ASO, we would need to identify and delete the corresponding RoleAssignment resource. For cleanup of manually created assignments:
```bash
# Manual cleanup (run once during migration)
az role assignment delete \
  --assignee "1e63547c-4443-4bbf-8a3c-49f790cdd7c4" \
  --role "Azure Kubernetes Service RBAC Cluster Admin" \
  --scope /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod
```

Apply the ASO RBAC assignment:
```bash
kubectl apply -f aso-stack/platform/platform-cluster-rbac.yaml
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
# aso-stack/platform/namespace-rbac-template.yaml
apiVersion: authorization.azure.com/v1api20200801preview
kind: RoleAssignment
metadata:
  name: "{{ .namespaceName }}-admin-assignment"
  namespace: azure-system  # ASO resources in azure-system namespace
spec:
  principalId: "{{ .teamPrincipalId }}"
  principalType: Group
  roleDefinitionId: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/providers/Microsoft.Authorization/roleDefinitions/b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b # AKS RBAC Admin
  scope: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod/namespaces/{{ .namespaceName }}
  owner:
    armId: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod
```

#### 4.2 Enhanced Platform API Namespace Creation Logic (ASO-enabled)
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
    const roleAssignmentManifest = {
        apiVersion: 'authorization.azure.com/v1api20200801preview',
        kind: 'RoleAssignment',
        metadata: {
            name: `${request.name}-admin-assignment`,
            namespace: 'azure-system'
        },
        spec: {
            principalId: await getTeamPrincipalId(request.team),
            principalType: 'Group',
            roleDefinitionId: '/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/providers/Microsoft.Authorization/roleDefinitions/b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b',
            scope: `/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod/namespaces/${request.name}`,
            owner: {
                armId: '/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/at39473-weu-dev-prod/providers/Microsoft.ContainerService/managedClusters/uk8s-tsshared-weu-gt025-int-prod'
            }
        }
    };

    const roleAssignment = await k8sClient.createCustomObject(roleAssignmentManifest);

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

## Files to Create (ASO-based Infrastructure)

1. `aso-stack/platform/platform-identity.yaml` - Platform API Managed Identity (ASO)
2. `aso-stack/platform/platform-federated-credential.yaml` - Workload Identity Federation (ASO)
3. `aso-stack/platform/platform-cluster-rbac.yaml` - Cluster Admin Role Assignment (ASO)
4. `aso-stack/platform/namespace-rbac-template.yaml` - Namespace RBAC template (ASO)
5. `apps/platform-api/` - Kubernetes manifests for Platform API deployment
6. `platform-api/src/services/rbacService.ts` - Enhanced RBAC management logic with ASO integration

## Next Action Items ✅ (ASO-first approach)

- [ ] Create Platform API Managed Identity using ASO (`platform-identity.yaml`)
- [ ] Configure Workload Identity Federation using ASO (`platform-federated-credential.yaml`)
- [ ] Create Cluster RBAC assignment using ASO (`platform-cluster-rbac.yaml`)
- [ ] Deploy Platform API to AKS cluster with Workload Identity
- [ ] Implement ASO-based namespace RBAC templates
- [ ] Update Platform API to create ASO RoleAssignment resources
- [ ] Create integration tests for ASO-managed RBAC
- [ ] Migrate from development to production RBAC model with full ASO automation

---

**Ready to implement production-grade namespace-as-a-service with proper security boundaries!** 🚀