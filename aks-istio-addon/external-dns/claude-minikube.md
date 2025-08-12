# External-DNS Azure Setup for Minikube

This guide sets up External-DNS running on Minikube to manage Azure DNS records. Since Minikube doesn't support Azure Workload Identity, we'll use service principal authentication.

## Prerequisites Checklist

- [ ] Minikube cluster running locally
- [ ] Azure CLI installed and authenticated (`az login`)
- [ ] kubectl configured for your Minikube cluster
- [ ] Helm installed
- [ ] Docker running (for Minikube)

## Environment Variables

Set up your environment variables:

```bash
# Your existing DNS zone details
export SUBSCRIPTION_ID="133d5755-4074-4d6e-ad38-eb2a6ad12903"
export RESOURCE_GROUP="dns"
export DNS_ZONE_NAME="davidmarkgardiner.co.uk"

# Service Principal details (will be created)
export SP_NAME="external-dns-minikube-sp"
export NAMESPACE="external-dns"

echo "DNS Zone: $DNS_ZONE_NAME"
echo "Subscription: $SUBSCRIPTION_ID"
echo "Resource Group: $RESOURCE_GROUP"
```

## Step 1: Verify Minikube Setup

```bash
# Check Minikube status
minikube status

# If not running, start Minikube
minikube start --driver=docker --memory=4096 --cpus=2

# Enable ingress addon for testing
minikube addons enable ingress

# Check cluster info
kubectl cluster-info
kubectl get nodes
```

## Step 2: Create Service Principal for External-DNS

Since Minikube doesn't support Azure Workload Identity, we'll create a service principal:

```bash
# Create service principal
az ad sp create-for-rbac --name $SP_NAME --query "{ client_id: appId, client_secret: password, tenant_id: tenant }"

# Store the output - you'll need these values:
# client_id, client_secret, tenant_id
```

**Important**: Save the output from the above command. You'll need the `client_id`, `client_secret`, and `tenant_id`.

Set these as environment variables (replace with actual values from above):

```bash
export CLIENT_ID="5c84c136-da8b-4a90-bfb4-2f0ff81d2404"
export CLIENT_SECRET=""
export TENANT_ID="550cfcda-8a2d-452c-ba71-d6bc6bf5bb31"
```

## Step 3: Assign DNS Zone Contributor Role

```bash
# Assign DNS Zone Contributor role to the service principal
az role assignment create \
  --assignee $CLIENT_ID \
  --role "DNS Zone Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Network/dnszones/$DNS_ZONE_NAME"

echo "Role assigned successfully to service principal"
```

## Step 4: Create Kubernetes Secret for Service Principal

```bash
# Create namespace
kubectl create namespace $NAMESPACE

# Create secret with service principal credentials
kubectl create secret generic azure-config-file \
  --from-literal=clientId=$CLIENT_ID \
  --from-literal=clientSecret=$CLIENT_SECRET \
  --from-literal=tenantId=$TENANT_ID \
  --from-literal=subscriptionId=$SUBSCRIPTION_ID \
  --from-literal=resourceGroup=$RESOURCE_GROUP \
  -n $NAMESPACE

# Verify secret creation
kubectl get secrets -n $NAMESPACE
```

## Step 5: Create External-DNS Configuration

Create the External-DNS values file for Minikube:

```yaml
# external-dns-minikube-values.yaml
logLevel: debug
logFormat: json
interval: 1m

provider:
  name: azure # Use 'azure' for public DNS

sources:
  - ingress
  - service

dnsPolicy: Default

domainFilters:
  - davidmarkgardiner.co.uk

txtOwnerId: external-dns-minikube

policy: upsert-only

registry: txt

txtPrefix: external-dns-

# Service principal configuration
env:
  - name: AZURE_CLIENT_ID
    valueFrom:
      secretKeyRef:
        name: azure-config-file
        key: clientId
  - name: AZURE_CLIENT_SECRET
    valueFrom:
      secretKeyRef:
        name: azure-config-file
        key: clientSecret
  - name: AZURE_TENANT_ID
    valueFrom:
      secretKeyRef:
        name: azure-config-file
        key: tenantId
  - name: AZURE_SUBSCRIPTION_ID
    valueFrom:
      secretKeyRef:
        name: azure-config-file
        key: subscriptionId
  - name: AZURE_RESOURCE_GROUP
    valueFrom:
      secretKeyRef:
        name: azure-config-file
        key: resourceGroup

# Minikube-specific settings
serviceAccount:
  create: true
  name: external-dns

rbac:
  create: true

# Resource limits for Minikube
resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 50m
    memory: 64Mi
```

## Step 6: Install External-DNS

```bash
# Add External-DNS Helm repository
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo update

# Install External-DNS
helm upgrade --install external-dns external-dns/external-dns \
  --namespace $NAMESPACE \
  --values aks-istio-addon/external-dns/external-dns-minikube-values.yaml

# Check deployment status
kubectl get pods -n $NAMESPACE -w
```

## Step 7: Create Test Application

Create a test application to verify External-DNS functionality:

```yaml
# test-app-minikube.yaml
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
        - name: nginx
          image: nginx:alpine
          ports:
            - containerPort: 80
          resources:
            limits:
              cpu: 100m
              memory: 128Mi
            requests:
              cpu: 50m
              memory: 64Mi
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
    external-dns.alpha.kubernetes.io/hostname: "minikube-test.davidmarkgardiner.co.uk"
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: "minikube-test.davidmarkgardiner.co.uk"
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
kubectl apply -f test-app-minikube.yaml

# Check ingress
kubectl get ingress -n $NAMESPACE
kubectl describe ingress test-app-ingress -n $NAMESPACE
```

## Step 8: Alternative - Test with LoadBalancer Service

For Minikube, you can also test with a LoadBalancer service using `minikube tunnel`:

```yaml
# test-service-lb.yaml
apiVersion: v1
kind: Service
metadata:
  name: test-loadbalancer
  namespace: external-dns
  annotations:
    external-dns.alpha.kubernetes.io/hostname: "lb-test.davidmarkgardiner.co.uk"
spec:
  selector:
    app: test-app
  ports:
    - port: 80
      targetPort: 80
  type: LoadBalancer
```

```bash
# Apply the LoadBalancer service
kubectl apply -f test-service-lb.yaml

# In a separate terminal, run minikube tunnel to expose LoadBalancer
minikube tunnel

# Check the service
kubectl get svc -n $NAMESPACE
```

## Step 9: Verification Commands

### Check External-DNS Logs

```bash
kubectl logs -f deployment/external-dns -n $NAMESPACE
```

### Verify DNS Records in Azure

```bash
# List A records
az network dns record-set a list \
  --zone-name $DNS_ZONE_NAME \
  --resource-group $RESOURCE_GROUP \
  --output table

# List TXT records (ownership records)
az network dns record-set txt list \
  --zone-name $DNS_ZONE_NAME \
  --resource-group $RESOURCE_GROUP \
  --output table
```

### Test DNS Resolution

```bash
# Test DNS resolution
nslookup minikube-test.davidmarkgardiner.co.uk
dig minikube-test.davidmarkgardiner.co.uk

# If using LoadBalancer service
nslookup lb-test.davidmarkgardiner.co.uk
```

### Check Minikube Ingress

```bash
# Get Minikube IP
minikube ip

# Test with curl (replace MINIKUBE_IP with actual IP)
curl -H "Host: minikube-test.davidmarkgardiner.co.uk" http://MINIKUBE_IP

# Or add to /etc/hosts for local testing
echo "$(minikube ip) minikube-test.davidmarkgardiner.co.uk" | sudo tee -a /etc/hosts
```

## Step 10: Monitoring and Debugging

### Check All Resources

```bash
# Check all external-dns resources
kubectl get all -n $NAMESPACE

# Check events
kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp'

# Describe External-DNS pod
kubectl describe pod -l app.kubernetes.io/name=external-dns -n $NAMESPACE
```

### Debug Service Principal Authentication

```bash
# Test Azure CLI with service principal (optional)
az login --service-principal \
  --username $CLIENT_ID \
  --password $CLIENT_SECRET \
  --tenant $TENANT_ID

# Test DNS access
az network dns record-set a list \
  --zone-name $DNS_ZONE_NAME \
  --resource-group $RESOURCE_GROUP
```

### View External-DNS Configuration

```bash
# Check configmap if created
kubectl get configmap -n $NAMESPACE

# Check secret
kubectl describe secret azure-config-file -n $NAMESPACE
```

## Minikube-Specific Commands

### Useful Minikube Commands

```bash
# Check Minikube addons
minikube addons list

# Access Minikube dashboard
minikube dashboard

# SSH into Minikube
minikube ssh

# Stop/Start Minikube
minikube stop
minikube start

# Delete Minikube cluster
minikube delete
```

### Port Forwarding for Local Testing

```bash
# Port forward to test app directly
kubectl port-forward svc/test-app-service 8080:80 -n $NAMESPACE

# Test locally
curl http://localhost:8080
```

## Cleanup Commands

```bash
# Remove test applications
kubectl delete -f test-app-minikube.yaml
kubectl delete -f test-service-lb.yaml 2>/dev/null || true

# Remove External-DNS
helm uninstall external-dns -n $NAMESPACE

# Remove secret and namespace
kubectl delete secret azure-config-file -n $NAMESPACE
kubectl delete namespace $NAMESPACE

# Remove service principal (optional)
az ad sp delete --id $CLIENT_ID

# Remove role assignment
az role assignment delete \
  --assignee $CLIENT_ID \
  --role "DNS Zone Contributor" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Network/dnszones/$DNS_ZONE_NAME"
```

## Success Indicators

Your Minikube External-DNS setup is working when:

1. ✅ External-DNS pod is running and logs show successful Azure authentication
2. ✅ DNS records automatically appear in Azure DNS when you create ingresses/services
3. ✅ TXT records with "external-dns-" prefix are created for ownership
4. ✅ `nslookup` resolves your test domains to the correct IPs
5. ✅ No authentication errors in External-DNS logs

## Common Minikube Issues & Solutions

### Issue: "failed to authenticate"

- **Solution**: Verify service principal credentials in the secret are correct

### Issue: Ingress not getting external IP

- **Solution**: Ensure ingress addon is enabled: `minikube addons enable ingress`

### Issue: LoadBalancer stuck in pending

- **Solution**: Run `minikube tunnel` in a separate terminal

### Issue: DNS records point to wrong IP

- **Solution**: Check `minikube ip` and ensure ingress controller is properly configured

### Issue: Can't reach application locally

- **Solution**: Use port-forwarding or add Minikube IP to /etc/hosts

### Issue: External-DNS can't reach Azure

- **Solution**: Check internet connectivity from Minikube: `minikube ssh` then `curl -I https://management.azure.com`
