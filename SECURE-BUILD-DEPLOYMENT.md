# Secure Build and Deployment Guide

This guide documents the secure build and deployment process for the Platform API and UI services, integrated with External Secrets and Azure Key Vault.

## 🔒 Security Overview

The platform implements a comprehensive security model:

- **No Secrets in Images**: All secrets are sourced from Azure Key Vault via External Secrets
- **Vulnerability Scanning**: Container images are scanned with Trivy before deployment
- **Secret Leak Detection**: Source code is scanned for hardcoded secrets
- **Security Hardening**: Containers run as non-root users with security contexts
- **Runtime Validation**: Deployment validates External Secrets synchronization

## 📋 Prerequisites

### Required Tools

```bash
# Container tools
docker
docker-buildx

# Kubernetes tools
kubectl
helm

# Security tools
trivy           # Container vulnerability scanning
detect-secrets  # Secret leak detection
kubeval         # Kubernetes manifest validation

# Optional tools
yq              # YAML processing
jq              # JSON processing
```

### External Secrets Setup

Ensure External Secrets Operator is deployed and configured:

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets-system --create-namespace

# Verify installation
kubectl get pods -n external-secrets-system
kubectl get crd | grep external-secrets
```

### Azure Key Vault Configuration

Required secrets in Azure Key Vault (Key Vault name: `azwi-kv-e5d0`):

#### Platform API Secrets

- `platform-jwt-secret` - JWT signing secret
- `platform-azure-client-id` - Azure AD client ID
- `platform-azure-client-secret` - Azure AD client secret
- `platform-azure-tenant-id` - Azure AD tenant ID
- `platform-db-host` - Database hostname
- `platform-db-port` - Database port
- `platform-db-name` - Database name
- `platform-db-user` - Database username
- `platform-db-password` - Database password
- `platform-db-ssl-mode` - Database SSL mode
- `platform-redis-password` - Redis password
- `platform-encryption-key` - Application encryption key
- `platform-api-key` - API key for service authentication

## 🛠 Build Process

### Secure Build Script

Use the secure build script for all builds:

```bash
# Build for local development (Minikube)
./scripts/build-platform-secure.sh --version v1.0.0

# Build and push to registry
./scripts/build-platform-secure.sh \
  --version v1.0.0 \
  --registry davidgardiner \
  --push

# Build with security scanning disabled (not recommended)
./scripts/build-platform-secure.sh \
  --version v1.0.0 \
  --skip-scan

# Build development images
./scripts/build-platform-secure.sh \
  --version dev \
  --target development
```

### Build Security Features

1. **Source Code Scanning**
   - Scans for hardcoded secrets using detect-secrets
   - Validates no sensitive patterns in source code
   - Fails build if secrets are detected

2. **Dockerfile Security**
   - Multi-stage builds to minimize image size
   - Non-root user execution
   - Security labels and metadata
   - No secrets copied into images
   - Comprehensive .dockerignore files

3. **Vulnerability Scanning**
   - Trivy scanning for HIGH/CRITICAL vulnerabilities
   - Build fails on security issues
   - Security reports generated

4. **Build Artifact Verification**
   - Validates no secret files in final images
   - Verifies security labels
   - Confirms proper image metadata

## 🚀 Deployment Process

### Secure Deployment Script

Use the secure deployment script for all deployments:

```bash
# Deploy to development
./scripts/deploy-platform-secure.sh \
  --version v1.0.0 \
  --environment development

# Deploy to production with extended timeout
./scripts/deploy-platform-secure.sh \
  --version v1.0.0 \
  --environment production \
  --timeout 600

# Dry run deployment (validation only)
./scripts/deploy-platform-secure.sh \
  --version v1.0.0 \
  --dry-run

# Force deployment (override warnings)
./scripts/deploy-platform-secure.sh \
  --version v1.0.0 \
  --force
```

### Deployment Security Features

1. **Pre-deployment Validation**
   - Validates External Secrets Operator is running
   - Checks ClusterSecretStore configuration
   - Verifies Azure Key Vault connectivity

2. **External Secrets Deployment**
   - Deploys External Secrets manifests
   - Waits for secret synchronization
   - Validates all required secrets are available

3. **Secure Application Deployment**
   - Updates deployment manifests with correct image versions
   - Applies security contexts and resource limits
   - Waits for deployment readiness with health checks

4. **Runtime Security Validation**
   - Validates pods run as non-root users
   - Checks resource limits are applied
   - Verifies secrets are properly mounted

## 🔍 Validation and Testing

### Comprehensive Validation

Run the comprehensive validation script:

```bash
# Full validation
./scripts/validate-secure-platform.sh

# Validation with verbose output
./scripts/validate-secure-platform.sh --verbose

# Validate specific environment
./scripts/validate-secure-platform.sh \
  --environment production \
  --namespace platform-system
```

### Validation Categories

1. **Source Code Security**
   - .dockerignore file validation
   - Hardcoded secret detection
   - detect-secrets baseline checks

2. **Docker Security**
   - Dockerfile security practices
   - Non-root user configuration
   - Security labels and health checks

3. **External Secrets Configuration**
   - External Secrets manifest validation
   - ClusterSecretStore connectivity
   - Secret mapping verification

4. **Kubernetes Security**
   - Security context configuration
   - Resource limits and probes
   - RBAC and service account setup

5. **Deployment Readiness**
   - Build and deployment scripts
   - CI/CD workflow configuration
   - Validation script availability

### Manual Testing

#### Test External Secrets Synchronization

```bash
# Check External Secrets status
kubectl get externalsecrets -n platform-system

# Verify secrets were created
kubectl get secrets -n platform-system | grep platform-

# Check specific secret content (be careful with sensitive data)
kubectl get secret platform-api-secrets -n platform-system -o yaml
```

#### Test Application Health

```bash
# Port-forward to Platform API
kubectl port-forward -n platform-system service/platform-api 3000:80

# Test health endpoint
curl http://localhost:3000/health

# Check application logs
kubectl logs -n platform-system deployment/platform-api --tail=50
```

#### Test Security Context

```bash
# Check pod security context
kubectl get pods -n platform-system -l app=platform-api -o jsonpath='{.items[*].spec.securityContext}'

# Verify non-root execution
kubectl exec -it deployment/platform-api -n platform-system -- whoami
```

## 🔄 CI/CD Integration

### GitHub Actions Workflow

The secure CI/CD pipeline (`.github/workflows/secure-build-deploy.yml`) includes:

1. **Security Pre-checks**
   - Secret scanning with detect-secrets
   - Dockerfile linting with hadolint
   - Kubernetes manifest validation

2. **Secure Build**
   - Multi-stage Docker builds
   - Vulnerability scanning with Trivy
   - Security label verification
   - Registry push with provenance

3. **Deployment**
   - External Secrets validation
   - Secure deployment with health checks
   - Post-deployment security validation

### Environment Configuration

#### Development Environment

```yaml
environment: development
features:
  - External Secrets validation
  - Automated deployment on main branch
  - Security scanning reports
```

#### Production Environment

```yaml
environment: production
features:
  - Manual approval required
  - Enhanced security validation
  - Extended deployment timeout
  - Rollback capability
```

## 🛡️ Security Best Practices

### Container Security

1. **Base Images**
   - Use official Alpine Linux images
   - Keep base images updated
   - Minimize image layers

2. **User Security**
   - Always run as non-root user
   - Use numeric user IDs
   - Set proper file permissions

3. **Secret Management**
   - Never embed secrets in images
   - Use External Secrets for all sensitive data
   - Implement secret rotation

### Kubernetes Security

1. **Security Contexts**
   - Enable `runAsNonRoot: true`
   - Set `allowPrivilegeEscalation: false`
   - Use `seccompProfile: RuntimeDefault`

2. **Resource Management**
   - Set resource requests and limits
   - Use ephemeral storage limits
   - Monitor resource usage

3. **Network Security**
   - Implement network policies
   - Use service mesh for mTLS
   - Restrict ingress/egress traffic

### Operational Security

1. **Monitoring**
   - Monitor External Secrets synchronization
   - Track security scan results
   - Alert on deployment failures

2. **Maintenance**
   - Regular vulnerability scanning
   - Keep External Secrets Operator updated
   - Rotate secrets periodically

3. **Compliance**
   - Document security procedures
   - Regular security audits
   - Maintain security baselines

## 🆘 Troubleshooting

### Common Issues

#### External Secrets Not Syncing

```bash
# Check External Secrets operator logs
kubectl logs -n external-secrets-system deployment/external-secrets

# Check ClusterSecretStore status
kubectl describe clustersecretstore azure-keyvault

# Verify Azure Key Vault connectivity
kubectl get events -n platform-system --field-selector reason=SecretSyncError
```

#### Container Security Issues

```bash
# Check pod security context
kubectl describe pod <pod-name> -n platform-system

# Verify container is running as non-root
kubectl exec -it <pod-name> -n platform-system -- id

# Check for security policy violations
kubectl get events -n platform-system --field-selector reason=SecurityContextDenied
```

#### Build Failures

```bash
# Check for hardcoded secrets
./scripts/validate-secure-platform.sh --verbose

# Run manual secret scan
detect-secrets scan platform-api/ platform-ui/

# Test Dockerfile build
docker build --target production -t test platform-api/
```

### Emergency Procedures

#### Security Breach Response

1. Immediately rotate all secrets in Azure Key Vault
2. Restart all platform pods to refresh secrets
3. Review and update security policies
4. Audit access logs and deployment history

#### Failed Deployment Recovery

1. Check External Secrets synchronization status
2. Verify Azure Key Vault connectivity
3. Rollback to previous working version if needed
4. Review deployment logs and events

## 📚 Additional Resources

### Documentation

- [External Secrets Documentation](https://external-secrets.io/)
- [Azure Key Vault Documentation](https://docs.microsoft.com/en-us/azure/key-vault/)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)

### Security Tools

- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [detect-secrets Documentation](https://github.com/Yelp/detect-secrets)
- [hadolint Documentation](https://github.com/hadolint/hadolint)

### Monitoring and Observability

- Monitor External Secrets metrics
- Set up alerts for secret sync failures
- Track deployment success rates
- Monitor container security events

---

## 🎯 Quick Start

For immediate deployment with security validation:

```bash
# 1. Validate current setup
./scripts/validate-secure-platform.sh --verbose

# 2. Build secure images
./scripts/build-platform-secure.sh --version v1.0.0 --push

# 3. Deploy securely
./scripts/deploy-platform-secure.sh --version v1.0.0 --environment development

# 4. Verify deployment
kubectl get pods -n platform-system
kubectl get externalsecrets -n platform-system
```

This comprehensive security setup ensures that your platform deployment is secure, compliant, and production-ready with External Secrets integration.
