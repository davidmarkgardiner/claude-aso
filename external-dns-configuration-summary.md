# External DNS Configuration Summary

## Overview

External DNS has been successfully configured on the AKS cluster `uk8s-tsshared-weu-gt025-int-prod` with Azure Workload Identity integration. The system automatically creates and manages DNS records in the Azure DNS zone `davidmarkgardiner.co.uk`.

## Configuration Details

### Cluster Information

- **Cluster Name**: uk8s-tsshared-weu-gt025-int-prod
- **DNS Zone**: davidmarkgardiner.co.uk
- **Resource Group**: dns
- **Subscription ID**: 133d5755-4074-4d6e-ad38-eb2a6ad12903

### External DNS Setup

- **Version**: v0.18.0
- **Namespace**: external-dns
- **Authentication**: Azure Workload Identity
- **Client ID**: 024244f9-7bb4-426a-932a-4ceec47026a6
- **Sources**: service, ingress, istio-gateway, istio-virtualservice

### Key Configuration Parameters

```yaml
args:
  - --source=service
  - --source=ingress
  - --source=istio-gateway
  - --source=istio-virtualservice
  - --domain-filter=davidmarkgardiner.co.uk
  - --provider=azure
  - --azure-resource-group=dns
  - --azure-subscription-id=$(AZURE_SUBSCRIPTION_ID)
  - --txt-prefix=externaldns-
  - --txt-owner-id=uk8s-tsshared-weu-gt025-int-prod
  - --interval=1m
  - --log-level=info
  - --policy=sync
  - --registry=txt
  - --txt-cache-interval=1h
  - --events
  - --metrics-address=0.0.0.0:7979
```

### Workload Identity Integration

The External DNS service account is configured with:

```yaml
metadata:
  annotations:
    azure.workload.identity/client-id: 024244f9-7bb4-426a-932a-4ceec47026a6
  labels:
    azure.workload.identity/use: "true"
```

The pod template includes:

```yaml
metadata:
  labels:
    azure.workload.identity/use: "true"
```

### Azure Configuration

A ConfigMap named `azure-config` provides the Azure DNS configuration:

```json
{
  "useManagedIdentityExtension": true,
  "useWorkloadIdentityExtension": true,
  "subscriptionId": "133d5755-4074-4d6e-ad38-eb2a6ad12903",
  "resourceGroup": "dns"
}
```

## Integration with Cert-Manager

### ClusterIssuer Configuration

The existing cert-manager setup includes DNS01 challenge support:

- **ClusterIssuer**: letsencrypt-prod-dns01
- **DNS Zone**: davidmarkgardiner.co.uk
- **Challenge Type**: DNS01 using Azure DNS
- **Authentication**: Azure Workload Identity (different client ID: 1317ba0a-60d3-4f05-b41e-483ed1d6acb3)

### Seamless Integration

- External DNS manages DNS records for services and ingresses
- Cert-manager creates temporary DNS01 challenge records for certificate provisioning
- Both systems use Azure Workload Identity for secure authentication
- No conflicts between External DNS and cert-manager DNS operations

## Usage Examples

### LoadBalancer Service with DNS

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
  annotations:
    external-dns.alpha.kubernetes.io/hostname: myapp.davidmarkgardiner.co.uk
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
    - port: 80
```

### Ingress with Automatic SSL

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  annotations:
    external-dns.alpha.kubernetes.io/hostname: secure.davidmarkgardiner.co.uk
    cert-manager.io/cluster-issuer: letsencrypt-prod-dns01
spec:
  tls:
    - hosts:
        - secure.davidmarkgardiner.co.uk
      secretName: my-ingress-tls
  rules:
    - host: secure.davidmarkgardiner.co.uk
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80
```

## Monitoring and Troubleshooting

### Check External DNS Status

```bash
kubectl get pods -n external-dns
kubectl logs -n external-dns deployment/external-dns --tail=20
```

### Verify DNS Record Creation

```bash
kubectl get services -o wide
kubectl get ingress
```

### Monitor Certificate Provisioning

```bash
kubectl get certificates
kubectl get challenges
kubectl describe certificate <cert-name>
```

### Test DNS Resolution

```bash
nslookup <hostname>.davidmarkgardiner.co.uk
dig <hostname>.davidmarkgardiner.co.uk
```

## Status

✅ External DNS is successfully configured and running
✅ Azure Workload Identity authentication working
✅ DNS records automatically created for LoadBalancer services
✅ Integration with cert-manager confirmed
✅ DNS01 challenges working for SSL certificate provisioning

The system is ready for production use with automatic DNS record management and SSL certificate provisioning.
