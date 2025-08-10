# Cert-Manager on AKS with Azure Workload Identity

This directory contains the complete cert-manager configuration for AKS cluster `uk8s-tsshared-weu-gt025-int-prod` with Azure Workload Identity integration.

## Overview

Cert-manager v1.18.2 is deployed with:
- ✅ Azure Workload Identity integration
- ✅ DNS-01 challenge support via Azure DNS
- ✅ Let's Encrypt staging and production issuers
- ✅ Comprehensive validation and monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   AKS Cluster                               │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │  cert-manager   │    │     Azure Workload Identity │   │
│  │   namespace     │    │                              │   │
│  │                 │    │  Client ID:                  │   │
│  │ • cert-manager  │◄───┤  1317ba0a-60d3-4f05-b41e-   │   │
│  │ • webhook       │    │  483ed1d6acb3                │   │
│  │ • cainjector    │    │                              │   │
│  └─────────────────┘    └──────────────────────────────┘   │
│           │                                                 │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼ DNS-01 Challenge
┌─────────────────────────────────────────────────────────────┐
│                Azure DNS Zone                               │
│           davidmarkgardiner.co.uk                          │
│                                                             │
│  • DNS Zone Contributor permissions                        │
│  • Automatic TXT record creation/deletion                  │
│  • Let's Encrypt challenge validation                      │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Files

### Core Components

1. **namespace.yaml** - Cert-manager namespace with workload identity labels
2. **helm-repository.yaml** - Jetstack Helm repository for Flux
3. **helm-release.yaml** - Helm release configuration with Azure integration
4. **values.yaml** - Direct Helm values file (for manual deployment)

### Certificate Issuers

5. **clusterissuer-staging.yaml** - Let's Encrypt staging issuer (rate limits friendly)
6. **clusterissuer-production.yaml** - Let's Encrypt production issuer

### Testing & Validation

7. **test-certificate.yaml** - Example test certificate
8. **validate-cert-manager.py** - Comprehensive validation script

## Azure Resources Created

- **Managed Identity**: `cert-manager-identity`
  - Client ID: `1317ba0a-60d3-4f05-b41e-483ed1d6acb3`
  - Resource Group: `at39473-weu-dev-prod`
  - Location: `uksouth`

- **Role Assignment**: DNS Zone Contributor
  - Scope: `/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/dns/providers/Microsoft.Network/dnszones/davidmarkgardiner.co.uk`

- **Federated Identity Credential**: `cert-manager-federated-credential`
  - Issuer: AKS OIDC endpoint
  - Subject: `system:serviceaccount:cert-manager:cert-manager`

## Available ClusterIssuers

| Name | Type | Server | Use Case |
|------|------|--------|----------|
| `letsencrypt-staging-dns01` | DNS-01 | Staging | Testing, development |
| `letsencrypt-prod-dns01` | DNS-01 | Production | Production certificates |
| `letsencrypt-staging-http01` | HTTP-01 | Staging | Testing with HTTP validation |
| `letsencrypt-prod-http01` | HTTP-01 | Production | Production with HTTP validation |

## Usage Examples

### Basic Certificate

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: my-app-cert
  namespace: my-app
spec:
  secretName: my-app-tls
  dnsNames:
  - my-app.davidmarkgardiner.co.uk
  issuerRef:
    name: letsencrypt-prod-dns01
    kind: ClusterIssuer
```

### Wildcard Certificate

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-cert
  namespace: my-app
spec:
  secretName: wildcard-tls
  dnsNames:
  - "*.davidmarkgardiner.co.uk"
  issuerRef:
    name: letsencrypt-prod-dns01
    kind: ClusterIssuer
```

### Ingress with Automatic Certificate

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod-dns01"
spec:
  tls:
  - hosts:
    - my-app.davidmarkgardiner.co.uk
    secretName: my-app-tls
  rules:
  - host: my-app.davidmarkgardiner.co.uk
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app-service
            port:
              number: 80
```

## Validation

Run the validation script to check cert-manager health:

```bash
python3 validate-cert-manager.py
```

### Manual Validation Commands

```bash
# Check pod status
kubectl get pods -n cert-manager

# Check ClusterIssuers
kubectl get clusterissuer

# Check certificates
kubectl get certificates -A

# Check challenges (during issuance)
kubectl get challenges -A

# Check DNS records in Azure
az network dns record-set txt list \
  --zone-name davidmarkgardiner.co.uk \
  --resource-group dns \
  --query '[?contains(name, `acme-challenge`)]'
```

## Troubleshooting

### Common Issues

1. **Certificate stuck in "Issuing" state**
   - Check challenges: `kubectl get challenges -A`
   - Verify DNS propagation: `nslookup _acme-challenge.your-domain.davidmarkgardiner.co.uk`
   - Check cert-manager logs: `kubectl logs -n cert-manager deployment/cert-manager`

2. **DNS-01 challenge failing**
   - Verify workload identity: Check service account annotations
   - Check Azure permissions: Ensure DNS Zone Contributor role
   - Verify DNS zone exists and is accessible

3. **Webhook issues**
   - Check webhook pod: `kubectl get pods -n cert-manager`
   - Verify webhook service: `kubectl get svc -n cert-manager`
   - Check for network policies blocking webhook traffic

### Monitoring

```bash
# Watch certificate status
watch kubectl get certificates -A

# Monitor challenges
kubectl get challenges -A -w

# Check cert-manager events
kubectl get events -n cert-manager --sort-by='.lastTimestamp'

# View detailed certificate status
kubectl describe certificate <cert-name>
```

## Security Considerations

- Uses Azure Workload Identity (no secrets stored in cluster)
- DNS-01 challenge isolates certificate issuance from ingress traffic
- Managed identity has minimal required permissions (DNS Zone Contributor)
- All components run with security contexts and resource limits

## Maintenance

### Updating cert-manager

1. Update the chart version in `helm-release.yaml`
2. Check for breaking changes in release notes
3. Test in staging environment first
4. Monitor certificate renewals after upgrade

### Certificate Renewal

- Certificates auto-renew at 2/3 of their lifetime (60 days for Let's Encrypt)
- Monitor certificate expiration dates
- Set up alerts for renewal failures

## Configuration Details

- **DNS Zone**: `davidmarkgardiner.co.uk`
- **Resource Group**: `dns`
- **Subscription**: `133d5755-4074-4d6e-ad38-eb2a6ad12903`
- **Managed Identity**: `cert-manager-identity`
- **Client ID**: `1317ba0a-60d3-4f05-b41e-483ed1d6acb3`

## Success Metrics

As of deployment:
- ✅ All CRDs installed and validated
- ✅ All pods running (cert-manager, webhook, cainjector)
- ✅ Workload identity correctly configured
- ✅ 4 ClusterIssuers ready (staging/prod × DNS-01/HTTP-01)
- ✅ Azure DNS permissions validated
- ✅ DNS challenge records successfully created

The cert-manager installation is production-ready and capable of issuing certificates automatically for any workload in the cluster.