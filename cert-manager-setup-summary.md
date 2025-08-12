# Cert-Manager Setup Summary for AKS Cluster

## Overview

Cert-manager has been successfully configured for the AKS cluster `uk8s-tsshared-weu-gt025-int-prod` in UK South region with Azure Workload Identity integration and Let's Encrypt automation.

## Configuration Details

### Cluster Information

- **Cluster Name**: uk8s-tsshared-weu-gt025-int-prod
- **Region**: UK South (uksouth)
- **Resource Group**: AT39473-WEU-DEV-PROD
- **Networking**: Azure CNI + Cilium
- **RBAC**: Azure RBAC enabled
- **Service Mesh**: Istio enabled

### Cert-Manager Installation

- **Version**: v1.15.3
- **Namespace**: cert-manager
- **Installation Method**: Helm with values file
- **Security**: Hardened with security contexts and resource limits

### Workload Identity Configuration

- **Identity Name**: cert-manager-identity
- **Client ID**: 1317ba0a-60d3-4f05-b41e-483ed1d6acb3
- **Principal ID**: a42ca684-811c-4441-94b5-e9383d176f4f
- **Azure Roles**: DNS Zone Contributor on subscription 133d5755-4074-4d6e-ad38-eb2a6ad12903
- **DNS Zone**: davidmarkgardiner.co.uk (resource group: dns)

## ClusterIssuers Available

### DNS-01 Solvers (Azure DNS)

1. **letsencrypt-prod-dns01** - Production Let's Encrypt with Azure DNS
2. **letsencrypt-staging-dns01** - Staging Let's Encrypt with Azure DNS

**Supports**:

- Wildcard certificates (\*.domain.com)
- Private/internal domains
- Domains without HTTP access
- Multi-domain certificates

### HTTP-01 Solvers (Istio Gateway)

1. **letsencrypt-prod-http01** - Production Let's Encrypt with HTTP-01
2. **letsencrypt-staging-http01** - Staging Let's Encrypt with HTTP-01

**Supports**:

- Public domains with HTTP access
- Istio Gateway integration
- Single domain certificates

## Usage Examples

### DNS-01 Certificate (Recommended for wildcards)

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-cert
  namespace: your-namespace
spec:
  secretName: wildcard-cert-tls
  issuerRef:
    name: letsencrypt-prod-dns01
    kind: ClusterIssuer
  dnsNames:
    - "*.your-domain.davidmarkgardiner.co.uk"
    - "your-domain.davidmarkgardiner.co.uk"
```

### HTTP-01 Certificate (For public domains)

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: public-cert
  namespace: your-namespace
spec:
  secretName: public-cert-tls
  issuerRef:
    name: letsencrypt-prod-http01
    kind: ClusterIssuer
  dnsNames:
    - "app.davidmarkgardiner.co.uk"
```

### Istio Gateway with TLS

```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: secure-gateway
  namespace: your-namespace
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: your-cert-tls # Same as Certificate secretName
      hosts:
        - "app.davidmarkgardiner.co.uk"
```

## Files Created

1. **cert-manager-values.yaml** - Helm values with workload identity
2. **cert-manager-clusterissuers-azure.yaml** - DNS-01 ClusterIssuers
3. **cert-manager-clusterissuers-http01.yaml** - HTTP-01 ClusterIssuers
4. **cert-manager-test-certificates.yaml** - Test certificates
5. **cert-manager-monitoring.yaml** - Monitoring setup
6. **cert-manager-setup-summary.md** - This summary

## Testing Status

Two test certificates have been created:

- **test-dns01-cert**: Single domain DNS-01 challenge
- **test-wildcard-cert**: Wildcard domain DNS-01 challenge

Both certificates are using staging Let's Encrypt and should complete within 5-10 minutes.

## Monitoring Setup

ServiceMonitors and PrometheusRules are configured for:

- Cert-manager controller metrics
- Certificate expiration alerts (21 days warning, 7 days critical)
- Rate limiting alerts
- Challenge failure alerts
- Component health monitoring

## Key Features Enabled

✅ Azure Workload Identity (no secrets required)
✅ DNS-01 challenges for wildcard certificates
✅ HTTP-01 challenges for public domains
✅ Let's Encrypt staging and production
✅ Istio service mesh integration
✅ Security hardening with non-root containers
✅ Resource limits and requests
✅ Monitoring and alerting ready

## Maintenance Commands

```bash
# Check cert-manager status
kubectl get pods -n cert-manager
kubectl get clusterissuer

# Monitor certificate issuance
kubectl get certificate -A
kubectl describe certificate <cert-name>

# Check challenges (for troubleshooting)
kubectl get challenge -A
kubectl describe challenge <challenge-name>

# View cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager

# Test DNS propagation
nslookup _acme-challenge.<domain>.davidmarkgardiner.co.uk
```

## Next Steps

1. Wait for test certificates to be issued (5-10 minutes)
2. Deploy monitoring stack if not already available
3. Create production certificates for your applications
4. Set up automated certificate renewal monitoring
5. Configure backup procedures for certificate secrets

## Troubleshooting

### Common Issues:

1. **DNS propagation delays**: DNS-01 challenges can take 2-10 minutes
2. **Workload identity**: Ensure pod has the correct annotations
3. **Azure permissions**: Verify DNS Zone Contributor role assignment
4. **Rate limits**: Use staging issuer for testing

### Debug Commands:

```bash
# Check workload identity
kubectl get serviceaccount cert-manager -n cert-manager -o yaml

# Check Azure DNS records
az network dns record-set txt list --zone-name davidmarkgardiner.co.uk --resource-group dns

# Verify role assignments
az role assignment list --assignee 1317ba0a-60d3-4f05-b41e-483ed1d6acb3
```
