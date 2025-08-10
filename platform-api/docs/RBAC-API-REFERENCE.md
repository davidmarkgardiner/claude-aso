# RBAC API Quick Reference

## 🚀 Quick Start Examples

### Configure Team Access

```bash
# Give frontend team admin access to their production namespace
curl -X POST https://platform-api.example.com/api/platform/namespaces/frontend-prod/rbac \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "principalId": "frontend-team-group-id",
    "principalType": "Group",
    "roleDefinition": "aks-rbac-admin",
    "clusterName": "prod-aks-cluster"
  }'
```

### Give User Read Access

```bash
# Give individual user read-only access to staging namespace
curl -X POST https://platform-api.example.com/api/platform/namespaces/backend-staging/rbac \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "principalId": "user@company.com",
    "principalType": "User",
    "roleDefinition": "aks-rbac-reader",
    "clusterName": "staging-aks-cluster"
  }'
```

### Check RBAC Status

```bash
# Check what RBAC assignments exist for a namespace
curl -X GET "https://platform-api.example.com/api/platform/namespaces/frontend-prod/rbac?clusterName=prod-aks-cluster" \
  -H "Authorization: Bearer $TOKEN"
```

### Remove Access

```bash
# Remove all RBAC assignments from namespace
curl -X DELETE "https://platform-api.example.com/api/platform/namespaces/frontend-prod/rbac?clusterName=prod-aks-cluster" \
  -H "Authorization: Bearer $TOKEN"
```

### List Available Clusters

```bash
# See what clusters are available for RBAC configuration
curl -X GET https://platform-api.example.com/api/platform/namespaces/clusters \
  -H "Authorization: Bearer $TOKEN"
```

## 📋 Endpoint Reference

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| `POST` | `/api/platform/namespaces/{ns}/rbac` | Configure RBAC | ✅ namespace:admin |
| `GET` | `/api/platform/namespaces/{ns}/rbac` | Get RBAC status | ✅ namespace:admin |
| `DELETE` | `/api/platform/namespaces/{ns}/rbac` | Remove RBAC | ✅ namespace:admin |
| `GET` | `/api/platform/namespaces/clusters` | List clusters | ✅ platform:viewer |

## 🔑 Principal Types & Roles

### Principal Types
- `User` - Individual Azure AD user
- `Group` - Azure AD security group

### Available Roles
- `aks-rbac-admin` - Full namespace admin (create, read, update, delete)
- `aks-rbac-writer` - Read/write access (create, read, update, delete)
- `aks-rbac-reader` - Read-only access (get, list, watch)

### Finding Principal IDs

```bash
# Find user object ID
az ad user show --id user@company.com --query objectId -o tsv

# Find group object ID  
az ad group show --group "Frontend Team" --query objectId -o tsv
```

## ⚡ Response Examples

### Successful RBAC Configuration

```json
{
  "success": true,
  "data": {
    "namespaceRBAC": {
      "namespaceName": "frontend-prod",
      "clusterName": "prod-aks-cluster", 
      "teamName": "frontend",
      "environment": "production",
      "roleAssignments": [
        {
          "principalId": "group-object-id",
          "principalType": "Group",
          "roleDefinitionId": "/subscriptions/.../aks-rbac-admin",
          "scope": "/subscriptions/.../namespaces/frontend-prod"
        }
      ]
    },
    "roleAssignmentIds": ["rbac-frontend-prod-frontend-1"],
    "status": "created",
    "message": "RBAC provisioning completed successfully in 1247ms",
    "createdAt": "2024-01-20T10:30:00.000Z"
  },
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

### RBAC Status Response

```json
{
  "success": true,
  "data": {
    "namespace": "frontend-prod",
    "cluster": "prod-aks-cluster",
    "roleAssignments": [
      {
        "name": "rbac-frontend-prod-frontend-1",
        "principalId": "group-object-id",
        "roleDefinitionId": "/subscriptions/.../aks-rbac-admin", 
        "scope": "/subscriptions/.../namespaces/frontend-prod",
        "status": "Succeeded",
        "createdAt": "2024-01-20T10:30:00Z"
      }
    ]
  },
  "timestamp": "2024-01-20T10:35:00.000Z"
}
```

### Available Clusters Response

```json
{
  "success": true,
  "data": {
    "clusters": [
      {
        "name": "dev-aks-cluster",
        "environment": "development",
        "region": "uksouth",
        "armId": "/subscriptions/.../managedClusters/dev-cluster"
      },
      {
        "name": "staging-aks-cluster", 
        "environment": "staging",
        "region": "uksouth",
        "armId": "/subscriptions/.../managedClusters/staging-cluster"
      },
      {
        "name": "prod-aks-cluster",
        "environment": "production", 
        "region": "uksouth",
        "armId": "/subscriptions/.../managedClusters/prod-cluster",
        "isDefault": true
      }
    ]
  },
  "timestamp": "2024-01-20T10:40:00.000Z"
}
```

## 🚨 Error Responses

### Invalid Principal

```json
{
  "error": "ValidationError",
  "message": "Invalid Azure AD principal",
  "details": ["User 'nonexistent@company.com' not found in Azure AD"],
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

### Insufficient Permissions

```json
{
  "error": "AuthorizationError", 
  "message": "Insufficient permissions. Required roles: namespace:admin",
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

### Namespace Not Found

```json
{
  "error": "NotFoundError",
  "message": "Namespace 'nonexistent-ns' not found",
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

## 🔄 Integration Patterns

### Namespace Creation with RBAC

```bash
# 1. Create namespace
curl -X POST https://platform-api.example.com/api/platform/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "namespaceName": "new-team-prod",
    "team": "new-team", 
    "environment": "production",
    "resourceTier": "medium"
  }'

# 2. Configure team access
curl -X POST https://platform-api.example.com/api/platform/namespaces/new-team-prod/rbac \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "principalId": "new-team-group-id",
    "principalType": "Group",
    "roleDefinition": "aks-rbac-admin"
  }'
```

### Automated Team Onboarding

```bash
#!/bin/bash
TEAM_NAME="$1"
GROUP_ID="$2" 
ENVIRONMENT="${3:-staging}"

# Create namespace
curl -X POST $PLATFORM_API/api/platform/namespaces \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"namespaceName\": \"${TEAM_NAME}-${ENVIRONMENT}\",
    \"team\": \"$TEAM_NAME\",
    \"environment\": \"$ENVIRONMENT\",
    \"resourceTier\": \"small\"
  }"

# Configure RBAC
curl -X POST $PLATFORM_API/api/platform/namespaces/${TEAM_NAME}-${ENVIRONMENT}/rbac \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"principalId\": \"$GROUP_ID\",
    \"principalType\": \"Group\", 
    \"roleDefinition\": \"aks-rbac-admin\"
  }"
```

## 🛡️ Security Best Practices

1. **Use Groups** - Prefer Azure AD groups over individual users
2. **Least Privilege** - Start with `aks-rbac-reader`, escalate as needed
3. **Environment Isolation** - Different permissions per environment
4. **Regular Audits** - Check RBAC status periodically
5. **Token Management** - Rotate API tokens regularly

---

For detailed implementation guide, see [README-RBAC.md](./README-RBAC.md)