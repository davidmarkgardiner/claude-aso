# Envoy Proxy Configurations

This directory contains comprehensive Envoy proxy configurations through Istio's EnvoyFilter CRDs, demonstrating advanced Envoy features including rate limiting, security filters, observability, and WASM extensions.

## 🏗️ Envoy Architecture Overview

```
Envoy Proxy Features Deployed:
├── Rate Limiting (rate-limiting.yaml)
│   ├── Local Rate Limiting (per-pod)
│   ├── Global Rate Limiting (ingress gateway)
│   ├── Adaptive Rate Limiting (circuit breaker integration)
│   ├── Header-based Rate Limiting
│   └── JWT-based Rate Limiting
├── Admin & Debugging (admin-debug.yaml)
│   ├── Admin Interface Configuration
│   ├── Enhanced Logging (JSON & text formats)
│   ├── Development Debug Mode
│   ├── Cluster Discovery Debug
│   ├── Fault Injection Debug
│   └── Performance Profiling
├── Security Filters (security-filters.yaml)
│   ├── Web Application Firewall (RBAC)
│   ├── JWT Authentication
│   ├── IP Allow/Deny Lists
│   ├── Request Header Security (Lua script)
│   ├── CORS Security
│   └── DDoS Protection
├── Observability (observability.yaml)
│   ├── Enhanced Metrics Collection
│   ├── OpenTelemetry Tracing
│   ├── Custom Business Metrics
│   ├── Health Check Metrics
│   ├── Circuit Breaker Metrics
│   └── External Service Metrics
└── WASM Extensions (wasm-extensions.yaml)
    ├── Custom Request Processing
    ├── Business Logic Processing
    ├── Security Validation
    └── Performance Monitoring
```

## 🔧 Rate Limiting Features

### Local Rate Limiting
- **Per-pod limits**: 100 requests per minute baseline
- **Burst capacity**: Configurable token bucket
- **Response headers**: Rate limit status indicators
- **Runtime control**: Enable/disable via runtime keys

### Global Rate Limiting  
- **Ingress gateway**: Shared rate limits across pods
- **External service**: Integration with rate limit service
- **Header propagation**: Rate limit status to clients

### Adaptive Rate Limiting
- **Circuit breaker integration**: Adaptive concurrency control
- **Response time based**: Automatic limit adjustment
- **Gradient controller**: Smart concurrency management

## 🛡️ Security Features

### Web Application Firewall
```yaml
# Example security rules applied
- Block SQL injection patterns
- Prevent XSS attempts  
- Path traversal protection
- Admin path restrictions
- Suspicious user agent blocking
```

### JWT Authentication
- **Token validation**: JWKS endpoint integration
- **Audience verification**: Service-specific audiences
- **Metadata extraction**: JWT payload in request context
- **Route-specific**: Per-path authentication requirements

### IP Security
- **Allowlist**: Internal and Azure IP ranges
- **Denylist**: Known malicious IP addresses
- **Geolocation**: Regional access controls
- **Rate limiting**: IP-specific limits

## 📊 Observability Enhancements

### Custom Metrics
- **Business metrics**: API requests, user types, feature usage
- **Performance metrics**: Response times, payload sizes
- **Error tracking**: Error rates, failure patterns
- **Resource usage**: Connection counts, memory usage

### Distributed Tracing
- **OpenTelemetry**: Standard tracing format
- **Custom spans**: Business logic tracing
- **Correlation IDs**: Request tracking across services
- **Jaeger integration**: Trace collection and analysis

### Enhanced Logging
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "method": "GET",
  "path": "/api/v1/data", 
  "response_code": 200,
  "duration": "45ms",
  "tenant": "tenant-a",
  "environment": "production",
  "request_id": "req-12345"
}
```

## 🚀 WASM Extensions

### Custom Request Processing
- **Header manipulation**: Add tenant/environment headers
- **Request validation**: Content type and size checks
- **Rate limiting**: Per-request token bucket
- **Logging**: Detailed request/response logging

### Business Logic Processing
- **A/B testing**: Automatic group assignment
- **Feature flags**: Runtime feature control
- **User classification**: Mobile vs desktop detection
- **Premium user handling**: Enhanced rate limits

### Security Validation
- **SQL injection**: Pattern-based detection
- **XSS protection**: Script tag filtering
- **Path validation**: Allowed path enforcement
- **Content validation**: Safe content type checking

### Performance Monitoring
- **Response time tracking**: Per-request latency
- **Error rate monitoring**: Real-time error tracking
- **Alert thresholds**: Configurable performance alerts
- **Sampling**: Configurable monitoring overhead

## 🎯 Configuration by Tenant

### Tenant A (Production)
```yaml
Security: Strict (WAF, IP allowlist, JWT required)
Rate Limiting: 100 req/min, burst 50
Logging: JSON format, full details
Monitoring: All metrics enabled
WASM: Request processing + security validation
```

### Tenant B (Development)  
```yaml
Security: Relaxed (basic filters only)
Rate Limiting: 200 req/min, burst 100
Logging: Debug level, detailed
Monitoring: Enhanced debugging
WASM: Business logic + A/B testing
```

### Shared Services
```yaml
Security: JWT + RBAC for monitoring tools
Rate Limiting: Service-specific limits
Logging: Infrastructure focused
Monitoring: Full observability stack
WASM: Security validation only
```

## 🔍 Admin Interface Access

Envoy admin interfaces are available at:
- **Production**: `127.0.0.1:15000` (localhost only)
- **Development**: `0.0.0.0:15000` (pod network accessible)
- **Ingress Gateway**: `127.0.0.1:15000` (with profiling)

### Useful Admin Endpoints
```bash
# Configuration dump
curl localhost:15000/config_dump

# Statistics
curl localhost:15000/stats

# Clusters
curl localhost:15000/clusters

# Runtime configuration
curl localhost:15000/runtime

# CPU profiling (when enabled)
curl localhost:15000/cpuprofiler
```

## 📈 Metrics Generated

### Rate Limiting Metrics
- `envoy_local_rate_limit_enabled`
- `envoy_local_rate_limit_enforced` 
- `envoy_local_rate_limit_rate_limited`

### Security Metrics
- `envoy_rbac_allowed`
- `envoy_rbac_denied`
- `envoy_jwt_authn_success`
- `envoy_jwt_authn_failed`

### WASM Metrics
- `custom_requests_total`
- `business_logic_processed`
- `security_violations_blocked`
- `performance_alerts_triggered`

## 🧪 Testing Configurations

### Rate Limiting Test
```bash
# Generate load to trigger rate limits
for i in {1..200}; do
  curl -H "Host: podinfo.tenant-a.davidmarkgardiner.co.uk" \
       http://ingress-ip/ & 
done
wait

# Check rate limit headers
curl -I -H "Host: podinfo.tenant-a.davidmarkgardiner.co.uk" \
     http://ingress-ip/
```

### Security Filter Test
```bash
# Test SQL injection blocking
curl -H "Host: podinfo.tenant-a.davidmarkgardiner.co.uk" \
     "http://ingress-ip/api?id=1' OR '1'='1"

# Test XSS blocking  
curl -H "Host: podinfo.tenant-a.davidmarkgardiner.co.uk" \
     "http://ingress-ip/search?q=<script>alert('xss')</script>"
```

### WASM Extension Test
```bash
# Test custom headers
curl -v -H "Host: podinfo.tenant-b.davidmarkgardiner.co.uk" \
     http://ingress-ip/

# Test A/B group assignment
curl -H "Host: podinfo.tenant-b.davidmarkgardiner.co.uk" \
     -H "Authorization: Bearer fake-jwt-token" \
     http://ingress-ip/
```

## 🚨 Troubleshooting

### Common Issues

1. **WASM Extension Failures**
```bash
# Check WASM logs
kubectl logs -n tenant-a deployment/podinfo-v1 -c istio-proxy | grep WASM
```

2. **Rate Limiting Not Working**
```bash
# Check EnvoyFilter status
kubectl get envoyfilter -A
kubectl describe envoyfilter rate-limit-tenant-a -n tenant-a
```

3. **Security Filter Blocking Valid Requests**
```bash
# Check security logs
kubectl logs -n tenant-a deployment/podinfo-v1 -c istio-proxy | grep SECURITY
```

4. **Admin Interface Not Accessible**
```bash
# Port forward to admin interface
kubectl port-forward -n tenant-a deployment/podinfo-v1 15000:15000
curl localhost:15000/stats
```

## 🎭 Production Considerations

### Security
- Admin interfaces restricted to localhost in production
- WASM extensions use minimal permissions
- Security filters log but don't expose internal details
- Rate limiting uses secure token bucket algorithms

### Performance
- WASM extensions optimized for low latency
- Sampling used for high-overhead monitoring
- Circuit breakers prevent cascade failures
- Memory limits configured for all extensions

### Observability
- All metrics tagged with tenant/environment
- Structured logging for easy parsing
- Distributed tracing for complex request flows
- Alert thresholds tuned for each environment

This comprehensive Envoy configuration demonstrates enterprise-grade proxy features while maintaining security, performance, and observability best practices.