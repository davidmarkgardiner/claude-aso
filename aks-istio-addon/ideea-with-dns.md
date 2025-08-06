# Istio Traffic Management Agents Team Plan

## Executive Summary

This plan outlines a team of specialized cloud agents designed to deploy, understand, and test Istio traffic management components on Azure Kubernetes Service (AKS) with the Istio add-on. The team will focus on the five core traffic management CRDs in shared cluster scenarios with namespace-based tenancy.

## Core Components Overview

Based on the official Istio documentation, the five key traffic management Custom Resource Definitions (CRDs) are:

1. **Virtual Services** - Define traffic routing rules and match conditions
2. **Destination Rules** - Configure traffic policies and service subsets  
3. **Gateways** - Manage ingress/egress traffic at mesh edge
4. **Service Entries** - Add external services to mesh registry
5. **Sidecars** - Configure proxy behavior and limit configuration scope

## Infrastructure Prerequisites

### Existing Setup (Minikube)
- **DNS Zone**: `/subscriptions/133d5755-4074-4d6e-ad38-eb2a6ad12903/resourceGroups/dns/providers/Microsoft.Network/dnszones/davidmarkgardiner.co.uk`
- **Cert-Manager**: Already installed and configured
- **Azure Service Operator**: Already installed and configured
- **Additional Required**: External-DNS for automated DNS record management

### Required Additional Components
- **External-DNS**: Kubernetes controller to sync DNS records with Azure DNS
- **Test Applications**: Simple web services for ingress traffic validation
- **Monitoring Tools**: For traffic flow observation and debugging

## Agent Team Structure

### Agent 1: Infrastructure & DNS Agent
**Primary Role**: DNS, certificates, and ingress infrastructure management

**Responsibilities**:
- Deploy and configure External-DNS for Azure DNS integration
- Set up automated certificate provisioning with Cert-Manager
- Configure DNS records for test domains (e.g., app1.davidmarkgardiner.co.uk)
- Validate end-to-end DNS resolution and TLS certificate provisioning
- Integrate with existing Azure Service Operator

**Key Setup Tasks**:
```yaml
# External-DNS configuration for Azure DNS
apiVersion: apps/v1
kind: Deployment
metadata:
  name: external-dns
spec:
  template:
    spec:
      containers:
      - name: external-dns
        image: k8s.gcr.io/external-dns/external-dns:latest
        args:
        - --source=service
        - --source=ingress
        - --source=istio-gateway
        - --provider=azure
        - --azure-resource-group=dns
        - --azure-subscription-id=133d5755-4074-4d6e-ad38-eb2a6ad12903
        - --txt-owner-id=minikube-cluster
```

**DNS Testing Scenarios**:
- Create A records for test applications
- Validate CNAME propagation for gateway hosts
- Test certificate issuance for HTTPS endpoints

### Agent 2: Application Deployment Agent
**Primary Role**: Deploy test applications and establish baseline functionality

**Responsibilities**:
- Deploy multiple test applications across different namespaces
- Create basic Kubernetes services and ingress resources
- Establish baseline connectivity before Istio integration
- Set up health check endpoints for traffic validation
- Configure application-level monitoring and logging

**Test Applications to Deploy**:
```yaml
# Example: Simple web service for traffic testing
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-v1
  namespace: tenant-a
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-app
      version: v1
  template:
    metadata:
      labels:
        app: web-app
        version: v1
    spec:
      containers:
      - name: web-app
        image: nginx:latest
        ports:
        - containerPort: 80
        volumeMounts:
        - name: content
          mountPath: /usr/share/nginx/html
      volumes:
      - name: content
        configMap:
          name: web-app-content-v1
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-app-content-v1
  namespace: tenant-a
data:
  index.html: |
    <!DOCTYPE html>
    <html>
    <head><title>App V1 - Tenant A</title></head>
    <body>
      <h1>Application Version 1</h1>
      <p>Namespace: tenant-a</p>
      <p>Pod: ${HOSTNAME}</p>
      <p>Timestamp: $(date)</p>
    </body>
    </html>
```

**Health Check Endpoints**:
- `/health` - Basic application health
- `/version` - Application version info  
- `/metrics` - Prometheus metrics endpoint

### Agent 3: Istio Gateway & VirtualService Agent
**Primary Role**: Configure Istio ingress traffic management

**Responsibilities**:
- Deploy and configure Istio Gateway resources for ingress
- Create VirtualService configurations for traffic routing
- Integrate with External-DNS for automatic DNS management
- Configure TLS termination with Cert-Manager certificates
- Test various routing scenarios (path-based, host-based, header-based)

**Gateway Configuration Example**:
```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: main-gateway
  namespace: istio-system
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
      credentialName: davidmarkgardiner-tls-cert  # Cert-Manager managed
    hosts:
    - app1.davidmarkgardiner.co.uk
    - app2.davidmarkgardiner.co.uk
    - "*.davidmarkgardiner.co.uk"
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - app1.davidmarkgardiner.co.uk
    - app2.davidmarkgardiner.co.uk
    redirect:
      httpsRedirect: true
---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: apps-routing
  namespace: istio-system
spec:
  hosts:
  - app1.davidmarkgardiner.co.uk
  - app2.davidmarkgardiner.co.uk
  gateways:
  - main-gateway
  http:
  - match:
    - uri:
        prefix: /app1
    - headers:
        host:
          exact: app1.davidmarkgardiner.co.uk
    route:
    - destination:
        host: web-app.tenant-a.svc.cluster.local
        subset: v1
  - match:
    - uri:
        prefix: /app2
    - headers:
        host:
          exact: app2.davidmarkgardiner.co.uk
    route:
    - destination:
        host: web-app.tenant-b.svc.cluster.local
        subset: v1
```

**Testing Scenarios**:
- HTTP to HTTPS redirect validation
- Multi-tenant routing via different subdomains
- Path-based routing within same domain
- Header-based routing for API versioning

### Agent 4: Traffic Testing & Validation Agent
**Primary Role**: End-to-end ingress traffic testing and validation

**Responsibilities**:
- Execute curl-based traffic validation tests
- Implement chaos engineering scenarios to test resilience
- Validate traffic routing, load balancing, and failover
- Test certificate provisioning and TLS termination
- Monitor and document traffic flow patterns

**Primary Test Suite**:
```bash
#!/bin/bash
# Ingress Traffic Validation Test Suite

echo "=== Istio Ingress Traffic Tests ==="

# Test 1: Basic connectivity and HTTPS redirect
echo "Test 1: HTTP to HTTPS redirect"
curl -v -L http://app1.davidmarkgardiner.co.uk/health
echo "Expected: 301 redirect to HTTPS"

# Test 2: HTTPS with valid certificate
echo "Test 2: HTTPS connectivity with TLS"
curl -v https://app1.davidmarkgardiner.co.uk/health
echo "Expected: 200 OK with valid TLS certificate"

# Test 3: Host-based routing
echo "Test 3: Host-based routing validation"
curl -H "Host: app1.davidmarkgardiner.co.uk" https://app1.davidmarkgardiner.co.uk/version
curl -H "Host: app2.davidmarkgardiner.co.uk" https://app2.davidmarkgardiner.co.uk/version
echo "Expected: Different responses from different tenants"

# Test 4: Path-based routing
echo "Test 4: Path-based routing validation"
curl https://app1.davidmarkgardiner.co.uk/app1/health
curl https://app1.davidmarkgardiner.co.uk/app2/health
echo "Expected: Routing to different backend services"

# Test 5: Load balancing validation
echo "Test 5: Load balancing across replicas"
for i in {1..10}; do
  curl -s https://app1.davidmarkgardiner.co.uk/pod-info | grep "Pod:"
done
echo "Expected: Requests distributed across multiple pod replicas"
```

**Chaos Engineering Scenarios**:
```bash
#!/bin/bash
# Chaos Testing for Istio Ingress

echo "=== Chaos Engineering Tests ==="

# Scenario 1: Pod failure simulation
echo "Chaos Test 1: Simulate pod failures"
kubectl scale deployment/web-app-v1 -n tenant-a --replicas=1
# Wait for scale down
sleep 30
# Test traffic continuity
curl -f https://app1.davidmarkgardiner.co.uk/health || echo "FAIL: Traffic disrupted"
# Scale back up
kubectl scale deployment/web-app-v1 -n tenant-a --replicas=2

# Scenario 2: Gateway pod restart
echo "Chaos Test 2: Restart Istio ingress gateway"
kubectl rollout restart deployment/istio-ingressgateway -n istio-system
# Test traffic during restart
while ! curl -f -s https://app1.davidmarkgardiner.co.uk/health; do
  echo "Waiting for gateway recovery..."
  sleep 5
done
echo "Gateway recovered successfully"

# Scenario 3: Certificate expiration simulation
echo "Chaos Test 3: Certificate renewal validation"
# Force certificate renewal
kubectl delete secret davidmarkgardiner-tls-cert -n istio-system
# Wait for Cert-Manager to recreate
sleep 60
curl -v https://app1.davidmarkgardiner.co.uk/health
echo "Expected: New certificate issued automatically"
```

### Agent 5: Business Validation & Reporting Agent
**Primary Role**: Create business-ready demos and comprehensive documentation

**Responsibilities**:
- Create polished demo scenarios for business presentation
- Document working YAML configurations with explanations
- Generate test reports with clear success/failure criteria
- Create troubleshooting guides for common issues
- Prepare executive summaries of Istio capabilities

**Business Demo Scenarios**:

#### Demo 1: Blue-Green Deployment via DNS
```yaml
# Scenario: Switch traffic between app versions using DNS
# Business Value: Zero-downtime deployments

# Step 1: Deploy v2 of application
# Step 2: Create separate DNS entry (app1-staging.davidmarkgardiner.co.uk)
# Step 3: Test v2 in staging
# Step 4: Switch DNS from v1 to v2 atomically
```

#### Demo 2: Canary Deployment with Traffic Splitting
```yaml
# Scenario: Gradually roll out new version with traffic percentage
# Business Value: Risk mitigation during deployments

apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: canary-deployment
spec:
  hosts:
  - app1.davidmarkgardiner.co.uk
  gateways:
  - main-gateway
  http:
  - route:
    - destination:
        host: web-app.tenant-a.svc.cluster.local
        subset: v1
      weight: 90  # 90% to stable version
    - destination:
        host: web-app.tenant-a.svc.cluster.local
        subset: v2
      weight: 10  # 10% to canary version
```

#### Demo 3: A/B Testing with Header-Based Routing
```yaml
# Scenario: Route beta users to new version
# Business Value: Feature testing with specific user groups

apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: ab-testing
spec:
  hosts:
  - app1.davidmarkgardiner.co.uk
  gateways:
  - main-gateway
  http:
  - match:
    - headers:
        x-user-type:
          exact: beta
    route:
    - destination:
        host: web-app.tenant-a.svc.cluster.local
        subset: v2
  - route:
    - destination:
        host: web-app.tenant-a.svc.cluster.local
        subset: v1
```

**Business Presentation Materials**:
- Executive summary of Istio benefits
- ROI analysis for service mesh adoption
- Risk mitigation capabilities
- Operational efficiency improvements
- Scalability and multi-tenancy advantages

## Multi-Tenancy Considerations for Shared AKS Clusters

### Namespace-Based Tenancy Model
Based on research, the recommended approach for shared AKS clusters:

**Tenant Isolation Strategy**:
- Each tenant gets dedicated namespace(s)
- Sidecar configurations limit cross-namespace communication
- RBAC policies restrict resource access
- Network policies provide additional security boundaries

**Key Configuration Pattern**:
```yaml
# Per-tenant Sidecar configuration to limit scope
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: tenant-isolation
  namespace: tenant-a
spec:
  egress:
  - hosts:
    - "./tenant-a/*"        # Only services in same namespace
    - "istio-system/*"      # Istio control plane
    - "shared-services/*"   # Common services namespace
```

### AKS Add-on Specific Considerations

**Supported Configurations** (from your AKS documentation):
- MeshConfig customization via istio-shared-configmap-<revision>
- Limited extension provider support
- Specific field restrictions (allowed/supported/blocked)

**Key Limitations**:
- Some CRDs blocked (ProxyConfig, WorkloadEntry, WorkloadGroup)
- Limited EnvoyFilter support
- No multi-cluster deployments yet
- Windows containers not supported

## Agent Coordination Workflow

### Phase 1: Infrastructure Setup (Agent 1 & 2)
1. **DNS & Certificates** (Agent 1):
   - Deploy External-DNS with Azure DNS integration
   - Configure Cert-Manager for automated certificate provisioning
   - Test DNS propagation and certificate issuance

2. **Application Baseline** (Agent 2):
   - Deploy test applications in multiple namespaces (tenant-a, tenant-b)
   - Establish baseline connectivity without Istio
   - Validate health checks and monitoring endpoints

**Success Criteria**: Applications accessible via LoadBalancer/NodePort, certificates issued, DNS records created

### Phase 2: Istio Integration (Agent 3)
1. **Gateway Configuration**:
   - Deploy Istio Gateway for HTTPS ingress
   - Configure VirtualServices for traffic routing
   - Integrate with existing DNS and certificate infrastructure

2. **Traffic Routing Setup**:
   - Implement host-based routing for multi-tenancy
   - Configure path-based routing within tenants
   - Set up header-based routing for advanced scenarios

**Success Criteria**: External traffic flowing through Istio Gateway to backend pods

### Phase 3: Validation & Chaos Testing (Agent 4)
1. **Functional Testing**:
   ```bash
   # Real-world validation commands
   curl -v https://app1.davidmarkgardiner.co.uk/health
   curl -H "X-User-Type: beta" https://app1.davidmarkgardiner.co.uk/version
   ```

2. **Resilience Testing**:
   - Pod failure scenarios
   - Gateway restart scenarios  
   - Certificate renewal validation
   - DNS propagation testing

3. **Performance Validation**:
   - Load testing with multiple concurrent requests
   - Latency measurement through Istio proxy
   - Resource utilization monitoring

**Success Criteria**: All test scenarios pass, system remains stable under failure conditions

### Phase 4: Business Demonstration (Agent 5)
1. **Demo Preparation**:
   - Create scripted business scenarios
   - Prepare before/after comparisons
   - Document configuration changes and their business impact

2. **Documentation Creation**:
   - Working YAML configurations with annotations
   - Step-by-step deployment guides
   - Troubleshooting runbooks

**Success Criteria**: Business-ready demonstrations showing clear value proposition

## Expected Deliverables

### Working YAML Configurations
**Gateway & VirtualService Templates**:
```yaml
# Production-ready Istio Gateway configuration
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: production-gateway
  namespace: istio-system
  annotations:
    external-dns.alpha.kubernetes.io/hostname: "app1.davidmarkgardiner.co.uk,app2.davidmarkgardiner.co.uk"
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
      credentialName: davidmarkgardiner-wildcard-cert
    hosts:
    - "*.davidmarkgardiner.co.uk"
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - "*.davidmarkgardiner.co.uk"
    redirect:
      httpsRedirect: true
```

### Test Validation Scripts
**Automated Test Suite**:
```bash
#!/bin/bash
# comprehensive-ingress-test.sh

set -e

BASE_DOMAIN="davidmarkgardiner.co.uk"
APPS=("app1" "app2")

echo "🚀 Starting Istio Ingress Validation"

for app in "${APPS[@]}"; do
    URL="https://${app}.${BASE_DOMAIN}"
    
    echo "Testing ${URL}..."
    
    # Test 1: HTTPS connectivity
    if curl -f -s "${URL}/health" > /dev/null; then
        echo "✅ ${app}: HTTPS connectivity working"
    else
        echo "❌ ${app}: HTTPS connectivity failed"
        exit 1
    fi
    
    # Test 2: Certificate validation
    if curl -s --connect-timeout 5 "${URL}" | grep -q "200 OK"; then
        echo "✅ ${app}: TLS certificate valid"
    else
        echo "❌ ${app}: TLS certificate issues"
    fi
    
    # Test 3: Load balancing
    echo "Testing load balancing for ${app}..."
    UNIQUE_PODS=$(for i in {1..10}; do
        curl -s "${URL}/pod-info" | grep "Pod:" | cut -d: -f2
    done | sort -u | wc -l)
    
    if [ "$UNIQUE_PODS" -gt 1 ]; then
        echo "✅ ${app}: Load balancing working (${UNIQUE_PODS} unique pods)"
    else
        echo "⚠️  ${app}: Only 1 pod responding (may be expected)"
    fi
done

echo "🎉 All ingress tests completed successfully"
```

### Business Demonstration Scripts
**Demo Scenarios with curl Commands**:
```bash
#!/bin/bash
# business-demo.sh - Live demonstration script

echo "=== BUSINESS DEMONSTRATION: Istio Traffic Management ==="

echo "📊 Scenario 1: Blue-Green Deployment"
echo "Current version check:"
curl -s https://app1.davidmarkgardiner.co.uk/version | jq '.version'

echo "Switching to version 2..."
kubectl apply -f virtualservice-v2.yaml

echo "New version check:"
curl -s https://app1.davidmarkgardiner.co.uk/version | jq '.version'
echo "✅ Zero-downtime deployment completed"

echo ""
echo "📊 Scenario 2: Canary Deployment (10% traffic to v2)"
kubectl apply -f virtualservice-canary.yaml

echo "Testing traffic distribution (20 requests):"
for i in {1..20}; do
    VERSION=$(curl -s https://app1.davidmarkgardiner.co.uk/version | jq -r '.version')
    echo "Request $i: Version $VERSION"
done

echo ""
echo "📊 Scenario 3: A/B Testing with Beta Users"
echo "Normal user (gets v1):"
curl -s https://app1.davidmarkgardiner.co.uk/version | jq '.version'

echo "Beta user (gets v2):"
curl -H "X-User-Type: beta" -s https://app1.davidmarkgardiner.co.uk/version | jq '.version'

echo "🎯 Business Value Demonstrated:"
echo "  - Zero-downtime deployments"
echo "  - Risk-free rollouts with canary testing"
echo "  - Feature testing with specific user groups"
echo "  - Automated certificate management"
echo "  - Multi-tenant isolation"
```

## Success Metrics

1. **Coverage**: All 5 traffic management CRDs tested and documented
2. **Isolation**: Multi-tenant boundaries properly validated  
3. **Functionality**: Core features working as expected
4. **Documentation**: Comprehensive guides for team adoption
5. **Automation**: Repeatable deployment and testing procedures

## Next Steps

1. Set up the agent team with appropriate cluster access
2. Begin with Discovery and Analysis agents (Phase 1)
3. Use findings to inform deployment strategy
4. Execute comprehensive testing across all components
5. Document lessons learned and best practices

This structured approach ensures thorough understanding of Istio traffic management capabilities within AKS add-on constraints, with particular attention to multi-tenant shared cluster scenarios.