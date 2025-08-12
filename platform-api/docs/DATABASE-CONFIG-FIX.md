# Platform API Database Configuration Fix

## Problem

The Platform API pods were crashing with a Zod validation error:

```
"code": "invalid_type", "path": ["database", "username"], "message": "Invalid input: expected string, received undefined"
```

## Root Cause

The Platform API configuration schema in `src/config/config.ts` expects individual database environment variables:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER` (this was causing the validation error)
- `DB_PASSWORD`

However, the Kubernetes deployment was only providing:

- `DATABASE_URL` (from `platform-db-connection` secret)
- `DB_PASSWORD` (from `platform-api-secrets` secret)

The missing individual database environment variables caused Zod schema validation to fail during application startup.

## Solution Implemented

### 1. Updated Kubernetes Deployment

**File**: `/k8s/platform-api/deployment.yaml`

Added missing database environment variables from the `platform-api-secrets` secret:

```yaml
# Database Secrets (from External Secrets/Azure Key Vault)
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: platform-db-connection
      key: DATABASE_URL
- name: DB_HOST
  valueFrom:
    secretKeyRef:
      name: platform-api-secrets
      key: DB_HOST
- name: DB_PORT
  valueFrom:
    secretKeyRef:
      name: platform-api-secrets
      key: DB_PORT
- name: DB_NAME
  valueFrom:
    secretKeyRef:
      name: platform-api-secrets
      key: DB_NAME
- name: DB_USER
  valueFrom:
    secretKeyRef:
      name: platform-api-secrets
      key: DB_USER
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: platform-api-secrets
      key: DB_PASSWORD
```

### 2. Added Missing Environment Variables

Also added other required configuration:

```yaml
# Redis Configuration
- name: REDIS_URL
  value: "redis://localhost:6379" # Update this for your Redis instance
- name: REDIS_PASSWORD
  valueFrom:
    secretKeyRef:
      name: platform-api-secrets
      key: REDIS_PASSWORD
      optional: true

# CORS Configuration
- name: CORS_ORIGINS
  valueFrom:
    configMapKeyRef:
      name: platform-api-config
      key: CORS_ORIGINS
```

### 3. Updated ConfigMap

**File**: `/k8s/platform-api/configmap.yaml`

Added missing configuration values:

```yaml
data:
  NODE_ENV: "development"
  PORT: "3000"
  CORS_ORIGINS: "http://localhost:3000,http://localhost:7007,http://platform-ui.platform-system.svc.cluster.local:3000"
  KUBE_NAMESPACE: "default"
  LOG_LEVEL: "info"
  LOG_FORMAT: "json"
  PLATFORM_COST_TRACKING: "false"
  DB_SSL: "false"
  RATE_LIMIT_MAX_REQUESTS: "1000"
  RATE_LIMIT_WINDOW_MS: "900000"
  # Argo Workflows Configuration
  ARGO_WORKFLOWS_URL: "http://argo-workflows-server.argo:2746"
  ARGO_NAMESPACE: "argo"
  ARGO_TIMEOUT: "30000"
```

### 4. External Secrets Configuration

The External Secrets configuration in `/platform-api/deployment/external-secrets.yaml` already provides all the required database fields:

- `platform-api-secrets` secret contains: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `platform-db-connection` secret contains: `DATABASE_URL` (constructed from individual values)

## Validation

Created a validation script: `/scripts/validate-platform-api-config.sh`

This script checks:

- ConfigMap values are present
- External Secrets are synchronized
- All required secret keys exist
- Database connection string format

### Usage

```bash
# Run validation
./scripts/validate-platform-api-config.sh

# Run with specific namespace
./scripts/validate-platform-api-config.sh platform-system

# Get help
./scripts/validate-platform-api-config.sh --help
```

## Alternative Solution (Not Implemented)

An alternative approach would be to modify the configuration to parse `DATABASE_URL` when individual variables are missing. This would require updating the Zod schema and adding parsing logic.

Example implementation is provided in `/platform-api/src/config/database-config-alternative.ts` for reference.

## Testing the Fix

1. **Apply the updated configuration**:

   ```bash
   kubectl apply -f k8s/platform-api/configmap.yaml
   kubectl apply -f k8s/platform-api/deployment.yaml
   ```

2. **Validate configuration**:

   ```bash
   ./scripts/validate-platform-api-config.sh platform-system
   ```

3. **Check pod startup**:

   ```bash
   kubectl get pods -n platform-system -l app=platform-api
   kubectl logs -n platform-system -l app=platform-api --tail=50
   ```

4. **Verify External Secrets sync**:
   ```bash
   kubectl get externalsecrets -n platform-system
   kubectl describe externalsecret platform-api-secrets -n platform-system
   ```

## Environment Variables Summary

After this fix, the Platform API will receive all required environment variables:

### From ConfigMap (platform-api-config)

- `NODE_ENV`, `PORT`, `CORS_ORIGINS`
- `KUBE_NAMESPACE`, `LOG_LEVEL`, `LOG_FORMAT`
- `PLATFORM_COST_TRACKING`, `DB_SSL`
- `RATE_LIMIT_*`, `ARGO_*`

### From Secrets (platform-api-secrets)

- `JWT_SECRET`
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `REDIS_PASSWORD`, `ENCRYPTION_KEY`, `API_KEY`

### From Secrets (platform-db-connection)

- `DATABASE_URL`

### Static Values

- `REDIS_URL` (hardcoded, update for your environment)

This ensures all Zod validation requirements are met and the Platform API should start successfully.
