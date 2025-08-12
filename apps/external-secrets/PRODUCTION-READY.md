# External Secrets Operator - Production Deployment

This directory contains production-ready manifests for deploying External Secrets Operator with Azure Key Vault integration on AKS.

## Overview

External Secrets Operator synchronizes secrets from Azure Key Vault to Kubernetes secrets, providing secure and automated secret management for the platform infrastructure.

### Key Features

- **Azure Workload Identity Integration**: Secure authentication using Azure AD Workload Identity
- **High Availability**: 3 replicas with anti-affinity rules
- **Production Security**: Pod Security Policies, Network Policies, Resource Quotas
- **Monitoring & Alerting**: Prometheus metrics, Grafana dashboards, custom alerts
- **Disaster Recovery**: Automated backups with Velero
- **Policy Enforcement**: Open Policy Agent Gatekeeper constraints

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AKS Cluster                              │
│                                                                 │
│ ┌─────────────────────┐  ┌───────────────────────────────────┐ │
│ │ External Secrets    │  │        Target Namespaces          │ │
│ │ Operator            │  │                                   │ │
│ │                     │  │ ┌─────────────┐ ┌───────────────┐ │ │
│ │ ┌─────────────────┐ │  │ │platform-    │ │cert-manager  │ │ │
│ │ │   Controller    │◄┼──┼─┤system       │ │               │ │ │
│ │ │   (3 replicas)  │ │  │ │             │ │               │ │ │
│ │ └─────────────────┘ │  │ └─────────────┘ └───────────────┘ │ │
│ │                     │  │                                   │ │
│ │ ┌─────────────────┐ │  │ ┌─────────────┐ ┌───────────────┐ │ │
│ │ │    Webhook      │ │  │ │external-dns │ │istio-system   │ │ │
│ │ │   (2 replicas)  │ │  │ │             │ │               │ │ │
│ │ └─────────────────┘ │  │ └─────────────┘ └───────────────┘ │ │
│ └─────────────────────┘  └───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Azure Workload Identity
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Azure Key Vault                            │
│                    aks-prod-keyvault                            │
│                                                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Platform API    │ │  Certificates   │ │   DNS & Infra   │   │
│  │    Secrets      │ │     & TLS       │ │    Credentials  │   │
│  │                 │ │                 │ │                 │   │
│  │ • JWT secrets   │ │ • ACME keys     │ │ • DNS creds     │   │
│  │ • DB passwords  │ │ • TLS certs     │ │ • Monitoring    │   │
│  │ • Azure creds   │ │ • CA bundles    │ │ • Istio TLS     │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Production Updates Summary

### 🔧 Core Infrastructure Changes

1. **Namespace Enhancement** (`namespace.yaml`)
   - Added Workload Identity labels
   - Production-grade annotations with documentation links

2. **High Availability Configuration** (`helm-release.yaml`)
   - Increased controller replicas to 3 for HA
   - Added pod anti-affinity rules
   - Enhanced resource limits for production workloads
   - Comprehensive health checks and monitoring

3. **Production Key Vault Integration** (`cluster-secret-store.yaml`)
   - Updated to use production Key Vault: `aks-prod-keyvault`
   - Added backup ClusterSecretStore for failover
   - Production-grade retry and refresh configurations

4. **Enhanced RBAC** (`rbac.yaml`)
   - Granular permissions for each namespace
   - Added monitoring and Istio namespace support
   - Event creation permissions for audit trails

### 🛡️ Security Enhancements (`security.yaml`)

- **Pod Security Policies**: Non-root execution, read-only filesystem
- **Network Policies**: Restricted ingress/egress traffic
- **Resource Quotas**: Prevent resource exhaustion
- **Gatekeeper Constraints**: Policy enforcement for ExternalSecrets
- **Falco Rules**: Runtime security monitoring

### 📊 Monitoring & Observability (`monitoring.yaml`)

- **ServiceMonitors**: Prometheus metrics collection
- **PrometheusRules**: 6 critical alerts for operational health
- **Grafana Dashboard**: Comprehensive visualization
- **Network Policies**: Secure metrics access

### 🔄 Disaster Recovery (`disaster-recovery.yaml`)

- **Velero Backup Schedule**: Daily backups at 2 AM UTC
- **Health Check CronJob**: Continuous health monitoring
- **Recovery Runbook**: Detailed procedures for various scenarios
- **Multi-namespace Backup**: Covers all secret-dependent services

### 💾 Secret Management Updates

1. **Platform API Secrets** (`examples/platform-secrets.yaml`)
   - Complete environment variable mapping
   - Database connection strings
   - Redis configuration
   - Monitoring integration secrets

2. **Infrastructure Secrets**
   - Cert-manager ACME account keys
   - External DNS Azure credentials
   - Istio Gateway TLS certificates
   - Monitoring stack credentials

3. **Development Environment** (`examples/dev-secrets.yaml`)
   - Safe development defaults
   - Clear warnings about production usage
   - Kubernetes-based secret store for testing

## Quick Deployment

```bash
# Deploy production External Secrets
kubectl apply -k apps/external-secrets/

# Wait for readiness
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/name=external-secrets \
  -n external-secrets-system --timeout=300s

# Verify Key Vault connection
kubectl get clustersecretstore azure-keyvault -o yaml

# Check secret synchronization
kubectl get externalsecrets -A
```

## Key Production Features

### 1. Azure Workload Identity Integration

- Secure pod authentication to Azure Key Vault
- No stored credentials in cluster
- Automatic token refresh

### 2. High Availability

- 3 controller replicas with anti-affinity
- 2 webhook replicas for redundancy
- Automated failover and recovery

### 3. Security Hardening

- Non-root container execution
- Network traffic restrictions
- Resource quotas and limits
- Runtime security monitoring

### 4. Comprehensive Monitoring

- Prometheus metrics and alerting
- Grafana dashboards
- Health check automation
- Performance tracking

### 5. Disaster Recovery

- Automated daily backups
- Cross-region replication
- Detailed recovery procedures
- Business continuity planning

## Secret Mappings

The External Secrets configuration supports the Platform API v1.1.0 requirements:

| Azure Key Vault Secret         | Kubernetes Secret        | Target Namespace  |
| ------------------------------ | ------------------------ | ----------------- |
| `platform-jwt-secret`          | `JWT_SECRET`             | `platform-system` |
| `platform-db-password`         | `DB_PASSWORD`            | `platform-system` |
| `platform-azure-client-secret` | `AZURE_CLIENT_SECRET`    | `platform-system` |
| `platform-redis-password`      | `REDIS_PASSWORD`         | `platform-system` |
| `acme-account-private-key`     | `tls.key`                | `cert-manager`    |
| `external-dns-client-secret`   | `azure.json`             | `external-dns`    |
| `istio-gateway-tls-cert`       | `tls.crt`                | `istio-system`    |
| `grafana-admin-password`       | `grafana-admin-password` | `monitoring`      |

## Monitoring & Alerts

### Critical Alerts Configured

1. **ExternalSecretSyncFailure**: Triggers after 5 minutes of sync failures
2. **SecretStoreConnectionFailure**: Key Vault connectivity issues
3. **HighReconciliationErrors**: Elevated error rates
4. **ExternalSecretRefreshLag**: Stale secrets (>2 hours)
5. **ControllerRestarts**: Frequent pod restarts
6. **AzureKeyVaultRateLimit**: API throttling detection

### Metrics Available

- `externalsecret_sync_calls_total` - Sync operation counters
- `externalsecret_status_condition` - Secret health status
- `controller_runtime_reconcile_time_seconds` - Performance metrics

## Production Checklist

- ✅ Azure Key Vault (`aks-prod-keyvault`) configured with RBAC
- ✅ High availability (3+ controller replicas)
- ✅ Security policies and network restrictions
- ✅ Monitoring and alerting configured
- ✅ Disaster recovery procedures documented
- ✅ Secret rotation procedures established
- ✅ Development/staging environment separated
- ✅ Policy enforcement with Gatekeeper
- ✅ Resource quotas and limits applied
- ✅ Backup and restore tested

## Support & Documentation

- **External Secrets Docs**: https://external-secrets.io/
- **Azure Workload Identity**: https://azure.github.io/azure-workload-identity/
- **Platform Team**: Create GitHub issue for support
- **Emergency Procedures**: See disaster-recovery.yaml runbook

This production-ready configuration provides enterprise-grade secret management for the AKS platform with comprehensive security, monitoring, and operational capabilities.
