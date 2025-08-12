# Strict mTLS Enforcement Guide

## Overview

This guide ensures that **ALL** communication within the Istio service mesh uses strict mutual TLS (mTLS), preventing any unencrypted or unauthenticated traffic. The implementation includes:

1. **Istio Configuration**: PeerAuthentication and DestinationRules enforcing STRICT mode
2. **Kyverno Policies**: Preventing creation of PERMISSIVE or DISABLE configurations
3. **Verification Tools**: Scripts and jobs to validate mTLS enforcement

## Why Strict mTLS?

- **Zero-Trust Security**: Every connection is authenticated and encrypted
- **Compliance**: Meets regulatory requirements (PCI-DSS, HIPAA, SOC2)
- **Attack Prevention**: Blocks MITM attacks, eavesdropping, and unauthorized access
- **Multi-Tenant Isolation**: Ensures tenant traffic cannot be intercepted

## Implementation Components

### 1. Istio mTLS Configuration (`mtls-strict-enforcement.yaml`)

#### Mesh-Wide Policy

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT # Forces mTLS everywhere
```

#### Namespace-Specific Policies

Each namespace has its own PeerAuthentication:

- `tenant-a`: STRICT mode
- `tenant-b`: STRICT mode
- `shared-services`: STRICT mode
- `istio-testing`: STRICT mode
- `external-services`: STRICT mode
- `aks-istio-system`: STRICT mode

#### DestinationRules

```yaml
# Forces Istio mTLS for all inter-service communication
spec:
  host: "*.local"
  trafficPolicy:
    tls:
      mode: ISTIO_MUTUAL
```

### 2. Kyverno Enforcement Policies (`kyverno-mtls-policies.yaml`)

#### Policy 1: Block Non-Strict PeerAuthentication

- **Blocks**: PERMISSIVE and DISABLE modes
- **Enforces**: Only STRICT mode allowed
- **Port-Level**: Prevents port-specific exceptions

#### Policy 2: Enforce mTLS in DestinationRules

- **Internal Services**: Must use ISTIO_MUTUAL
- **Blocks**: DISABLE and SIMPLE modes for cluster services
- **Subsets**: Cannot downgrade TLS

#### Policy 3: Auto-Generate Default Policy

- **Creates**: Default PeerAuthentication if missing
- **Location**: istio-system namespace
- **Mode**: Always STRICT

#### Policy 4: Secure Sidecar Configuration

- **Tenants**: Must use REGISTRY_ONLY (not ALLOW_ANY)
- **Scope**: Requires workloadSelector

#### Policy 5: Audit Compliance

- **Services**: Checks for bypass annotations
- **Workloads**: Identifies pods without sidecars
- **Database Ports**: Ensures critical ports have mTLS

### 3. Verification Tools (`mtls-verification.yaml`)

#### Test Resources

- **mtls-test-pod**: Pod without sidecar (should fail)
- **insecure-test-service**: Service without mTLS (blocked)

#### Verification Script

Comprehensive checks including:

1. Mesh-wide policy validation
2. Namespace policy audit
3. DestinationRule TLS settings
4. Pods without sidecars detection
5. Cross-namespace connectivity tests
6. PERMISSIVE mode violations scan

## Deployment Steps

### Step 1: Apply Kyverno Policies First

```bash
# Install Kyverno if not already installed
kubectl apply -f https://github.com/kyverno/kyverno/releases/latest/download/install.yaml

# Wait for Kyverno to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/component=kyverno -n kyverno --timeout=120s

# Apply mTLS enforcement policies
kubectl apply -f istio-apps/security/kyverno-mtls-policies.yaml
```

### Step 2: Apply Istio mTLS Configuration

```bash
# Apply strict mTLS configuration
kubectl apply -f istio-apps/security/mtls-strict-enforcement.yaml

# Verify policies are created
kubectl get peerauthentication -A
kubectl get destinationrule -A
```

### Step 3: Run Verification

```bash
# Deploy verification resources
kubectl apply -f istio-apps/security/mtls-verification.yaml

# Run verification job
kubectl create job --from=job/mtls-verification-job mtls-verify-$(date +%s) -n istio-testing

# Check job logs
kubectl logs -n istio-testing job/mtls-verify-$(date +%s)
```

## Verification Commands

### Check mTLS Status

```bash
# Verify mesh-wide policy
kubectl get peerauthentication default -n istio-system -o yaml

# Check all PeerAuthentications
kubectl get peerauthentication -A -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,MODE:.spec.mtls.mode

# Verify DestinationRules
kubectl get destinationrule -A -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,TLS:.spec.trafficPolicy.tls.mode
```

### Test mTLS Enforcement

```bash
# Test from pod with sidecar (should work)
kubectl exec -n tenant-a deployment/podinfo-v1 -c podinfo -- \
  curl -s http://prometheus.shared-services:9090/-/healthy

# Test from pod without sidecar (should fail)
kubectl exec -n istio-testing mtls-test-pod -- \
  curl -s http://podinfo.tenant-a:9898/healthz
# Expected: Connection refused or timeout
```

### Monitor Kyverno Violations

```bash
# Check policy violations
kubectl get events -A --field-selector reason=PolicyViolation

# Get Kyverno policy report
kubectl get polr -A | grep mtls

# Check blocked resources
kubectl describe cpol enforce-strict-mtls-peerauthentication
```

## Troubleshooting

### Issue: Service Not Accessible After Enabling Strict mTLS

**Symptom**: 503 errors or connection refused

**Solutions**:

1. Ensure sidecar injection is enabled:

```yaml
metadata:
  labels:
    sidecar.istio.io/inject: "true"
```

2. Restart pods to inject sidecars:

```bash
kubectl rollout restart deployment/<name> -n <namespace>
```

3. Check sidecar status:

```bash
kubectl get pods -n <namespace> -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].name}{"\n"}{end}'
```

### Issue: Kyverno Blocking Legitimate Configuration

**Symptom**: Cannot create PeerAuthentication

**Solution**:
Check if trying to create non-STRICT mode:

```bash
kubectl get peerauthentication <name> -n <namespace> -o yaml --dry-run=client
```

### Issue: External Services Not Working

**Symptom**: Cannot reach external APIs

**Note**: External services don't use mTLS. Ensure:

1. ServiceEntry exists for the external service
2. DestinationRule uses SIMPLE mode for external hosts:

```yaml
spec:
  host: external-api.com
  trafficPolicy:
    tls:
      mode: SIMPLE # OK for external services
```

## Security Best Practices

### Do's ✅

1. **Always use STRICT mode** for all namespaces
2. **Enable sidecar injection** for all workloads
3. **Use ISTIO_MUTUAL** for internal DestinationRules
4. **Monitor policy violations** regularly
5. **Test after deployment** changes

### Don'ts ❌

1. **Never use PERMISSIVE mode** in production
2. **Never disable sidecar injection** for services
3. **Don't use DISABLE mode** for any PeerAuthentication
4. **Avoid SIMPLE TLS** for internal services
5. **Don't bypass mTLS** with annotations

## Monitoring and Alerting

### Prometheus Metrics

```yaml
# Alert for services without mTLS
- alert: ServiceWithoutMTLS
  expr: |
    istio_tcp_connections_opened_total{
      security_policy!="mutual_tls"
    } > 0
  annotations:
    summary: "Service {{ $labels.destination_service }} has non-mTLS connections"

# Alert for PERMISSIVE mode
- alert: PermissiveMTLSDetected
  expr: |
    istio_request_duration_milliseconds_count{
      response_code="000"
    } > 0
  annotations:
    summary: "Possible PERMISSIVE mTLS mode detected"
```

### Grafana Dashboard Queries

Check mTLS adoption:

```promql
# Percentage of mTLS connections
sum(rate(istio_tcp_connections_opened_total{security_policy="mutual_tls"}[5m])) /
sum(rate(istio_tcp_connections_opened_total[5m])) * 100
```

Identify non-mTLS traffic:

```promql
# Services receiving non-mTLS traffic
sum by (destination_service_name) (
  rate(istio_request_total{security_policy!="mutual_tls"}[5m])
)
```

## Compliance Validation

### Audit Checklist

- [ ] All namespaces have PeerAuthentication with STRICT mode
- [ ] No PERMISSIVE or DISABLE modes in any configuration
- [ ] All internal DestinationRules use ISTIO_MUTUAL
- [ ] All pods have Istio sidecars injected
- [ ] Kyverno policies are enforcing (not just auditing)
- [ ] No override annotations bypassing mTLS
- [ ] External services properly configured with ServiceEntries

### Compliance Report Script

```bash
#!/bin/bash
echo "mTLS Compliance Report - $(date)"
echo "================================"

# Count STRICT policies
STRICT_COUNT=$(kubectl get peerauthentication -A -o json | jq '[.items[] | select(.spec.mtls.mode == "STRICT")] | length')
TOTAL_COUNT=$(kubectl get peerauthentication -A -o json | jq '.items | length')

echo "PeerAuthentication Compliance: $STRICT_COUNT/$TOTAL_COUNT STRICT"

# Check for violations
VIOLATIONS=$(kubectl get events -A --field-selector reason=PolicyViolation -o json | jq '.items | length')
echo "Policy Violations in last hour: $VIOLATIONS"

# Pod sidecar coverage
PODS_WITH_SIDECAR=$(kubectl get pods -A -o json | jq '[.items[] | select(.spec.containers | length > 1)] | length')
TOTAL_PODS=$(kubectl get pods -A -o json | jq '.items | length')

echo "Sidecar Coverage: $PODS_WITH_SIDECAR/$TOTAL_PODS pods"
echo "================================"
```

## Migration from PERMISSIVE to STRICT

If currently using PERMISSIVE mode:

1. **Audit Current State**:

```bash
kubectl get peerauthentication -A -o yaml | grep -B5 "mode: PERMISSIVE"
```

2. **Deploy Kyverno in Audit Mode First**:

```yaml
spec:
  validationFailureAction: Audit # Change to Enforce later
```

3. **Gradually Update Namespaces**:

```bash
# Update one namespace at a time
kubectl patch peerauthentication <name> -n <namespace> --type='merge' -p '{"spec":{"mtls":{"mode":"STRICT"}}}'
```

4. **Monitor for Issues**:

```bash
# Watch for 503 errors
kubectl logs -n istio-system deployment/istiod | grep "mTLS"
```

5. **Enable Enforcement**:

```bash
# Update Kyverno to Enforce mode
kubectl patch cpol enforce-strict-mtls-peerauthentication --type='merge' -p '{"spec":{"validationFailureAction":"Enforce"}}'
```

## References

- [Istio mTLS Documentation](https://istio.io/latest/docs/concepts/security/#mutual-tls-authentication)
- [Kyverno Policy Library](https://kyverno.io/policies/)
- [Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture)
