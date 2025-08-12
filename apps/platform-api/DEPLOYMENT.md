# Platform API Production Deployment Guide

This directory contains production-ready Kubernetes manifests for the Platform API v1.1.0 deployment on AKS with GitOps integration.

## Prerequisites

1. **AKS Cluster** with the following components installed:
   - Azure Service Operator (ASO)
   - External Secrets Operator
   - Istio Service Mesh
   - Prometheus/Grafana monitoring stack
   - Argo Workflows

2. **Azure Resources**:
   - Azure Key Vault (`platform-aks-kv`)
   - Azure Managed Identity with appropriate permissions
   - Azure Database for PostgreSQL
   - Azure Cache for Redis

3. **Kubernetes Permissions**:
   - Cluster admin access for RBAC setup
   - External Secrets Operator configured with Azure Key Vault

## Pre-Deployment Setup

### 1. Azure Key Vault Secrets

Ensure the following secrets are stored in your Azure Key Vault:

```bash
# Platform API secrets
az keyvault secret set --vault-name platform-aks-kv --name platform-api-jwt-secret --value "your-jwt-secret"
az keyvault secret set --vault-name platform-aks-kv --name platform-api-db-password --value "your-db-password"
az keyvault secret set --vault-name platform-aks-kv --name platform-api-redis-password --value "your-redis-password"
az keyvault secret set --vault-name platform-aks-kv --name platform-api-azure-client-secret --value "your-client-secret"
az keyvault secret set --vault-name platform-aks-kv --name platform-api-argo-token --value "your-argo-token"
```

### 2. Update Configuration

Edit the following files with your environment-specific values:

#### configmap.yaml

- Update Azure subscription ID and tenant ID
- Update database and Redis connection strings
- Update CORS origins for your domain

#### secret.yaml

- Update Key Vault URL to match your Azure Key Vault

#### kustomization.yaml

- Update Azure client ID and tenant ID

## Deployment Options

### Option 1: GitOps with Flux (Recommended)

```bash
# Create GitSource and Kustomization for Flux
kubectl apply -f - <<EOF
apiVersion: source.toolkit.fluxcd.io/v1beta2
kind: GitRepository
metadata:
  name: platform-api-source
  namespace: flux-system
spec:
  interval: 1m
  ref:
    branch: main
  url: https://github.com/davidmarkgardiner/claude-aso
---
apiVersion: kustomize.toolkit.fluxcd.io/v1beta2
kind: Kustomization
metadata:
  name: platform-api
  namespace: flux-system
spec:
  interval: 5m
  path: ./apps/platform-api
  prune: true
  sourceRef:
    kind: GitRepository
    name: platform-api-source
  validation: client
  healthChecks:
  - apiVersion: apps/v1
    kind: Deployment
    name: platform-api
    namespace: platform-system
EOF
```

### Option 2: Direct Kubectl Apply

```bash
# Apply all manifests
kubectl apply -k apps/platform-api/

# Or apply individually
kubectl apply -f apps/platform-api/namespace.yaml
kubectl apply -f apps/platform-api/serviceaccount.yaml
kubectl apply -f apps/platform-api/rbac.yaml
kubectl apply -f apps/platform-api/configmap.yaml
kubectl apply -f apps/platform-api/secret.yaml
kubectl apply -f apps/platform-api/deployment.yaml
kubectl apply -f apps/platform-api/service.yaml
kubectl apply -f apps/platform-api/hpa.yaml
kubectl apply -f apps/platform-api/pdb.yaml
kubectl apply -f apps/platform-api/networkpolicy.yaml
kubectl apply -f apps/platform-api/istio.yaml
kubectl apply -f apps/platform-api/monitoring.yaml
```

## Verification

### 1. Check Deployment Status

```bash
# Check all platform-system resources
kubectl get all -n platform-system

# Check platform-api specific resources
kubectl get deployment,service,hpa,pdb -n platform-system -l app=platform-api

# Check external secrets
kubectl get externalsecret,secretstore -n platform-system

# Check Istio configurations
kubectl get virtualservice,destinationrule,peerauthentication,authorizationpolicy -n platform-system
```

### 2. Check Pod Health

```bash
# Check pod status
kubectl get pods -n platform-system -l app=platform-api

# Check pod logs
kubectl logs -n platform-system -l app=platform-api -f

# Check readiness and liveness probes
kubectl describe pods -n platform-system -l app=platform-api
```

### 3. Test API Endpoints

```bash
# Port forward to test locally
kubectl port-forward -n platform-system svc/platform-api 8080:80

# Test health endpoint
curl http://localhost:8080/health

# Test readiness endpoint
curl http://localhost:8080/health/ready

# Test metrics endpoint
curl http://localhost:8080/metrics
```

### 4. Verify Istio Integration

```bash
# Check Istio sidecar injection
kubectl get pods -n platform-system -o jsonpath='{.items[*].spec.containers[*].name}' | grep istio-proxy

# Check Istio configuration
istioctl proxy-config cluster platform-api-xxx-xxx -n platform-system
```

## Monitoring and Observability

### Prometheus Metrics

The Platform API exposes metrics at `/metrics` endpoint. Key metrics include:

- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - HTTP request duration
- `platform_namespaces_total` - Total managed namespaces
- `platform_provisioning_requests_total` - Total provisioning requests

### Grafana Dashboards

A Grafana dashboard configuration is included in `monitoring.yaml`. Import it to visualize:

- HTTP request rates and error rates
- Response time percentiles
- Resource utilization
- Platform-specific metrics

### Alerts

Prometheus alerting rules are configured for:

- Service availability
- High error rates
- High latency
- Resource usage

## Troubleshooting

### Common Issues

1. **External Secrets not syncing**:

   ```bash
   kubectl describe externalsecret platform-api-secrets -n platform-system
   kubectl logs -n external-secrets-system -l app.kubernetes.io/name=external-secrets
   ```

2. **Azure Workload Identity issues**:

   ```bash
   kubectl describe serviceaccount platform-api -n platform-system
   kubectl logs -n platform-system -l app=platform-api | grep -i azure
   ```

3. **Istio sidecar not injected**:

   ```bash
   kubectl get namespace platform-system -o yaml | grep istio-injection
   kubectl get pods -n platform-system -o yaml | grep istio
   ```

4. **RBAC permission issues**:
   ```bash
   kubectl auth can-i --list --as=system:serviceaccount:platform-system:platform-api
   ```

### Debugging Commands

```bash
# Check all platform-api related resources
kubectl get all,configmap,secret,externalsecret,networkpolicy -n platform-system -l app=platform-api

# Describe deployment for detailed information
kubectl describe deployment platform-api -n platform-system

# Check events for issues
kubectl get events -n platform-system --sort-by='.lastTimestamp'

# Test network connectivity
kubectl exec -n platform-system -it deployment/platform-api -- wget -qO- http://kubernetes.default.svc.cluster.local:443 --no-check-certificate
```

## Scaling and Performance

### Horizontal Pod Autoscaler

The HPA is configured to scale between 3-10 replicas based on:

- CPU utilization (target: 70%)
- Memory utilization (target: 80%)

### Resource Limits

Production resource configuration:

- **Requests**: 512Mi memory, 200m CPU
- **Limits**: 1Gi memory, 1000m CPU

### Pod Disruption Budget

PDB ensures minimum 2 pods are always available during:

- Node maintenance
- Kubernetes upgrades
- Voluntary disruptions

## Security Considerations

### Network Policies

- Ingress traffic restricted to authorized sources
- Egress traffic limited to necessary services
- Strict mode available for enhanced security

### Pod Security

- Non-root container execution
- Read-only root filesystem
- Dropped capabilities
- Security context constraints

### Istio Security

- mTLS enforcement between services
- Authorization policies for API access
- Traffic encryption and authentication

## Maintenance

### Updates and Rollbacks

```bash
# Update to new version
kubectl set image deployment/platform-api platform-api=davidgardiner/platform-api:v1.2.0 -n platform-system

# Check rollout status
kubectl rollout status deployment/platform-api -n platform-system

# Rollback if needed
kubectl rollout undo deployment/platform-api -n platform-system
```

### Backup and Recovery

- External secrets are managed by Azure Key Vault
- Configuration is stored in Git (GitOps)
- Database backups handled by Azure Database for PostgreSQL

## Support

For issues and questions:

1. Check pod logs: `kubectl logs -n platform-system -l app=platform-api`
2. Review monitoring dashboards and alerts
3. Verify external dependencies (database, Redis, Azure services)
4. Check GitHub issues: https://github.com/davidmarkgardiner/claude-aso/issues
