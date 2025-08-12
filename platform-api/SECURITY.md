# Platform API Security Guide

This document outlines the security practices and configurations for the Platform API.

## 🔒 Security Overview

The Platform API has been hardened to eliminate all security vulnerabilities identified in the security audit:

- ✅ **No hardcoded secrets** - All secrets managed via Azure Key Vault + External Secrets
- ✅ **Secure environment variables** - Configuration fails fast if secrets are missing
- ✅ **Encrypted secrets storage** - All sensitive data stored in Azure Key Vault
- ✅ **Test isolation** - Test environment uses separate, safe credentials
- ✅ **Production-ready deployment** - Automated security validation during deployment

## 🚫 What Was Removed

### Hardcoded Fallback Secrets

- Removed default JWT secret: `'your-super-secret-jwt-key-change-in-production'`
- Removed default Azure credentials: `''` empty strings
- Removed default database credentials: `'localhost'`, `'platform'`, `''`
- Removed test secrets from production configuration

### Exposed Docker Credentials

- Removed hardcoded database password: `platform123`
- Removed hardcoded JWT secret: `dev-secret-key-change-in-production`
- Moved all sensitive values to `.env.docker` (which is .gitignored)

### Kubernetes Hardcoded Secrets

- Replaced static base64 encoded secrets with External Secrets
- Deprecated `k8s/platform-api/secret.yaml` in favor of External Secrets

## 🔐 Azure Key Vault Secrets

All secrets are now stored in Azure Key Vault with the following naming convention:

| Secret Name                    | Purpose             | Example Usage             |
| ------------------------------ | ------------------- | ------------------------- |
| `platform-jwt-secret`          | JWT token signing   | Authentication            |
| `platform-azure-client-id`     | Azure AD app ID     | OAuth integration         |
| `platform-azure-client-secret` | Azure AD app secret | OAuth integration         |
| `platform-azure-tenant-id`     | Azure AD tenant     | OAuth integration         |
| `platform-db-host`             | Database hostname   | Database connection       |
| `platform-db-port`             | Database port       | Database connection       |
| `platform-db-name`             | Database name       | Database connection       |
| `platform-db-user`             | Database username   | Database connection       |
| `platform-db-password`         | Database password   | Database connection       |
| `platform-redis-password`      | Redis password      | Cache connection          |
| `platform-encryption-key`      | Data encryption     | Sensitive data encryption |
| `platform-api-key`             | API authentication  | External API calls        |

## 🔄 External Secrets Integration

### ClusterSecretStore Configuration

Ensure the Azure Key Vault ClusterSecretStore is configured:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-keyvault
spec:
  provider:
    azurekv:
      url: "https://your-keyvault.vault.azure.net/"
      authType: WorkloadIdentity
      serviceAccountRef:
        name: external-secrets-sa
        namespace: external-secrets
```

### Secret Synchronization

Secrets are automatically synced from Azure Key Vault using External Secrets:

```bash
# Deploy External Secrets configuration
kubectl apply -f deployment/external-secrets-complete.yaml

# Check secret synchronization status
kubectl get externalsecrets -n platform-system

# Verify secrets were created
kubectl get secrets -n platform-system
```

## 🧪 Test Environment Security

### Secure Test Configuration

Test environment uses isolated, safe credentials:

```typescript
// Tests use configTest.ts which validates:
// 1. NODE_ENV=test is set
// 2. No production secrets are accidentally used
// 3. All test credentials contain 'test' in the name
```

### Test Secret Validation

The test setup automatically validates:

- No production secrets in test environment
- All test credentials are clearly marked as test-only
- Database uses separate test database and user

## 🚀 Secure Deployment

### Deployment Script

Use the secure deployment script that validates security:

```bash
# Run secure deployment with validation
./scripts/deploy-secure.sh
```

The script performs:

- ✅ External Secrets validation
- ✅ Azure Key Vault connectivity check
- ✅ Hardcoded secret scanning
- ✅ Secret synchronization verification
- ✅ Security context validation

### Manual Deployment Steps

1. **Ensure External Secrets is installed:**

   ```bash
   helm repo add external-secrets https://charts.external-secrets.io
   helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
   ```

2. **Configure Azure Key Vault ClusterSecretStore:**

   ```bash
   kubectl apply -f cluster-secret-store.yaml
   ```

3. **Deploy External Secrets configuration:**

   ```bash
   kubectl apply -f deployment/external-secrets-complete.yaml
   ```

4. **Verify secrets are synced:**

   ```bash
   kubectl get secrets -n platform-system
   ```

5. **Deploy the application:**
   ```bash
   kubectl apply -f deployment/
   ```

## 🛡️ Local Development Security

### Docker Compose

For local development with Docker Compose:

1. **Copy the environment template:**

   ```bash
   cp docker-environment.template .env.docker
   ```

2. **Set test values in .env.docker:**

   ```bash
   # Use test-only credentials
   JWT_SECRET=test-jwt-secret-for-local-development-only
   DB_PASSWORD=test-platform-password-local-only
   # ... etc
   ```

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

### Environment Variables

For local development without Docker:

1. **Copy the environment template:**

   ```bash
   cp .env.sample .env.local
   ```

2. **Set test values or leave empty to use External Secrets**

3. **Start development server:**
   ```bash
   npm run dev
   ```

## 🔍 Security Validation

### Automated Scanning

The codebase includes automated security scanning:

```bash
# Run security tests
npm run test:security

# Scan for hardcoded secrets
./scripts/scan-secrets.sh

# Validate configuration security
npm run validate:config
```

### Manual Security Checks

Regular security validation should include:

1. **Secret Management:**
   - No secrets in code or configuration files
   - All secrets in Azure Key Vault
   - External Secrets properly configured

2. **Environment Separation:**
   - Test environment isolated from production
   - No production secrets in test/dev environments
   - Proper secret rotation practices

3. **Deployment Security:**
   - Pods running as non-root user
   - Resource limits configured
   - Network policies applied
   - RBAC properly configured

## ⚠️ Security Best Practices

### DO ✅

- Use External Secrets for all sensitive configuration
- Store secrets in Azure Key Vault
- Use workload identity for authentication
- Implement proper RBAC
- Regular secret rotation
- Monitor secret access logs
- Use separate environments for dev/test/prod

### DON'T ❌

- Hardcode secrets in code or configuration
- Store secrets in Git repositories
- Use the same secrets across environments
- Share production secrets with developers
- Use weak or default passwords
- Disable security features for convenience

## 🆘 Incident Response

### Secret Compromise

If a secret is compromised:

1. **Immediately rotate the secret in Azure Key Vault**
2. **External Secrets will automatically sync the new value**
3. **Restart affected pods to pick up new secrets**
4. **Audit access logs to understand the scope**
5. **Review and improve access controls**

### Emergency Access

For emergency access when External Secrets is unavailable:

1. **Use temporary secrets via kubectl:**

   ```bash
   kubectl create secret generic temp-platform-secrets \
     --from-literal=JWT_SECRET="temp-emergency-secret" \
     -n platform-system
   ```

2. **Update deployment to use temporary secret**
3. **Restore External Secrets as soon as possible**
4. **Rotate all temporary secrets**

## 📞 Support

For security-related questions or incidents:

- **Security Team:** security@company.com
- **Platform Team:** platform@company.com
- **Emergency:** Follow your organization's incident response process

## 📚 References

- [External Secrets Documentation](https://external-secrets.io/)
- [Azure Key Vault Documentation](https://docs.microsoft.com/en-us/azure/key-vault/)
- [Kubernetes Secrets Best Practices](https://kubernetes.io/docs/concepts/configuration/secret/#best-practices)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
