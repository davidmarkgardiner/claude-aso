# External-DNS Azure Setup with Service Operator

This guide sets up External-DNS with Azure DNS using Azure Service Operator for managing User Assigned Managed Identity and Federated Identity Credentials.

## Prerequisites Checklist

- [ ] AKS cluster or self-managed Kubernetes cluster on Azure
- [ ] Azure Service Operator installed in the cluster
- [ ] External-DNS Helm chart available
- [ ] Azure CLI installed and authenticated
- [ ] kubectl configured for your cluster

## Environment Variables

First, set up your environment variables:

```bash
# Your existing DNS zone details
export SUBSCRIPTION_ID="133d5755-4074-4d6e-ad38-eb2a6ad12903"
export RESOURCE_GROUP="dns"
export DNS_ZONE_NAME="davidmarkgardiner.co.uk"
export LOCATION="uksouth"  # Change as needed

# Identity and cluster details
export IDENTITY_NAME="external-dns-identity"
export IDENTITY_RESOURCE_GROUP="dns"  # Or separate RG if preferred
export NAMESPACE="external-dns"
export SERVICE_ACCOUNT_NAME="external-dns"

# Get cluster info
export CLUSTER_NAME=$(kubectl config current-context | cut -d'_' -f4)
export CLUSTER_RESOURCE_GROUP=$(az aks list --query "[?name=='$CLUSTER_NAME'].resourceGroup" -o tsv)
export OIDC_ISSUER=$(az aks show --name $CLUSTER_NAME --resource-group $CLUSTER_RESOURCE_GROUP --query "oidcIssuerProfile.issuerUrl" -o tsv)
echo $OIDC_ISSUER

echo "DNS Zone: $DNS_ZONE_NAME"
echo "Cluster: $CLUSTER_NAME"
echo "OIDC Issuer: $OIDC_ISSUER"
```

## Step 1: Create User Assigned Managed Identity with Azure Service Operator

Create the UserAssignedIdentity resource:

```yaml
# uami.yaml
apiVersion: managedidentity.azure.com/v1api20181130
kind: UserAssignedIdentity
metadata:
  name: external-dns-identity
  namespace: external-dns
spec:
  location: uksouth  # Change as needed
  owner:
    name: dns  # Resource group name
    armId: /subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/dns


Apply the resources:

```bash
kubectl apply -f uami.yaml

# Wait for the identity to be created
kubectl wait --for=condition=Ready userassignedidentity/external-dns-identity -n external-dns --timeout=300s

# Get the client ID
export CLIENT_ID=$(kubectl get userassignedidentity external-dns-identity -n external-dns -o jsonpath='{.status.clientId}')
echo "Client ID: $CLIENT_ID"
```

## Step 2: Assign DNS Zone Contributor Role

```bash
# Assign DNS Zone Contributor role to the managed identity
az role assignment create \
  --assignee $CLIENT_ID \
  --role "DNS Zone Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Network/dnszones/$DNS_ZONE_NAME"

echo "Role assigned successfully"
```

## Step 3: Create Federated Identity Credential

```yaml
# federated-identity.yaml
apiVersion: managedidentity.azure.com/v1api20220131preview
kind: FederatedIdentityCredential
metadata:
  name: external-dns-federated-credential
  namespace: external-dns
spec:
  audiences:
    - api://AzureADTokenExchange
  issuer: ${OIDC_ISSUER}  # Replace with actual OIDC issuer URL
  subject: system:serviceaccount:external-dns:external-dns
  owner:
    name: external-dns-identity
```

**Note**: Replace `${OIDC_ISSUER}` with your actual OIDC issuer URL before applying.

```bash
# Replace the placeholder with actual OIDC issuer
envsubst < federated-identity.yaml | kubectl apply -f -

# Verify federated identity credential
kubectl get federatedidentitycredential -n external-dns
```

## Step 4: Create External-DNS Values File

```yaml
# external-dns-values.yaml
podLabels: 
  "azure.workload.identity/use": "true"

serviceAccount:
  create: true
  name: external-dns
  labels: 
    "azure.workload.identity/use": "true"
  annotations: 
    "azure.workload.identity/client-id": "${CLIENT_ID}"  # Replace with actual client ID
  automountServiceAccountToken: true

logLevel: debug
logFormat: json
interval: 1m

provider:
  name: azure  # Use 'azure' for public DNS

sources:
  - ingress
  - service

dnsPolicy: Default

domainFilters: 
  - davidmarkgardiner.co.uk

txtOwnerId: external-dns

policy: upsert-only

registry: txt

txtPrefix: external-dns-

env:
  - name: AZURE_SUBSCRIPTION_ID
    value: "133d5755-4074-4d6e-ad38-eb2a6ad12903"
  - name: AZURE_RESOURCE_GROUP
    value: "dns"
```

Replace the CLIENT_ID placeholder:

```bash
envsubst < external-dns-values.yaml > external-dns-values-final.yaml
```

## Step 5: Install External-DNS

```bash
# Add External-DNS Helm repository
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo update

# Install External-DNS
helm upgrade --install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  --values external-dns-values-final.yaml

# Check deployment status
kubectl get pods -n external-dns
kubectl logs -f deployment/external-dns -n external-dns
```

## Step 6: Test with Sample Application

Create a test application with ingress:

```yaml
# test-app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: external-dns
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: test-app
        image: nginx:alpine
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: test-app-service
  namespace: external-dns
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: test-app-ingress
  namespace: external-dns
  annotations:
    external-dns.alpha.kubernetes.io/hostname: "test.davidmarkgardiner.co.uk"
spec:
  rules:
  - host: "test.davidmarkgardiner.co.uk"
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: test-app-service
            port:
              number: 80
```

Deploy the test application:

```bash
kubectl apply -f test-app.yaml
```

## Step 7: Verification Commands

### Check External-DNS Logs
```bash
kubectl logs -f deployment/external-dns -n external-dns
```

### Verify DNS Records
```bash
# List DNS records in your zone
az network dns record-set a list \
  --zone-name $DNS_ZONE_NAME \
  --resource-group $RESOURCE_GROUP \
  --output table

# Check TXT records (External-DNS creates these for ownership)
az network dns record-set txt list \
  --zone-name $DNS_ZONE_NAME \
  --resource-group $RESOURCE_GROUP \
  --output table
```

### Test DNS Resolution
```bash
# Test DNS resolution
nslookup test.davidmarkgardiner.co.uk

# Test with dig
dig test.davidmarkgardiner.co.uk
```

### Check Kubernetes Resources
```bash
# Check all external-dns resources
kubectl get all -n external-dns

# Check managed identity status
kubectl get userassignedidentity -n external-dns -o yaml

# Check federated identity credential
kubectl get federatedidentitycredential -n external-dns -o yaml
```

## Troubleshooting Commands

### Check Service Account Annotations
```bash
kubectl get serviceaccount external-dns -n external-dns -o yaml
```

### Verify Workload Identity Setup
```bash
kubectl describe pod -l app.kubernetes.io/name=external-dns -n external-dns
```

### Check RBAC Permissions
```bash
# Verify the managed identity has proper permissions
az role assignment list --assignee $CLIENT_ID --output table
```

### Debug External-DNS Issues
```bash
# Increase log level for debugging
helm upgrade external-dns external-dns/external-dns \
  --namespace external-dns \
  --values external-dns-values-final.yaml \
  --set logLevel=debug

# Check events
kubectl get events -n external-dns --sort-by='.lastTimestamp'
```

## Cleanup Commands

To remove all resources:

```bash
# Remove test application
kubectl delete -f test-app.yaml

# Remove External-DNS
helm uninstall external-dns -n external-dns

# Remove Azure Service Operator resources
kubectl delete federatedidentitycredential external-dns-federated-credential -n external-dns
kubectl delete userassignedidentity external-dns-identity -n external-dns

# Remove namespace
kubectl delete namespace external-dns

# Remove role assignment (optional)
az role assignment delete \
  --assignee $CLIENT_ID \
  --role "DNS Zone Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Network/dnszones/$DNS_ZONE_NAME"
```

## Success Indicators

Your setup is working correctly when:

1. ✅ External-DNS pods are running without errors
2. ✅ DNS records are automatically created in Azure DNS when you create ingresses
3. ✅ TXT records with "external-dns-" prefix appear for ownership tracking
4. ✅ DNS resolution works for your test domains
5. ✅ No authentication errors in External-DNS logs

## Common Issues & Solutions

### Issue: "failed to get token"
- **Solution**: Verify federated identity credential configuration and OIDC issuer URL

### Issue: "Access denied" or permission errors
- **Solution**: Check role assignments and ensure DNS Zone Contributor role is properly assigned

### Issue: DNS records not created
- **Solution**: Check domain filters and ensure ingress annotations are correct

### Issue: Service account not properly annotated
- **Solution**: Verify client-id annotation matches the managed identity client ID