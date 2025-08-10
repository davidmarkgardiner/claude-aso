# External DNS for AKS with Azure Workload Identity

This directory contains the GitOps-ready External DNS configuration for automatic DNS record management in Azure DNS zones.

## Overview

External DNS automatically creates and manages DNS records for Kubernetes services and ingresses in Azure DNS. This setup uses Azure Workload Identity for secure, passwordless authentication.

## Architecture

- **Cluster**: uk8s-tsshared-weu-gt025-int-prod
- **DNS Zone**: davidmarkgardiner.co.uk (Public)
- **Authentication**: Azure Workload Identity (Client ID: 721782e9-90d6-4563-8e92-a0889337243e)
- **Policy**: sync (full DNS record lifecycle management)
- **Registry**: txt (ownership tracking via TXT records)

## Components

### Core Resources
- `namespace.yaml` - External DNS namespace with Workload Identity labels
- `azure-config.yaml` - Azure configuration for Workload Identity
- `serviceaccount.yaml` - Service Account with Azure annotations
- `clusterrole.yaml` - RBAC permissions for External DNS
- `clusterrolebinding.yaml` - Role binding
- `deployment.yaml` - External DNS controller deployment
- `service.yaml` - Service for metrics exposure
- `kustomization.yaml` - Kustomize configuration

### Azure Resources (Pre-configured)
- **User Assigned Identity**: `external-dns-identity` in resource group `dns`
- **Role Assignment**: DNS Zone Contributor on `davidmarkgardiner.co.uk`
- **Federated Credential**: For service account `system:serviceaccount:external-dns:external-dns`

## Configuration

### Sources
- **Services**: LoadBalancer and NodePort services with External DNS annotations
- **Ingresses**: Ingresses with hostnames matching domain filter

### Domain Filter
- `davidmarkgardiner.co.uk` - Only manages records in this DNS zone

### TXT Registry
- **Owner ID**: `uk8s-tsshared-weu-gt025-int-prod`
- **Prefix**: `externaldns-`
- TXT records track ownership and prevent conflicts

### Sync Settings
- **Interval**: 30 seconds
- **Policy**: sync (creates, updates, and deletes records)
- **TTL**: Configurable via service annotations (default: 300)

## Usage

### Service Example
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  annotations:
    external-dns.alpha.kubernetes.io/hostname: my-app.davidmarkgardiner.co.uk
    external-dns.alpha.kubernetes.io/ttl: "300"
spec:
  type: LoadBalancer
  ports:
  - port: 80
  selector:
    app: my-app
```

### Ingress Example
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
spec:
  rules:
  - host: my-app.davidmarkgardiner.co.uk
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app
            port:
              number: 80
```

## Monitoring

### Metrics
- External DNS exposes Prometheus metrics on port 7979 at `/metrics`
- Health check available at `/healthz`

### Logs
```bash
kubectl logs -n external-dns deployment/external-dns -f
```

### DNS Record Verification
```bash
# Check A records
az network dns record-set a list \
  --resource-group dns \
  --zone-name davidmarkgardiner.co.uk \
  -o table

# Check TXT ownership records
az network dns record-set txt list \
  --resource-group dns \
  --zone-name davidmarkgardiner.co.uk \
  --query "[?contains(name, 'externaldns')]" \
  -o table
```

## Deployment

### Via kubectl
```bash
kubectl apply -k apps/external-dns/
```

### Via Kustomize
```bash
kustomize build apps/external-dns/ | kubectl apply -f -
```

### Validation
```bash
# Check pod status
kubectl get pods -n external-dns

# Verify workload identity
kubectl describe pod -n external-dns -l app.kubernetes.io/name=external-dns

# Test DNS record creation with sample service
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: dns-test
  annotations:
    external-dns.alpha.kubernetes.io/hostname: dns-test.davidmarkgardiner.co.uk
spec:
  type: LoadBalancer
  ports:
  - port: 80
  selector:
    app: dns-test
EOF
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify Workload Identity is enabled on the cluster
   - Check federated credential subject matches: `system:serviceaccount:external-dns:external-dns`
   - Ensure client ID annotation is correct on service account

2. **Permission Denied**
   - Verify DNS Zone Contributor role assignment on the identity
   - Check Azure subscription ID and resource group are correct

3. **Records Not Created**
   - Verify domain filter matches your DNS zone
   - Check service has external IP (LoadBalancer) or ingress has valid hostname
   - Ensure hostname annotation matches domain filter

4. **TXT Record Conflicts**
   - Verify txt-owner-id is unique per cluster
   - Check for conflicting External DNS deployments

### Debug Commands
```bash
# View External DNS configuration
kubectl get deployment external-dns -n external-dns -o yaml

# Check events
kubectl get events -n external-dns --sort-by='.lastTimestamp'

# Test Azure authentication from pod
kubectl exec -it -n external-dns deployment/external-dns -- /bin/sh
# Inside pod: curl -H "Metadata: true" "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/"
```

## Security

- Uses Azure Workload Identity for passwordless authentication
- Follows principle of least privilege with specific DNS zone access
- TXT records ensure ownership tracking and prevent conflicts
- Runs as non-root user with restricted security context

## Performance

- **Sync Interval**: 30 seconds (configurable)
- **Resource Limits**: CPU 100m, Memory 300Mi
- **Resource Requests**: CPU 50m, Memory 50Mi
- **Health Checks**: Liveness and readiness probes configured

## Version Information

- **External DNS Version**: v0.18.0
- **Kubernetes Compatibility**: 1.30+
- **Azure Provider**: Native Azure DNS integration
- **Installation Date**: 2025-08-09
- **Cluster**: uk8s-tsshared-weu-gt025-int-prod