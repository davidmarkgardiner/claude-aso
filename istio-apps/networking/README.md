# Istio Networking Configuration

This directory contains comprehensive Istio networking configurations for managing traffic flow, routing, load balancing, and multi-tenant isolation in the service mesh.

## Overview

The networking layer implements a complete traffic management solution with:

- **Multi-tenant isolation** using Sidecars
- **Ingress/egress control** via Gateways
- **Advanced routing** through VirtualServices
- **Load balancing and resilience** with DestinationRules
- **External connectivity** using ServiceEntries

## Components

### 1. Gateways (`gateways.yaml`)

Defines entry points for traffic into the service mesh.

#### Main Gateway (Production)

- **Port 443**: HTTPS with cert-manager TLS certificates
- **Port 80**: HTTP with automatic redirect to HTTPS
- **Hosts**:
  - `podinfo.tenant-a.davidmarkgardiner.co.uk`
  - `podinfo.tenant-b.davidmarkgardiner.co.uk`
  - `monitoring.shared-services.davidmarkgardiner.co.uk`
  - `*.istio-testing.davidmarkgardiner.co.uk`
- **TLS Mode**: SIMPLE (terminates TLS at gateway)
- **Certificate**: Managed by cert-manager (`davidmarkgardiner-tls-cert`)

#### Mesh Gateway (East-West)

- **Port 15443**: mTLS for cross-cluster communication
- **TLS Mode**: ISTIO_MUTUAL (automatic mTLS)
- **Purpose**: Service mesh internal communication

#### Development Gateway

- **Port 8080**: HTTP only for testing
- **Hosts**: Local development domains (`.local`)
- **Environment**: Development/testing only

### 2. VirtualServices (`virtual-services.yaml`)

Controls routing rules and traffic management policies.

#### Tenant A (Production)

- **Traffic Distribution**:
  - Canary: Headers with `canary: true` → v2
  - A/B Testing: Mobile users → 50/50 split
  - Default: 90% v1, 10% v2
- **Resilience**:
  - Timeout: 30s
  - Retries: 3 attempts
  - Retry conditions: 5xx, gateway errors, connection failures
- **Fault Injection**: 0.1% requests get 100ms delay

#### Tenant B (Development)

- **Blue-Green Deployment**:
  - Header `version: v1` → v1
  - Default → v2
- **Timeout**: 15s (shorter for development)

#### Shared Services

- **Path-based Routing**:
  - `/prometheus` → Prometheus (port 9090)
  - `/grafana` → Grafana (port 3000)
  - `/jaeger` → Jaeger UI (port 16686)

#### Testing Services

- **Chaos Engineering**:
  - `/chaos` endpoint with fault injection:
    - 5% abort with HTTP 500
    - 10% delay of 2 seconds
  - `/load` endpoint for load testing

### 3. DestinationRules (`destination-rules.yaml`)

Configures load balancing, connection pools, and circuit breakers.

#### Tenant A (Production)

- **Load Balancing**: LEAST_REQUEST
- **Connection Pool**:
  - Max connections: 100 TCP
  - Max HTTP/2 requests: 100
  - Max retries: 3
- **Circuit Breaker**:
  - Eject after 5 consecutive 5xx errors
  - Base ejection time: 30s
  - Max ejection: 50% of instances
- **Subsets**:
  - v1: Reduced connections (50)
  - v2: Round-robin with limited connections (20)

#### Tenant B (Development)

- **Load Balancing**: RANDOM
- **Connection Pool**: Higher limits (200 connections)
- **Circuit Breaker**: Relaxed (10 errors before ejection)
- **Timeout**: 60s connect timeout

#### Shared Services

- **Load Balancing**: LEAST_CONN
- **Connection Pool**: Conservative (50 connections)
- **Circuit Breaker**: Strict (2-3 errors trigger ejection)
- **Prometheus Specific**: Single connection per request

#### External Services

- **TLS Origination**: Upgrades HTTP to HTTPS
- **SNI Configuration**: For external APIs
- **Connection Limits**: Restricted for external calls

### 4. ServiceEntries (`service-entries.yaml`)

Defines external services accessible from the mesh.

#### Categories of External Services

##### Development/Testing

- **HTTPBin**: API testing and validation
- **JSONPlaceholder**: Mock REST API
- **GitHub API**: CI/CD integrations

##### Container Registries

- **Docker Hub**: Multiple endpoints for image pulls
- **Production CDN**: CloudFlare Docker endpoints

##### Cloud Services

- **Azure Monitor**: Logging and metrics
  - ODS endpoints
  - OMS endpoints
  - Monitoring endpoints
- **Let's Encrypt**: Certificate management
  - Production ACME
  - Staging ACME

##### Infrastructure

- **DNS Services**:
  - Google DNS (port 53, 853, 443)
  - Cloudflare DNS
- **Time Synchronization**:
  - NTP Pool (port 123 UDP)
  - NIST time servers

##### Telemetry

- **Istio Telemetry**: Usage metrics
- **Google Analytics**: Optional analytics

### 5. Sidecars (`sidecars.yaml`)

Implements namespace isolation and egress control.

#### Tenant A (Strict Production)

- **Ingress Ports**: 9898 (HTTP), 9999 (gRPC)
- **Egress Policy**: REGISTRY_ONLY
- **Allowed Destinations**:
  - Same namespace (`./\*`)
  - Istio control plane
  - Specific shared services (Prometheus, Grafana, Jaeger)
  - Whitelisted external services
  - Azure monitoring endpoints

#### Tenant B (Relaxed Development)

- **Egress Policy**: REGISTRY_ONLY
- **Allowed Destinations**:
  - Same namespace
  - All shared services (`shared-services/*`)
  - Testing namespace
  - Limited cross-tenant (Tenant A podinfo)
  - All external services

#### Shared Services (Infrastructure)

- **Ingress Ports**: Service-specific (9090, 3000, 16686)
- **Egress Policy**: REGISTRY_ONLY
- **Allowed Destinations**:
  - All tenant namespaces (for monitoring)
  - Azure monitoring services
  - Istio telemetry

#### Testing Namespace

- **Egress Policy**: ALLOW_ANY
- **Purpose**: Unrestricted for chaos testing
- **Access**: All namespaces

#### Default Sidecar

- **Applied to**: Unspecified workloads
- **Egress Policy**: REGISTRY_ONLY
- **Minimal Access**: Control plane and kube-system

## Traffic Flow Patterns

### Ingress Flow

```
Internet → Gateway → VirtualService → DestinationRule → Pod (with Sidecar)
```

### Egress Flow

```
Pod → Sidecar → ServiceEntry → DestinationRule → External Service
```

### Cross-Namespace Flow

```
Pod A → Sidecar A → Sidecar B → Pod B
         ↓
    (Policy Check)
```

## Security Features

### Multi-Tenant Isolation

- **Sidecar configurations** restrict cross-namespace communication
- **REGISTRY_ONLY mode** blocks unregistered services
- **Namespace-scoped rules** prevent lateral movement

### TLS Configuration

- **Gateway TLS termination** with cert-manager certificates
- **Automatic mTLS** between services
- **TLS origination** for external HTTPS services

### Traffic Policies

- **Circuit breakers** prevent cascade failures
- **Outlier detection** removes unhealthy instances
- **Connection limits** prevent resource exhaustion

## Load Balancing Strategies

| Service Type   | Strategy      | Rationale                         |
| -------------- | ------------- | --------------------------------- |
| Production     | LEAST_REQUEST | Optimal for varying request costs |
| Development    | RANDOM        | Simple, good for testing          |
| Infrastructure | LEAST_CONN    | Best for long-lived connections   |
| External       | PASSTHROUGH   | Preserve client decisions         |

## Monitoring and Observability

### Key Metrics

- **Gateway metrics**: Request rate, error rate, P95 latency
- **Circuit breaker triggers**: Ejection events
- **Retry attempts**: Success/failure rates
- **Connection pool**: Active connections, pending requests

### Debug Commands

```bash
# Check gateway configuration
istioctl proxy-config listeners deployment/aks-istio-ingressgateway-internal -n aks-istio-system

# Verify VirtualService routes
istioctl proxy-config routes deployment/podinfo-v1 -n tenant-a

# Check DestinationRule subsets
istioctl proxy-config cluster deployment/podinfo-v1 -n tenant-a

# Validate Sidecar configuration
istioctl proxy-config listeners deployment/podinfo-v1 -n tenant-a

# Test ServiceEntry resolution
kubectl exec -n tenant-a deployment/podinfo-v1 -c istio-proxy -- curl -I https://httpbin.org
```

## Common Issues and Solutions

### Issue: 503 Service Unavailable

**Causes**:

- Circuit breaker triggered
- No healthy upstream
- Sidecar misconfiguration

**Solution**:

```bash
# Check outlier detection status
istioctl proxy-config cluster deployment/podinfo-v1 -n tenant-a --fqdn podinfo.tenant-a.svc.cluster.local

# Reset circuit breaker
kubectl rollout restart deployment/podinfo-v1 -n tenant-a
```

### Issue: External Service Blocked

**Causes**:

- Missing ServiceEntry
- Sidecar egress restrictions
- REGISTRY_ONLY policy

**Solution**:

1. Add ServiceEntry for the external service
2. Update Sidecar egress configuration
3. Or switch to ALLOW_ANY mode (not recommended for production)

### Issue: Cross-Tenant Communication Blocked

**Causes**:

- Sidecar isolation policies
- Missing egress rules

**Solution**:

1. Update source namespace Sidecar to allow destination
2. Ensure destination service is in registry
3. Verify AuthorizationPolicies allow the traffic

## Best Practices

### Production

1. Always use REGISTRY_ONLY mode
2. Implement circuit breakers
3. Set conservative connection limits
4. Use specific Sidecar configurations
5. Enable outlier detection

### Development

1. Can use relaxed policies
2. Higher connection limits acceptable
3. Enable debug headers
4. Allow cross-namespace for testing

### External Services

1. Always define ServiceEntries
2. Use TLS origination when possible
3. Implement rate limiting
4. Monitor external call patterns
5. Cache responses when appropriate

## Testing Configurations

### Canary Testing

```bash
# Send traffic to canary
curl -H "canary: true" https://podinfo.tenant-a.davidmarkgardiner.co.uk
```

### A/B Testing

```bash
# Mobile user agent
curl -H "User-Agent: Mobile Safari" https://podinfo.tenant-a.davidmarkgardiner.co.uk
```

### Fault Injection Testing

```bash
# Trigger chaos endpoints
curl https://chaos.istio-testing.davidmarkgardiner.co.uk/chaos
```

## Future Enhancements

- [ ] Implement request authentication with JWT
- [ ] Add rate limiting at gateway level
- [ ] Configure distributed tracing sampling
- [ ] Implement shadow traffic for testing
- [ ] Add WebAssembly filters for custom logic
- [ ] Configure locality-aware load balancing
- [ ] Implement progressive delivery with Flagger
