# Envoy Security Considerations and Kyverno Policies

## What is Envoy?

Envoy is a high-performance edge and service proxy designed for cloud-native applications. In Istio service mesh, Envoy acts as the data plane proxy deployed as sidecars alongside application containers, handling all network traffic between services.

## Security Risks in Shared Kubernetes Clusters

### Critical Security Concerns

1. **Admin Interface Exposure** (CVE-2024-45806, CVE-2024-45809)
   - Risk: Exposing Envoy admin interface on `0.0.0.0` allows unauthorized access
   - Impact: Full control over proxy configuration, traffic manipulation
   - Found in: `admin-debug.yaml` line 134

2. **Privilege Escalation via EnvoyFilters**
   - Risk: Unrestricted EnvoyFilter creation can bypass security policies
   - Impact: Traffic interception, credential theft, data exfiltration

3. **Resource Exhaustion**
   - Risk: Uncontrolled memory/CPU usage via malicious filters
   - Impact: DoS attacks affecting entire cluster

4. **Cross-Tenant Traffic Manipulation**
   - Risk: EnvoyFilters affecting gateway configurations
   - Impact: Traffic redirection between tenants

5. **Sensitive Data Exposure**
   - Risk: Debug logging exposing headers, request bodies
   - Impact: PII/credential leakage in logs

6. **Lua Script Injection**
   - Risk: Arbitrary code execution via Lua filters
   - Impact: Complete proxy compromise

## Kyverno Policies for Security Enforcement

### Policy 1: Block Unsafe Admin Interface Binding

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: block-unsafe-envoy-admin-binding
  annotations:
    policies.kyverno.io/title: Block Unsafe Envoy Admin Binding
    policies.kyverno.io/category: Security
    policies.kyverno.io/severity: high
    policies.kyverno.io/description: >-
      Prevents EnvoyFilters from binding admin interface to 0.0.0.0
      which would expose it to external access. Admin interface must
      only bind to localhost (127.0.0.1).
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: check-admin-binding
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
            namespaces:
            - "*"
      validate:
        message: "Envoy admin interface must not bind to 0.0.0.0. Use 127.0.0.1 instead."
        deny:
          conditions:
            any:
            - key: "{{ request.object.spec.configPatches[?contains(@.value.admin.address.socket_address.address, '0.0.0.0')] }}"
              operator: AnyIn
              value: ["0.0.0.0"]
```

### Policy 2: Restrict EnvoyFilter Namespaces

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: restrict-envoyfilter-namespaces
  annotations:
    policies.kyverno.io/title: Restrict EnvoyFilter Creation
    policies.kyverno.io/category: Multi-Tenancy
    policies.kyverno.io/severity: medium
    policies.kyverno.io/description: >-
      Restricts EnvoyFilter creation to specific namespaces and
      prevents cross-namespace filter application.
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: restrict-namespace-scope
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
            namespaces:
            - "tenant-*"
      validate:
        message: "Tenant EnvoyFilters must use workloadSelector to limit scope"
        pattern:
          spec:
            workloadSelector:
              labels:
                "?*": "?*"
    - name: block-system-namespace-filters
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
            namespaces:
            - "tenant-*"
      validate:
        message: "Tenants cannot create EnvoyFilters targeting system namespaces"
        deny:
          conditions:
            any:
            - key: "{{ request.object.metadata.namespace }}"
              operator: In
              value: ["kube-system", "istio-system", "aks-istio-system"]
```

### Policy 3: Block Dangerous Lua Scripts

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: block-dangerous-lua-scripts
  annotations:
    policies.kyverno.io/title: Block Dangerous Lua Scripts
    policies.kyverno.io/category: Security
    policies.kyverno.io/severity: high
    policies.kyverno.io/description: >-
      Prevents EnvoyFilters with Lua scripts that contain dangerous
      functions like os.execute, io.popen, or file operations.
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: check-lua-content
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
      validate:
        message: "Lua scripts cannot contain dangerous functions (os.execute, io.popen, file operations)"
        deny:
          conditions:
            any:
            - key: "{{ request.object.spec.configPatches[?contains(@.value.typed_config.inline_code, 'os.execute')] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.configPatches[?contains(@.value.typed_config.inline_code, 'io.popen')] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.configPatches[?contains(@.value.typed_config.inline_code, 'io.open')] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.configPatches[?contains(@.value.typed_config.inline_code, 'loadfile')] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.configPatches[?contains(@.value.typed_config.inline_code, 'dofile')] }}"
              operator: AnyNotIn
              value: [""]
```

### Policy 4: Limit Resource Consumption

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: limit-envoyfilter-resources
  annotations:
    policies.kyverno.io/title: Limit EnvoyFilter Resource Usage
    policies.kyverno.io/category: Resource Management
    policies.kyverno.io/severity: medium
    policies.kyverno.io/description: >-
      Ensures EnvoyFilters have appropriate resource limits to prevent
      resource exhaustion attacks.
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: check-memory-limits
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
      validate:
        message: "EnvoyFilters with heap configuration must set reasonable limits (max 2GB)"
        deny:
          conditions:
            any:
            - key: "{{ request.object.spec.configPatches[?@.value.overload_manager.resource_monitors[?@.typed_config.max_heap_size_bytes > `2147483648`]] }}"
              operator: AnyNotIn
              value: [""]
```

### Policy 5: Restrict Sensitive Path Access

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: restrict-sensitive-paths
  annotations:
    policies.kyverno.io/title: Restrict Sensitive Path Access
    policies.kyverno.io/category: Security
    policies.kyverno.io/severity: high
    policies.kyverno.io/description: >-
      Prevents EnvoyFilters from accessing sensitive filesystem paths
      like /etc, /var/run, or Kubernetes secrets directories.
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: block-sensitive-paths
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
      validate:
        message: "EnvoyFilters cannot access sensitive filesystem paths"
        deny:
          conditions:
            any:
            - key: "{{ request.object.spec.configPatches[?contains(@.value, '/etc/')] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.configPatches[?contains(@.value, '/var/run/secrets')] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.configPatches[?contains(@.value, '/proc/')] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.configPatches[?contains(@.value, '/sys/')] }}"
              operator: AnyNotIn
              value: [""]
```

### Policy 6: Enforce RBAC on EnvoyFilter Creation

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: enforce-envoyfilter-rbac
  annotations:
    policies.kyverno.io/title: Enforce RBAC for EnvoyFilter
    policies.kyverno.io/category: Security
    policies.kyverno.io/severity: high
    policies.kyverno.io/description: >-
      Ensures only authorized service accounts can create EnvoyFilters
spec:
  validationFailureAction: Enforce
  background: false
  rules:
    - name: check-service-account
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
      validate:
        message: "Only authorized service accounts can create EnvoyFilters"
        deny:
          conditions:
            all:
            - key: "{{ request.userInfo.username }}"
              operator: NotIn
              value: 
              - "system:serviceaccount:flux-system:*"
              - "system:serviceaccount:aks-istio-system:*"
              - "cluster-admin"
```

### Policy 7: Prevent Gateway Hijacking

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: prevent-gateway-hijacking
  annotations:
    policies.kyverno.io/title: Prevent Gateway Hijacking
    policies.kyverno.io/category: Security
    policies.kyverno.io/severity: critical
    policies.kyverno.io/description: >-
      Prevents tenant EnvoyFilters from modifying gateway configurations
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: block-gateway-modifications
      match:
        any:
        - resources:
            kinds:
            - EnvoyFilter
            namespaces:
            - "tenant-*"
      validate:
        message: "Tenant EnvoyFilters cannot target gateway workloads"
        deny:
          conditions:
            any:
            - key: "{{ request.object.spec.configPatches[?@.match.context == 'GATEWAY'] }}"
              operator: AnyNotIn
              value: [""]
            - key: "{{ request.object.spec.workloadSelector.labels.istio }}"
              operator: Contains
              value: "gateway"
```

## Deployment Instructions

1. **Apply Kyverno Policies First**:
```bash
kubectl apply -f kyverno-policies/
```

2. **Test Policy Enforcement**:
```bash
# This should be blocked
kubectl apply -f test-unsafe-envoyfilter.yaml
```

3. **Monitor Policy Violations**:
```bash
kubectl get events --field-selector reason=PolicyViolation -n <namespace>
```

## Security Best Practices

### For Platform Teams

1. **Principle of Least Privilege**
   - Grant EnvoyFilter permissions only to trusted operators
   - Use RBAC to limit namespace scope

2. **Regular Audits**
   - Review all EnvoyFilters quarterly
   - Check for deprecated or vulnerable configurations
   - Monitor Envoy CVE database

3. **Resource Quotas**
   - Set memory/CPU limits for Envoy sidecars
   - Implement rate limiting at gateway level

4. **Logging and Monitoring**
   - Centralize Envoy access logs
   - Alert on suspicious patterns
   - Monitor resource consumption

### For Tenant Teams

1. **Use Istio Native Features**
   - Prefer VirtualServices/DestinationRules over EnvoyFilters
   - Use AuthorizationPolicies for RBAC

2. **Test in Development**
   - Validate EnvoyFilters in isolated environments
   - Use Istio's built-in telemetry

3. **Document Custom Filters**
   - Maintain clear documentation
   - Include security review in PR process

## Known Vulnerabilities (2024)

| CVE | Severity | Description | Mitigation |
|-----|----------|-------------|------------|
| CVE-2024-45806 | High | HTTP/2 CONTINUATION flood | Update to Envoy 1.31.2+ |
| CVE-2024-45809 | High | Admin interface bypass | Restrict admin binding |
| CVE-2024-45810 | Medium | Header injection | Validate headers |
| CVE-2024-32976 | High | Path traversal | Update to latest version |
| CVE-2024-23327 | Critical | Request smuggling | Apply security patches |

## Monitoring and Alerting

### Key Metrics to Monitor

```yaml
# Prometheus alerts for Envoy security
groups:
- name: envoy-security
  rules:
  - alert: EnvoyHighMemoryUsage
    expr: container_memory_usage_bytes{container="istio-proxy"} > 2147483648
    for: 5m
    annotations:
      summary: "Envoy proxy high memory usage"
      
  - alert: EnvoyAdminExposed
    expr: envoy_http_admin_access_total > 0
    for: 1m
    annotations:
      summary: "Envoy admin interface accessed"
      
  - alert: SuspiciousEnvoyFilter
    expr: increase(envoy_lua_script_errors_total[5m]) > 10
    annotations:
      summary: "High Lua script error rate"
```

## Emergency Response

If a security incident occurs:

1. **Immediate Actions**:
```bash
# Delete suspicious EnvoyFilter
kubectl delete envoyfilter <name> -n <namespace>

# Restart affected pods
kubectl rollout restart deployment -n <namespace>
```

2. **Investigation**:
```bash
# Check Envoy config dump
kubectl exec <pod> -c istio-proxy -- curl -s localhost:15000/config_dump

# Review access logs
kubectl logs <pod> -c istio-proxy --tail=1000
```

3. **Remediation**:
- Apply security patches
- Update Kyverno policies
- Review and rotate credentials

## References

- [Envoy Security Model](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/security/threat_model)
- [Istio Security Best Practices](https://istio.io/latest/docs/ops/best-practices/security/)
- [Kyverno Policy Library](https://kyverno.io/policies/)
- [NIST Kubernetes Security Guide](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-190.pdf)
- [CVE Database for Envoy](https://www.cvedetails.com/product/53798/Envoyproxy-Envoy.html)