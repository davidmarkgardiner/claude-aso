# External DNS VirtualService Integration

## Overview

This document outlines the successful integration of External DNS v0.18.0 with Istio VirtualServices on Azure Kubernetes Service (AKS). The integration enables automatic DNS record management for Istio VirtualService resources, eliminating manual DNS configuration.

## Architecture

```
DNS Query → Azure DNS Zone → AKS Ingress Gateway → Istio VirtualService → Backend Service
     ↑                                                        ↓
External DNS ← Kubernetes API ← VirtualService with annotations
```

## Configuration Components

### 1. External DNS Deployment

- **Version**: v0.18.0
- **Provider**: Azure DNS
- **Authentication**: Azure Workload Identity
- **Sources**: service, ingress, istio-gateway, istio-virtualservice
- **Domain Filter**: davidmarkgardiner.co.uk
- **TXT Owner ID**: uk8s-tsshared-weu-gt025-int-prod

### 2. RBAC Permissions

Enhanced External DNS ClusterRole with Istio resource permissions:

```yaml
- apiGroups:
    - networking.istio.io
  resources:
    - virtualservices
    - gateways
  verbs:
    - get
    - watch
    - list
```

### 3. VirtualService Configuration

VirtualServices require specific annotations for External DNS integration:

```yaml
metadata:
  annotations:
    external-dns.alpha.kubernetes.io/hostname: app.davidmarkgardiner.co.uk
    external-dns.alpha.kubernetes.io/ttl: "300"
    external-dns.alpha.kubernetes.io/target: "10.251.76.226" # Ingress gateway IP
```

### 4. Istio Authorization Policies

Required for secure traffic routing:

- Allow-all policy for ingress gateway
- Service-specific policies for backend applications

## Validation Results

✅ **All tests passed successfully**

1. **External DNS Deployment**: Ready (1/1 replicas)
2. **Source Configuration**: istio-virtualservice and istio-gateway enabled
3. **RBAC Permissions**: External DNS can access Istio resources
4. **Test VirtualServices**: 2 test VirtualServices deployed
5. **DNS Records**: A records created for both test hostnames
6. **TXT Ownership**: 3 TXT records for ownership tracking
7. **Traffic Routing**: End-to-end connectivity working
8. **Log Processing**: External DNS processing VirtualServices

## DNS Records Created

| Hostname                        | Record Type | Target         | Source         |
| ------------------------------- | ----------- | -------------- | -------------- |
| podinfo.davidmarkgardiner.co.uk | A           | 10.251.76.226  | VirtualService |
| test-vs.davidmarkgardiner.co.uk | A           | 10.251.76.226  | VirtualService |
| externaldns-a-podinfo           | TXT         | ownership info | External DNS   |
| externaldns-a-test-vs           | TXT         | ownership info | External DNS   |

## Test Applications

### Podinfo Test Application

- **Namespace**: test-dns
- **Image**: ghcr.io/stefanprodan/podinfo:6.5.4
- **Replicas**: 2
- **Service**: ClusterIP on port 80
- **Istio injection**: Enabled

### VirtualService Routing

1. **podinfo.davidmarkgardiner.co.uk** → Direct routing to podinfo service
2. **test-vs.davidmarkgardiner.co.uk** → Routing with custom headers

## Traffic Flow Validation

```bash
curl -H "Host: test-vs.davidmarkgardiner.co.uk" http://10.251.76.226:80/
# Returns: podinfo application response with custom headers
```

## Files Created

1. **external-dns-rbac-patch.yaml** - Updated RBAC permissions
2. **test-app-podinfo.yaml** - Test application deployment
3. **test-istio-gateway.yaml** - Istio Gateway configuration
4. **test-virtualservice.yaml** - VirtualService with External DNS annotations
5. **test-authorization-policy.yaml** - Istio authorization policies
6. **external-dns-virtualservice-validation.sh** - Comprehensive validation script

## Monitoring

### External DNS Logs

Monitor VirtualService processing:

```bash
kubectl logs -n external-dns deployment/external-dns --tail=50 | grep virtualservice
```

### DNS Record Verification

```bash
az network dns record-set a list --resource-group dns --zone-name davidmarkgardiner.co.uk
```

## Key Benefits

1. **Automated DNS Management**: DNS records created automatically from VirtualService annotations
2. **Ownership Tracking**: TXT records ensure safe multi-cluster operations
3. **GitOps Ready**: All configurations stored in version control
4. **Secure by Default**: Istio authorization policies enforce access control
5. **Comprehensive Monitoring**: Full observability of DNS operations

## Next Steps

1. **Production Deployment**: Apply configurations to production environments
2. **Certificate Integration**: Add TLS certificates for HTTPS endpoints
3. **Multi-Zone Support**: Configure for multiple Azure DNS zones
4. **Monitoring Dashboard**: Create Grafana dashboards for DNS metrics
5. **Automated Testing**: Implement CI/CD pipeline tests for DNS integration

## Configuration Summary

- ✅ External DNS v0.18.0 with Azure Workload Identity
- ✅ VirtualService and Gateway sources enabled
- ✅ RBAC permissions for Istio resources
- ✅ DNS A and TXT records automatically managed
- ✅ End-to-end traffic routing validated
- ✅ Authorization policies for secure access
- ✅ Comprehensive validation and monitoring

The integration is fully functional and ready for production use.
