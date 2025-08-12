# RBAC Integration Architecture

## 🏗️ System Overview

The RBAC integration provides namespace-level Azure role assignments through a secure, automated workflow that leverages Azure Service Operator (ASO) for declarative infrastructure management.

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                RBAC Integration Flow                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

    User/Team Request                    Platform API                     Azure Services
         │                                    │                                │
         │ POST /namespaces/ns/rbac          │                                │
         ├──────────────────────────────────▶│                                │
         │                                   │                                │
         │                                   │ 1. Validate Request            │
         │                                   ├─────────────────┐              │
         │                                   │                 │              │
         │                                   │ 2. Azure AD     │              │
         │                                   │    Validation   │              │
         │                                   │                 ▼              │
         │                                   │         Graph API ─────────────┤
         │                                   │              ▲                  │
         │                                   │              │                  │
         │                                   │ 3. Generate  │                  │
         │                                   │    ASO        │                  │
         │                                   │    Manifest   │                  │
         │                                   │              ▼                  │
         │                                   │    ┌─────────────────┐          │
         │                                   │    │ ASO RoleAssign  │          │
         │                                   │    │ CRD Created     │          │
         │                                   │    └─────────────────┘          │
         │                                   │              │                  │
         │                                   │              ▼                  │
         │                                   │      ASO Controller             │
         │                                   │              │                  │
         │                                   │              ▼                  │
         │                              ┌────┴────┐  Azure ARM API ────────────┤
         │◀─── Response: RBAC Created ──│ Success │         │                  │
         │                              └─────────┘         ▼                  │
         │                                                Azure RBAC            │
         │                                              (Live Permissions)       │
```

## 🔧 Component Deep Dive

### 1. Platform API Layer

**Location:** `src/routes/namespaces.ts`

```typescript
// RBAC endpoints integrated into namespace management
POST   /api/platform/namespaces/:namespaceName/rbac
GET    /api/platform/namespaces/:namespaceName/rbac
DELETE /api/platform/namespaces/:namespaceName/rbac
GET    /api/platform/namespaces/clusters
```

**Responsibilities:**

- Request validation and sanitization
- Authentication and authorization
- Route RBAC requests to service layer
- Return structured responses

### 2. Azure AD Validation Layer

**Location:** `src/middleware/azureAdValidation.ts`

```typescript
// Validates principals via Microsoft Graph API
await validatePrincipalById(principalId);
```

**Flow:**

1. Extract principal ID from request
2. Query Microsoft Graph API (`https://graph.microsoft.com/v1.0`)
3. Verify user or group exists in Azure AD
4. Return validation result with principal details

**Graph API Calls:**

- `GET /users/{id}` - Validate user principals
- `GET /groups/{id}` - Validate group principals
- Handles 404s and permission errors gracefully

### 3. RBAC Service Layer

**Location:** `src/services/rbacService.ts`

```typescript
// Core business logic for RBAC provisioning
async provisionNamespaceRBAC(namespaceName, teamName, environment, options)
```

**Process:**

1. **Cluster Resolution** - Determine target AKS cluster
2. **Permission Scoping** - Generate namespace-scoped ARM ID
3. **ASO Manifest Generation** - Create RoleAssignment CRD
4. **Kubernetes Deployment** - Apply manifest to `aso-system` namespace

**Key Methods:**

- `generateASOManifests()` - Creates ASO RoleAssignment YAML
- `createRoleAssignmentRequest()` - Builds role assignment specification
- `applyASOManifests()` - Deploys to Kubernetes

### 4. Cluster Configuration Service

**Location:** `src/config/clusters.ts`

```typescript
// Multi-cluster ARM ID management
generateNamespaceScopeArmId(cluster, namespace);
```

**Cluster Mapping:**

```typescript
{
  "dev-aks-cluster": {
    armId: "/subscriptions/.../dev-cluster",
    environment: "development"
  },
  "prod-aks-cluster": {
    armId: "/subscriptions/.../prod-cluster",
    environment: "production"
  }
}
```

**ARM ID Generation:**

```
Base: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.ContainerService/managedClusters/{cluster}
Scoped: {base}/namespaces/{namespace}
```

### 5. Azure Service Operator Integration

**ASO Namespace:** `aso-system`
**CRD:** `authorization.azure.com/v1api20200801preview/RoleAssignment`

**Generated Manifest:**

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
spec:
  owner:
    armId: /subscriptions/.../managedClusters/prod-cluster
  principalId: "azure-ad-principal-id"
  principalType: User|Group
  roleDefinitionId: /subscriptions/.../roleDefinitions/{role-id}
  scope: /subscriptions/.../managedClusters/prod-cluster/namespaces/frontend-prod
```

## 🔐 Security Architecture

### Authentication Flow

```
Client Request → JWT Token → Platform API → Azure AD Groups → Role Mapping
```

### Authorization Layers

1. **API Level** - JWT token validation
2. **Platform Level** - Role-based access (`platform:admin`, `namespace:admin`)
3. **Azure Level** - Azure AD principal validation
4. **Kubernetes Level** - Service account permissions for ASO operations
5. **Azure RBAC Level** - Final namespace-scoped permissions

### Permission Scoping

```
Namespace Scope: /subscriptions/{subscription}/resourceGroups/{rg}/providers/Microsoft.ContainerService/managedClusters/{cluster}/namespaces/{namespace}

Examples:
- frontend-prod scope: .../prod-cluster/namespaces/frontend-prod
- backend-staging scope: .../staging-cluster/namespaces/backend-staging
```

## 🔄 Data Flow

### 1. Request Processing

```typescript
// Incoming request structure
{
  "principalId": "user@company.com",
  "principalType": "User",
  "roleDefinition": "aks-rbac-admin",
  "clusterName": "prod-aks-cluster"
}
```

### 2. Validation Pipeline

```
Request → Schema Validation → Auth Check → Principal Validation → Cluster Validation
```

### 3. ASO Manifest Generation

```typescript
// Transform request into ASO-compatible specification
const roleAssignment = {
  principalId: "validated-object-id",
  roleDefinitionId: "/subscriptions/.../aks-rbac-admin",
  scope: "/subscriptions/.../namespaces/frontend-prod",
};
```

### 4. Kubernetes Deployment

```
Platform API → Kubernetes API → ASO Controller → Azure ARM API → Live RBAC
```

## 📊 State Management

### ASO Resource Lifecycle

```
Created → Pending → Provisioning → Succeeded | Failed
```

### Status Tracking

- **Platform API** - Request/response logging
- **Kubernetes** - ASO CRD status fields
- **Azure** - ARM deployment status
- **Monitoring** - Application Insights integration

### Error Handling

```
Validation Error → 400 Bad Request
Auth Error → 401/403 Unauthorized
Azure AD Error → 400 Validation Error
ASO Error → 500 Internal Server Error
Timeout → 408 Request Timeout
```

## 🔍 Monitoring & Observability

### Key Metrics

- RBAC requests per minute
- Principal validation success rate
- ASO deployment success rate
- Average provisioning time
- Error rates by type

### Logging Strategy

```typescript
// Structured logging with correlation IDs
logger.info("RBAC provisioning started", {
  namespaceName,
  principalId,
  clusterName,
  correlationId: req.headers["x-correlation-id"],
});
```

### Health Checks

- Azure AD Graph API connectivity
- Kubernetes API server connectivity
- ASO controller health
- Platform API service health

## 🚀 Scalability Considerations

### Multi-Cluster Support

- Environment-based cluster routing
- Regional cluster distribution
- Cross-cluster role assignment support

### Performance Optimizations

- Azure AD principal caching
- Bulk role assignment operations
- Asynchronous ASO deployments
- Rate limiting for Graph API calls

### High Availability

- Multiple Platform API replicas
- Azure AD fallback authentication
- ASO controller redundancy
- Database-backed state persistence

---

This architecture provides a secure, scalable foundation for namespace-level RBAC management while leveraging Azure-native services for reliability and compliance.
