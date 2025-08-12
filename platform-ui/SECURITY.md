# Platform UI Security Guide

This document outlines the security measures implemented in the Platform UI and provides guidance for secure deployment and operation.

## Security Features

### 1. Configuration Security

- **No Hardcoded Secrets**: All sensitive configuration is externalized
- **Runtime Configuration**: Configuration is injected at runtime via Kubernetes secrets
- **Environment Validation**: Configuration is validated before application startup
- **Secure Defaults**: Safe fallback values for development environments

### 2. Authentication & Authorization

- **Azure AD Integration**: OAuth 2.0 with Microsoft Azure AD
- **Token Management**: Secure token storage with automatic cleanup
- **Session Security**: SessionStorage preferred over localStorage in production
- **CSRF Protection**: X-Requested-With headers and correlation IDs

### 3. API Security

- **Request Validation**: All API calls include security headers
- **Error Handling**: Secure error responses without sensitive information
- **Correlation Tracking**: Request correlation IDs for audit trails
- **Timeout Configuration**: Prevent resource exhaustion attacks

### 4. Build Security

- **Dependency Scanning**: Automated vulnerability scanning
- **Secret Detection**: Build-time secret scanning
- **Source Map Control**: Optional source map generation for production
- **Secure Base Images**: Non-root user and minimal attack surface

### 5. Runtime Security

- **Read-Only Filesystem**: Immutable container filesystem
- **Non-Root User**: Container runs as user ID 1001
- **Security Context**: Kubernetes security context with restricted privileges
- **Network Policies**: Ingress/egress traffic restrictions

## Deployment Security

### External Secrets Configuration

The Platform UI uses External Secrets Operator to sync configuration from Azure Key Vault:

```yaml
# Required secrets in Azure Key Vault:
platform-ui-api-url                    # Backend API URL
platform-azure-client-id               # Azure AD client ID
platform-ui-oauth-authority            # OAuth authority URL
platform-ui-oauth-redirect-uri         # OAuth redirect URI
platform-ui-auth-enabled               # Enable/disable authentication
platform-ui-environment                # Environment (production/staging/dev)
platform-ui-feature-*                  # Feature flags
```

### Kubernetes Security

Deploy with security-first configuration:

```bash
# Apply External Secrets first
kubectl apply -f deployment/external-secrets.yaml

# Wait for secrets to sync
kubectl wait --for=condition=Ready externalsecret/platform-ui-config -n platform-system

# Deploy the application
kubectl apply -f deployment/kubernetes.yaml
```

### Network Security

- **TLS Termination**: HTTPS enforced at ingress layer
- **Network Policies**: Restrict pod-to-pod communication
- **Service Mesh**: Istio for mTLS and traffic management
- **Firewall Rules**: Azure NSG rules for defense in depth

## Development Security

### Environment Setup

1. **Never commit secrets**: Use `.env.sample` for templates
2. **Local configuration**: Create `.env.local` with development values
3. **Validate dependencies**: Run `npm audit` before adding packages
4. **Code scanning**: Use security linting and SAST tools

### Security Scripts

```bash
# Run comprehensive security audit
npm run security:audit

# Scan for vulnerabilities
npm run security:scan

# Build with security validation
npm run build:secure

# Build Docker image with security checks
npm run build:docker
```

### Code Security Guidelines

1. **Input Validation**: Validate all user inputs
2. **XSS Prevention**: Use React's built-in XSS protection
3. **CSRF Protection**: Include anti-CSRF tokens
4. **Error Handling**: Don't expose sensitive information in errors
5. **Logging**: Log security events but not sensitive data

## Production Security Checklist

### Pre-Deployment

- [ ] Run security audit: `npm run security:audit`
- [ ] Scan dependencies: `npm run security:scan`
- [ ] Validate External Secrets configuration
- [ ] Review nginx security headers
- [ ] Verify CSP policy configuration
- [ ] Check for hardcoded secrets
- [ ] Validate OAuth configuration

### Deployment

- [ ] Deploy to secure namespace with RBAC
- [ ] Enable network policies
- [ ] Configure pod security standards
- [ ] Set up monitoring and alerting
- [ ] Verify TLS certificate configuration
- [ ] Test authentication flow
- [ ] Validate API connectivity

### Post-Deployment

- [ ] Monitor security logs
- [ ] Set up vulnerability scanning
- [ ] Configure backup and recovery
- [ ] Test security incident response
- [ ] Review access logs
- [ ] Validate all security headers
- [ ] Test OAuth flows

## Security Headers

The nginx configuration includes essential security headers:

```nginx
# Security headers in nginx.conf
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self'..." always;
```

## OAuth Security

### Azure AD Configuration

1. **App Registration**: Secure app registration in Azure AD
2. **Redirect URIs**: Whitelist only necessary redirect URIs
3. **Token Validation**: Validate tokens on both client and server
4. **Scope Limitation**: Request minimal required scopes

### Token Management

- Tokens stored in sessionStorage (production) or localStorage (development)
- Automatic token cleanup on authentication errors
- Token expiration handling with automatic logout
- Correlation ID tracking for audit trails

## Monitoring and Alerting

### Security Metrics

- Authentication failures
- Authorization errors
- Unusual traffic patterns
- Configuration changes
- Dependency vulnerabilities

### Log Aggregation

- Centralized logging with correlation IDs
- Security event correlation
- Automated threat detection
- Compliance reporting

## Incident Response

### Security Incident Workflow

1. **Detection**: Automated monitoring alerts
2. **Assessment**: Evaluate severity and impact
3. **Containment**: Isolate affected components
4. **Remediation**: Apply fixes and patches
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Update security measures

### Emergency Procedures

- Immediate OAuth client ID rotation
- Emergency deployment rollback
- Network isolation procedures
- Incident communication plan

## Compliance

### Standards Compliance

- OWASP Top 10 mitigation
- CIS Kubernetes Benchmark
- Azure Security Benchmark
- SOC 2 Type II controls

### Audit Requirements

- Access logging and monitoring
- Configuration change tracking
- Vulnerability management
- Incident response documentation

## Security Contact

For security issues or questions:

- **Internal**: Platform Engineering Team
- **External**: security@company.com
- **Emergency**: Follow incident response procedures

## Updates

This security guide is updated with each release. Check the changelog for security-related changes and ensure your deployment follows the latest security guidelines.
