# AKS Istio Addon Configuration Guide

## Important: AKS Istio Addon Specifics

The Azure Kubernetes Service (AKS) Istio addon uses **Azure Service Mesh (ASM)** based on upstream Istio but with specific requirements:

### Key Differences from Standard Istio

1. **Revision Labels Required**: AKS Istio addon uses revision-based injection
   - ✅ **Correct**: `istio.io/rev: asm-1-25`
   - ❌ **Wrong**: `istio-injection: enabled`

2. **Managed Control Plane**: Istiod is managed by Azure
   - Located in `aks-istio-system` namespace
   - Cannot modify control plane components directly

3. **Gateway Names**: Use AKS-specific gateway selectors
   - `istio: aks-istio-ingressgateway-internal`
   - `istio: aks-istio-ingressgateway-external`

## Correct Namespace Labeling

### For ASM 1.25 (Current Version)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: tenant-a
  labels:
    istio.io/rev: asm-1-25  # Correct for AKS
    # istio-injection: enabled  # WRONG - Don't use this
```

### Apply Labels via kubectl

```bash
# Correct way to label namespaces for AKS Istio
kubectl label namespace tenant-a istio.io/rev=asm-1-25

# Remove incorrect labels if they exist
kubectl label namespace tenant-a istio-injection-
```

## Deployment Configuration

### Correct Pod/Deployment Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: podinfo
  namespace: tenant-a
spec:
  template:
    metadata:
      labels:
        app: podinfo
        # Pod inherits injection from namespace label
      # annotations:
      #   sidecar.istio.io/inject: "true"  # Optional, namespace label is enough
    spec:
      containers:
      - name: podinfo
        image: stefanprodan/podinfo:latest
```

### Force Injection at Pod Level

If namespace doesn't have the label:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
  labels:
    istio.io/rev: asm-1-25  # Pod-level injection
  annotations:
    sidecar.istio.io/inject: "true"  # Alternative method
```

## Migration from Generic Labels

### Step 1: Run Migration Job

```bash
# Apply the migration resources
kubectl apply -f aks-istio-sidecar-enforcement.yaml

# Run the migration job
kubectl create job --from=job/aks-istio-label-migration migration-$(date +%s) -n aks-istio-system

# Check job logs
kubectl logs -n aks-istio-system job/migration-$(date +%s)
```

### Step 2: Verify Labels

```bash
# Check namespace labels
kubectl get namespaces -L istio.io/rev -L istio-injection

# Expected output:
# NAME               STATUS   AGE   ISTIO.IO/REV   ISTIO-INJECTION
# tenant-a           Active   1d    asm-1-25       <none>
# tenant-b           Active   1d    asm-1-25       <none>
# shared-services    Active   1d    asm-1-25       <none>
```

### Step 3: Restart Workloads

```bash
# Restart all deployments to pick up sidecars
for ns in tenant-a tenant-b shared-services; do
  kubectl rollout restart deployment -n $ns
  kubectl rollout restart statefulset -n $ns
done

# Verify sidecars are injected
kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"\t"}{.metadata.name}{"\t"}{.spec.containers[*].name}{"\n"}{end}' | grep istio-proxy
```

## Validation Policies Explained

### 1. OPA Gatekeeper Policy (`validation-policies.yaml`)

Updated to check for:
- Pod annotation: `sidecar.istio.io/inject: "true"`
- Pod label: `istio.io/rev: asm-1-25`
- Namespace label: `istio.io/rev: asm-1-25`

### 2. Kyverno Policies (`aks-istio-sidecar-enforcement.yaml`)

Three policies ensure AKS compatibility:

#### Policy 1: Enforce Sidecar Injection
- Validates namespace has `istio.io/rev: asm-1-25`
- Blocks incorrect `istio-injection: enabled`
- Ensures pods get sidecars

#### Policy 2: Auto-Mutation
- Adds correct labels automatically
- Removes incorrect labels
- Helps with migration

#### Policy 3: Configuration Validation
- Validates Gateway selectors
- Ensures EnvoyFilter compatibility
- Checks ServiceEntry conflicts

## Troubleshooting

### Issue: Sidecar Not Injected

**Check namespace label:**
```bash
kubectl get namespace tenant-a -o yaml | grep -A5 labels
```

**Fix:**
```bash
kubectl label namespace tenant-a istio.io/rev=asm-1-25 --overwrite
kubectl rollout restart deployment -n tenant-a
```

### Issue: Gateway Not Working

**Check selector:**
```yaml
# Correct for AKS
spec:
  selector:
    istio: aks-istio-ingressgateway-internal

# Wrong
spec:
  selector:
    istio: ingressgateway  # Generic selector won't work
```

### Issue: Webhook Errors

**Error:** `admission webhook "validation.istio.io" denied the request`

**Fix:** Ensure revision label matches installed version:
```bash
# Check installed revision
kubectl get mutatingwebhookconfigurations | grep istio

# Output should show: istio-sidecar-injector-asm-1-25
```

## Verification Commands

### Check Sidecar Injection Status

```bash
# List pods with container count
kubectl get pods -n tenant-a -o custom-columns=NAME:.metadata.name,CONTAINERS:.spec.containers[*].name

# Check injection webhook
kubectl get mutatingwebhookconfigurations istio-sidecar-injector-asm-1-25 -o yaml
```

### Verify Istio Configuration

```bash
# Check Istio version
kubectl get deployments -n aks-istio-system istiod-asm-1-25 -o jsonpath='{.spec.template.spec.containers[0].image}'

# Check proxy version in pods
kubectl get pods -n tenant-a -o jsonpath='{.items[*].spec.containers[?(@.name=="istio-proxy")].image}'
```

### Monitor Policy Violations

```bash
# Kyverno violations
kubectl get events -A --field-selector reason=PolicyViolation | grep istio

# OPA Gatekeeper violations
kubectl get k8srequireistiosidecar -o yaml
```

## Best Practices for AKS Istio

1. **Always use revision labels** (`istio.io/rev: asm-1-25`)
2. **Never modify aks-istio-system namespace** - It's managed by Azure
3. **Use AKS-specific gateway selectors** in Gateway resources
4. **Test in staging** before applying to production
5. **Keep policies in Audit mode** initially, then switch to Enforce
6. **Monitor the addon version** - Azure may update it

## Version Compatibility

| AKS Version | ASM Version | Revision Label | Istio Version |
|-------------|-------------|----------------|---------------|
| 1.28+       | 1.25        | asm-1-25      | 1.20.x        |
| 1.27+       | 1.24        | asm-1-24      | 1.19.x        |
| 1.26+       | 1.23        | asm-1-23      | 1.18.x        |

## References

- [AKS Istio Addon Documentation](https://learn.microsoft.com/en-us/azure/aks/istio-about)
- [Azure Service Mesh Configuration](https://learn.microsoft.com/en-us/azure/aks/istio-deploy-addon)
- [Istio Revision Labels](https://istio.io/latest/docs/setup/upgrade/canary/)