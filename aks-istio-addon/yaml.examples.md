# Istio Traffic Management Components - YAML Reference Guide

This comprehensive reference provides real-world YAML examples for all six core Istio components, specifically tailored for your agent team's deployment and testing activities.

## Components Overview

1. **Virtual Services** - Traffic routing rules and match conditions
2. **Destination Rules** - Traffic policies and service subsets
3. **Gateways** - Ingress/egress traffic management
4. **Service Entries** - External services registration
5. **Sidecars** - Proxy configuration and scope limitation
6. **Authorization Policies** - Access control and security

## 1. Virtual Services - Traffic Routing Rules and Match Conditions

Virtual services define traffic routing rules that are evaluated in order, allowing Istio to match each request to a specific destination within the mesh.

### Basic Host-Based Routing

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: multi-host-routing
  namespace: istio-system
spec:
  hosts:
    - app1.davidmarkgardiner.co.uk
    - app2.davidmarkgardiner.co.uk
  gateways:
    - main-gateway
  http:
    - match:
        - headers:
            host:
              exact: app1.davidmarkgardiner.co.uk
      route:
        - destination:
            host: web-app.tenant-a.svc.cluster.local
            subset: v1
    - match:
        - headers:
            host:
              exact: app2.davidmarkgardiner.co.uk
      route:
        - destination:
            host: web-app.tenant-b.svc.cluster.local
            subset: v1
```

### Canary Deployment with Traffic Splitting

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: canary-deployment
  namespace: tenant-a
spec:
  hosts:
    - web-app
  http:
    - route:
        - destination:
            host: web-app
            subset: v1
          weight: 90 # 90% to stable version
        - destination:
            host: web-app
            subset: v2
          weight: 10 # 10% to canary version
```

### Advanced Routing with Multiple Match Conditions

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: advanced-routing
spec:
  hosts:
    - reviews.prod.svc.cluster.local
  http:
    - match:
        - headers:
            end-user:
              exact: jason
      route:
        - destination:
            host: reviews.prod.svc.cluster.local
            subset: v2
    - match:
        - uri:
            prefix: /wpcatalog
        - uri:
            prefix: /consumercatalog
      rewrite:
        uri: /newcatalog
      route:
        - destination:
            host: reviews.prod.svc.cluster.local
            subset: v2
    - route:
        - destination:
            host: reviews.prod.svc.cluster.local
            subset: v1
```

### A/B Testing with Header-Based Routing

```yaml
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

### Fault Injection for Testing

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: fault-injection
spec:
  hosts:
    - ratings
  http:
    - fault:
        delay:
          percentage:
            value: 0.1
          fixedDelay: 5s
      route:
        - destination:
            host: ratings
            subset: v1
    - fault:
        abort:
          percentage:
            value: 0.1
          httpStatus: 400
      route:
        - destination:
            host: ratings
            subset: v1
```

### Timeout and Retry Configuration

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: timeout-retry
spec:
  hosts:
    - productpage.prod.svc.cluster.local
  http:
    - route:
        - destination:
            host: productpage.prod.svc.cluster.local
      timeout: 10s
      retries:
        attempts: 3
        perTryTimeout: 2s
```

## 2. Destination Rules - Traffic Policies and Service Subsets

Destination rules define policies that apply to traffic intended for a service after routing has occurred, specifying load balancing, connection pool settings, and outlier detection.

### Basic Load Balancing and Subsets

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: web-app-destination
  namespace: tenant-a
spec:
  host: web-app
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
      trafficPolicy:
        loadBalancer:
          simple: ROUND_ROBIN
    - name: v3
      labels:
        version: v3
      trafficPolicy:
        loadBalancer:
          simple: RANDOM
```

### Circuit Breaker Configuration

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: circuit-breaker
spec:
  host: reviews
  subsets:
    - name: v1
      labels:
        version: v1
      trafficPolicy:
        connectionPool:
          tcp:
            maxConnections: 100
          http:
            http1MaxPendingRequests: 1
            maxRequestsPerConnection: 1
        outlierDetection:
          consecutiveErrors: 1
          interval: 1s
          baseEjectionTime: 3m
          maxEjectionPercent: 100
```

### Advanced Connection Pool Settings

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: connection-pool-advanced
spec:
  host: myredissrv.prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
        connectTimeout: 30ms
        tcpKeepalive:
          time: 7200s
          interval: 75s
      http:
        http1MaxPendingRequests: 10
        maxRequestsPerConnection: 2
        maxRetries: 3
        consecutiveGatewayErrors: 5
        h2UpgradePolicy: UPGRADE
```

### Consistent Hash Load Balancing (Session Affinity)

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: session-affinity
spec:
  host: ratings.prod.svc.cluster.local
  trafficPolicy:
    loadBalancer:
      consistentHash:
        httpCookie:
          name: user
          ttl: 0s
```

### Port-Specific Traffic Policies

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: port-specific-policies
spec:
  host: ratings.prod.svc.cluster.local
  trafficPolicy:
    portLevelSettings:
      - port:
          number: 80
        loadBalancer:
          simple: LEAST_CONN
      - port:
          number: 9080
        loadBalancer:
          simple: ROUND_ROBIN
```

## 3. Gateways - Ingress/Egress Traffic Management

Gateways describe load balancer operating at the edge of the mesh, managing incoming or outgoing HTTP/TCP connections.

### HTTPS Ingress Gateway with TLS

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: main-gateway
  namespace: istio-system
  annotations:
    external-dns.alpha.kubernetes.io/hostname: "*.davidmarkgardiner.co.uk"
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
        credentialName: davidmarkgardiner-wildcard-cert # Cert-Manager managed
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

### Multi-Host Gateway with Different Certificates

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: multi-host-gateway
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: https-app1
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: app1-tls-cert
      hosts:
        - app1.davidmarkgardiner.co.uk
    - port:
        number: 443
        name: https-app2
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: app2-tls-cert
      hosts:
        - app2.davidmarkgardiner.co.uk
```

### Mutual TLS Gateway

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: mutual-tls-gateway
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: MUTUAL
        credentialName: server-credential
        caCertificates: /etc/certs/ca-cert.pem
      hosts:
        - secure.davidmarkgardiner.co.uk
```

### TCP Gateway for Non-HTTP Traffic

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: tcp-gateway
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 31400
        name: mongo
        protocol: MONGO
      hosts:
        - "*"
```

### TLS Passthrough Gateway

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: tls-passthrough
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: tls-passthrough
        protocol: TLS
      tls:
        mode: PASSTHROUGH
      hosts:
        - secure-app.davidmarkgardiner.co.uk
```

### Egress Gateway

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: istio-egressgateway
  namespace: istio-system
spec:
  selector:
    istio: egressgateway
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "*"
    - port:
        number: 443
        name: https
        protocol: HTTPS
      hosts:
        - "*"
```

## 4. Service Entries - External Services Registration

Service entries add external services to Istio's internal service registry, allowing mesh services to access external dependencies.

### External HTTPS Services

```yaml
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: external-https-services
spec:
  hosts:
    - api.github.com
    - www.googleapis.com
    - api.stripe.com
  location: MESH_EXTERNAL
  ports:
    - number: 443
      name: https
      protocol: TLS
  resolution: DNS
```

### External HTTP Service with Custom Endpoints

```yaml
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: external-http-service
spec:
  hosts:
    - external-api.example.com
  location: MESH_EXTERNAL
  ports:
    - number: 80
      name: http
      protocol: HTTP
  resolution: DNS
  endpoints:
    - address: us-west.external-api.example.com
      ports:
        http: 8080
    - address: us-east.external-api.example.com
      ports:
        http: 8080
```

### Database Service Entry (MongoDB)

```yaml
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: external-mongodb
spec:
  hosts:
    - mymongodb.somedomain
  addresses:
    - 192.168.1.100/32
  ports:
    - number: 27017
      name: mongodb
      protocol: MONGO
  location: MESH_INTERNAL
  resolution: STATIC
```

### Wildcard External Services

```yaml
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: wildcard-external
spec:
  hosts:
    - "*.amazonaws.com"
    - "*.azure.com"
  location: MESH_EXTERNAL
  ports:
    - number: 443
      name: https
      protocol: TLS
  resolution: NONE
```

### VM Workload Integration

```yaml
apiVersion: networking.istio.io/v1
kind: WorkloadEntry
metadata:
  name: vm-workload-1
spec:
  serviceAccount: vm-service-account
  address: 10.10.10.100
  labels:
    app: legacy-service
    version: v1
---
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: vm-service-integration
spec:
  hosts:
    - legacy-service.internal
  ports:
    - number: 8080
      name: http
      protocol: HTTP
  location: MESH_INTERNAL
  resolution: STATIC
  workloadSelector:
    labels:
      app: legacy-service
```

### External Service with VirtualService for Traffic Control

```yaml
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: external-payment-api
spec:
  hosts:
    - payment.external.com
  ports:
    - number: 443
      name: https
      protocol: HTTPS
  location: MESH_EXTERNAL
  resolution: DNS
---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: external-payment-timeout
spec:
  hosts:
    - payment.external.com
  http:
    - timeout: 10s
      retries:
        attempts: 3
        perTryTimeout: 3s
      route:
        - destination:
            host: payment.external.com
```

## 5. Sidecars - Proxy Configuration and Scope Limitation

Sidecar configurations control the reach of Envoy proxies and limit the set of services they configure, useful for namespace isolation and performance optimization.

### Global Default Namespace Isolation

```yaml
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: default
  namespace: istio-system # Root namespace
spec:
  egress:
    - hosts:
        - "./*" # Only services in same namespace
        - "istio-system/*" # Istio control plane
```

### Per-Namespace Isolation Override

```yaml
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: default
  namespace: tenant-a
spec:
  egress:
    - hosts:
        - "tenant-a/*" # Own namespace
        - "shared-services/*" # Common services
        - "istio-system/*" # Istio system
```

### Workload-Specific Sidecar Configuration

```yaml
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: database-client
  namespace: tenant-a
spec:
  workloadSelector:
    labels:
      app: web-app
      tier: frontend
  egress:
    - hosts:
        - "tenant-a/database.tenant-a.svc.cluster.local"
        - "shared-services/logging.shared-services.svc.cluster.local"
        - "istio-system/*"
```

### Custom Ingress Configuration

```yaml
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: custom-ingress
  namespace: tenant-a
spec:
  workloadSelector:
    labels:
      app: api-gateway
  ingress:
    - port:
        number: 8080
        protocol: HTTP
        name: http
      defaultEndpoint: 127.0.0.1:8080
  egress:
    - hosts:
        - "tenant-a/*"
        - "shared-services/auth.shared-services.svc.cluster.local"
```

### Performance Optimization Sidecar

```yaml
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: performance-optimized
  namespace: high-traffic
spec:
  workloadSelector:
    labels:
      performance-tier: high
  ingress:
    - port:
        number: 80
        protocol: HTTP
        name: http
      defaultEndpoint: unix:///var/run/app.sock
      connectionPool:
        tcp:
          maxConnections: 1000
        http:
          http1MaxPendingRequests: 100
  egress:
    - hosts:
        - "high-traffic/*"
        - "shared-services/cache.shared-services.svc.cluster.local"
```

### Unix Domain Socket Configuration

```yaml
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: unix-socket-config
  namespace: special-app
spec:
  workloadSelector:
    labels:
      app: special-service
  ingress:
    - port:
        number: 9080
        protocol: HTTP
        name: http
      defaultEndpoint: unix:///var/run/special.sock
  egress:
    - hosts:
        - "special-app/*"
```

## Multi-Tenancy Configuration Examples

### Tenant Isolation Pattern

```yaml
# Global default in istio-system
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: default
  namespace: istio-system
spec:
  egress:
    - hosts:
        - "./*"
        - "istio-system/*"
        - "kube-system/kube-dns.kube-system.svc.cluster.local"

---
# Tenant A with additional shared services access
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: default
  namespace: tenant-a
spec:
  egress:
    - hosts:
        - "tenant-a/*"
        - "shared-services/*"
        - "istio-system/*"

---
# Tenant B with restricted access
apiVersion: networking.istio.io/v1
kind: Sidecar
metadata:
  name: default
  namespace: tenant-b
spec:
  egress:
    - hosts:
        - "tenant-b/*"
        - "shared-services/logging.shared-services.svc.cluster.local"
        - "istio-system/*"
```

### Cross-Tenant Communication Gateway

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: cross-tenant-gateway
  namespace: shared-services
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
        credentialName: internal-gateway-cert
      hosts:
        - internal-api.shared-services.svc.cluster.local

---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: cross-tenant-routing
  namespace: shared-services
spec:
  hosts:
    - internal-api.shared-services.svc.cluster.local
  gateways:
    - cross-tenant-gateway
  http:
    - match:
        - headers:
            tenant:
              exact: tenant-a
      route:
        - destination:
            host: api-service.tenant-a.svc.cluster.local
    - match:
        - headers:
            tenant:
              exact: tenant-b
      route:
        - destination:
            host: api-service.tenant-b.svc.cluster.local
```

## Testing and Validation Examples

### Health Check VirtualService

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: health-check-routing
spec:
  hosts:
    - app1.davidmarkgardiner.co.uk
  gateways:
    - main-gateway
  http:
    - match:
        - uri:
            exact: /health
      route:
        - destination:
            host: web-app.tenant-a.svc.cluster.local
            port:
              number: 8080
    - match:
        - uri:
            exact: /ready
      route:
        - destination:
            host: web-app.tenant-a.svc.cluster.local
            port:
              number: 8080
```

### Load Testing Configuration

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: load-test-config
spec:
  host: web-app.tenant-a.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 500
      http:
        http1MaxPendingRequests: 100
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutiveErrors: 3
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```

## 6. Authorization Policies - Access Control and Security

Authorization Policies enable fine-grained access control on workloads in the mesh, supporting ALLOW, DENY, AUDIT, and CUSTOM actions.

### Multi-Tenant Namespace Isolation

```yaml
# Global deny-all policy in istio-system (applies to all namespaces)
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: global-deny-all
  namespace: istio-system
spec:
  action: DENY
  rules:
    - from:
        - source:
            notNamespaces: ["istio-system", "kube-system"]
      to:
        - operation:
            methods: ["*"]
---
# Allow policy for tenant-a namespace
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: tenant-a-allow
  namespace: tenant-a
spec:
  action: ALLOW
  rules:
    - from:
        - source:
            namespaces: ["tenant-a"]
        - source:
            serviceAccounts: ["monitoring/prometheus"]
    - from:
        - source:
            namespaces: ["shared-services"]
          to:
            - operation:
                methods: ["GET"]
                paths: ["/health", "/metrics"]
```

### JWT-Based Authentication

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: jwt-auth-policy
  namespace: tenant-a
spec:
  selector:
    matchLabels:
      app: secure-api
  action: ALLOW
  rules:
    - from:
        - source:
            requestPrincipals: ["https://accounts.google.com/*"]
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/api/v1/*"]
      when:
        - key: request.auth.claims[iss]
          values: ["https://accounts.google.com"]
        - key: request.auth.claims[aud]
          values: ["secure-api.davidmarkgardiner.co.uk"]
    - to:
        - operation:
            methods: ["GET"]
            paths: ["/health", "/ready"]
```

### Method and Path-Based Authorization

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: api-method-restrictions
  namespace: tenant-a
spec:
  selector:
    matchLabels:
      app: web-app
  action: ALLOW
  rules:
    - from:
        - source:
            namespaces: ["tenant-a"]
      to:
        - operation:
            methods: ["GET", "HEAD", "OPTIONS"]
    - from:
        - source:
            serviceAccounts: ["tenant-a/admin-service"]
      to:
        - operation:
            methods: ["POST", "PUT", "DELETE"]
            paths: ["/admin/*"]
    - to:
        - operation:
            methods: ["GET"]
            paths: ["/health", "/metrics"]
---
# Explicitly deny dangerous operations
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: deny-dangerous-ops
  namespace: tenant-a
spec:
  action: DENY
  rules:
    - to:
        - operation:
            methods: ["DELETE"]
            paths: ["/api/v1/users/*"]
    - from:
        - source:
            namespaces: ["dev", "test"]
      to:
        - operation:
            methods: ["POST", "PUT", "DELETE"]
```

### IP-Based Access Control

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: ip-based-access
  namespace: tenant-a
spec:
  selector:
    matchLabels:
      app: admin-panel
  action: ALLOW
  rules:
    - from:
        - source:
            ipBlocks: ["192.168.1.0/24", "10.0.0.0/8"] # Internal networks
      to:
        - operation:
            methods: ["GET", "POST"]
    - from:
        - source:
            remoteIpBlocks: ["203.0.113.0/24"] # Specific external network
      to:
        - operation:
            methods: ["GET"]
            paths: ["/dashboard"]
      when:
        - key: request.headers[x-forwarded-proto]
          values: ["https"]
```

### Gateway-Specific Authorization

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: gateway-authorization
  namespace: istio-system
spec:
  selector:
    matchLabels:
      istio: ingressgateway
  action: ALLOW
  rules:
    - from:
        - source:
            remoteIpBlocks: ["0.0.0.0/0"] # Allow all external IPs
      to:
        - operation:
            hosts: ["app1.davidmarkgardiner.co.uk"]
            methods: ["GET", "POST"]
            paths: ["/", "/api/public/*"]
    - from:
        - source:
            remoteIpBlocks: ["192.168.0.0/16", "10.0.0.0/8"] # Internal only
      to:
        - operation:
            hosts: ["admin.davidmarkgardiner.co.uk"]
            methods: ["GET", "POST", "PUT", "DELETE"]
            paths: ["/admin/*"]
```

### Audit Policy for Compliance

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: audit-sensitive-operations
  namespace: tenant-a
spec:
  selector:
    matchLabels:
      app: user-management
  action: AUDIT
  rules:
    - to:
        - operation:
            methods: ["POST", "PUT", "DELETE"]
            paths: ["/api/users/*", "/api/permissions/*"]
    - to:
        - operation:
            methods: ["GET"]
            paths: ["/api/users/*/profile", "/api/sensitive-data/*"]
---
# Allow the operations but audit them
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: allow-audited-operations
  namespace: tenant-a
spec:
  selector:
    matchLabels:
      app: user-management
  action: ALLOW
  rules:
    - from:
        - source:
            serviceAccounts: ["tenant-a/user-service"]
      to:
        - operation:
            methods: ["POST", "PUT", "DELETE"]
            paths: ["/api/users/*"]
```

### Custom Authorization Provider

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: custom-authz-policy
  namespace: tenant-a
spec:
  selector:
    matchLabels:
      app: payment-service
  action: CUSTOM
  provider:
    name: "payment-authorization-service"
  rules:
    - to:
        - operation:
            paths: ["/payment/*", "/billing/*"]
    - from:
        - source:
            namespaces: ["tenant-a"]
      when:
        - key: request.headers[x-payment-tier]
          values: ["premium", "enterprise"]
```

### Dry-Run Testing Policy

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: dry-run-test
  namespace: tenant-a
  annotations:
    istio.io/dry-run: "true"
spec:
  selector:
    matchLabels:
      app: web-app
  action: DENY
  rules:
    - from:
        - source:
            namespaces: ["untrusted"]
    - to:
        - operation:
            methods: ["DELETE"]
            paths: ["/api/critical/*"]
```

### Time-Based Access Control

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: business-hours-access
  namespace: tenant-a
spec:
  selector:
    matchLabels:
      app: business-app
  action: ALLOW
  rules:
    - from:
        - source:
            namespaces: ["tenant-a"]
      when:
        - key: request.time.hour
          values: ["9", "10", "11", "12", "13", "14", "15", "16", "17"]
    - from:
        - source:
            serviceAccounts: ["tenant-a/emergency-service"]
    - to:
        - operation:
            methods: ["GET"]
            paths: ["/health", "/status"]
```

### Multi-Cluster Authorization (for future AKS multi-cluster)

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: cross-cluster-access
  namespace: tenant-a
spec:
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/tenant-a/sa/cross-cluster-service"
              - "cluster-west.local/ns/tenant-a/sa/west-service"
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/api/shared/*"]
    - from:
        - source:
            namespaces: ["tenant-a"]
```

### Testing Authorization Policies

```yaml
# Test client for authorization validation
apiVersion: apps/v1
kind: Deployment
metadata:
  name: authz-test-client
  namespace: tenant-a
spec:
  replicas: 1
  selector:
    matchLabels:
      app: authz-test-client
  template:
    metadata:
      labels:
        app: authz-test-client
    spec:
      serviceAccountName: test-client
      containers:
        - name: curl
          image: curlimages/curl
          command: ["sleep", "3600"]
          resources:
            requests:
              memory: "64Mi"
              cpu: "100m"
            limits:
              memory: "128Mi"
              cpu: "200m"
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: test-client
  namespace: tenant-a
```
