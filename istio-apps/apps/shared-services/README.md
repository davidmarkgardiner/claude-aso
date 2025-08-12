# Shared Services Infrastructure

This directory contains core infrastructure services shared across all tenants in the Istio service mesh deployment.

## Overview

The shared-services namespace provides centralized observability, monitoring, and caching infrastructure that all tenant applications can utilize. These services are managed by Flux GitOps and integrated with Istio for secure multi-tenant access.

## Components

### 1. Monitoring Stack (`monitoring-stack.yaml`)

#### Prometheus

- **Purpose**: Metrics collection and storage for the entire service mesh
- **Configuration**:
  - Version: v2.48.0
  - Storage: 7-day retention with local storage
  - Resources: 512Mi-1Gi memory, 100m-500m CPU
  - Features: Admin API enabled, lifecycle management
  - Istio Integration: Sidecar injection enabled for secure communication

#### Grafana

- **Purpose**: Visualization and dashboards for metrics
- **Configuration**:
  - Version: 10.2.0
  - URL: `http://monitoring.shared-services.davidmarkgardiner.co.uk/grafana`
  - Resources: 256Mi-512Mi memory, 100m-200m CPU
  - Security: Sign-up disabled, admin password configured
  - Dashboards: Pre-configured Istio and Podinfo dashboards

### 2. Distributed Tracing (`jaeger-tracing.yaml`)

#### Jaeger All-in-One

- **Purpose**: End-to-end distributed tracing for microservices
- **Configuration**:
  - Version: 1.51
  - Mode: All-in-one deployment (development/testing)
  - Max Traces: 50,000 in memory
  - Resources: 256Mi-512Mi memory, 100m-500m CPU

#### Service Endpoints

- **Query UI**: Port 16686 - Web interface for trace exploration
- **Collector**:
  - Jaeger Thrift: Port 14268
  - Jaeger gRPC: Port 14250
  - Zipkin HTTP: Port 9411 (compatibility mode)
- **Admin**: Port 14269 - Metrics and health endpoints
- **OTLP**: Enabled for OpenTelemetry compatibility

### 3. Redis Cluster (`redis-cluster.yaml`)

#### Redis StatefulSet

- **Purpose**: Shared caching layer for all tenants
- **Configuration**:
  - Version: Redis 7 Alpine
  - Mode: Cluster mode with 3 replicas
  - Memory Policy: LRU eviction at 256MB limit
  - Persistence: Append-only file (AOF) enabled
  - Resources: 128Mi-256Mi memory, 50m-200m CPU per pod

#### Storage

- **Persistent Volumes**: 1Gi per replica
- **Data Directory**: `/data` with cluster configuration

#### Services

- **Headless Service** (`redis-cluster`): For cluster discovery
- **Client Service** (`redis`): For application connections on port 6379

## Kustomization Configuration

The `kustomization.yaml` file manages:

### Image Versions

- Prometheus: v2.48.0
- Grafana: 10.2.0
- Jaeger: 1.51
- Redis: 7-alpine

### Replica Counts

- Prometheus: 1 replica
- Grafana: 1 replica
- Jaeger: 1 replica
- Redis: 3 replicas (cluster mode)

### Common Labels

- `tenant: shared` - Identifies shared infrastructure
- `managed-by: flux` - GitOps management
- `deployment-agent: istio-engineer` - Deployment ownership
- `service-type: infrastructure` - Service classification

### ConfigMap Generation

- **prometheus-config**: Prometheus scraping configuration
- **grafana-dashboards**: Pre-built dashboards for Istio and applications

## Multi-Tenant Access Patterns

### Service Discovery

All services are accessible within the cluster using DNS:

- `prometheus.shared-services.svc.cluster.local:9090`
- `grafana.shared-services.svc.cluster.local:3000`
- `jaeger-query.shared-services.svc.cluster.local:16686`
- `redis.shared-services.svc.cluster.local:6379`

### Security Considerations

1. **Istio Sidecar Injection**: All pods have Istio sidecars for:
   - mTLS encryption between services
   - Fine-grained access control via AuthorizationPolicies
   - Traffic observability

2. **Service Account**: Uses `istio-shared-services` for RBAC

3. **Resource Limits**: All containers have defined resource limits to prevent noisy neighbor issues

4. **Network Isolation**: Services are isolated in the `shared-services` namespace

## Usage Examples

### Connecting to Redis from Tenant Applications

```yaml
env:
  - name: REDIS_HOST
    value: "redis.shared-services.svc.cluster.local"
  - name: REDIS_PORT
    value: "6379"
```

### Configuring Prometheus Scraping

Applications should include annotations:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"
```

### Sending Traces to Jaeger

Configure OpenTelemetry or Jaeger client:

```yaml
env:
  - name: JAEGER_AGENT_HOST
    value: "jaeger-collector.shared-services.svc.cluster.local"
  - name: JAEGER_AGENT_PORT
    value: "14250"
```

## Monitoring and Health

### Health Endpoints

- Prometheus: `http://prometheus:9090/-/healthy`
- Grafana: `http://grafana:3000/api/health`
- Jaeger: `http://jaeger:14269/`
- Redis: `redis-cli ping`

### Key Metrics to Monitor

1. **Prometheus**:
   - Storage usage
   - Scrape duration
   - Target health

2. **Grafana**:
   - Dashboard load times
   - Active user sessions
   - Query performance

3. **Jaeger**:
   - Trace ingestion rate
   - Memory usage (max 50k traces)
   - Span drop rate

4. **Redis**:
   - Memory usage vs limit
   - Eviction rate
   - Cluster health status

## Deployment

Deploy using Flux GitOps:

```bash
flux reconcile kustomization shared-services
```

Or manually with kubectl:

```bash
kubectl apply -k istio-apps/apps/shared-services/
```

## Troubleshooting

### Common Issues

1. **Prometheus OOM**: Increase memory limits or reduce retention
2. **Grafana Login Issues**: Check admin password in deployment
3. **Jaeger Trace Loss**: Increase max-traces parameter
4. **Redis Evictions**: Monitor memory usage and adjust maxmemory

### Debug Commands

```bash
# Check pod status
kubectl get pods -n shared-services

# View logs
kubectl logs -n shared-services deployment/prometheus
kubectl logs -n shared-services deployment/grafana
kubectl logs -n shared-services deployment/jaeger
kubectl logs -n shared-services statefulset/redis-cluster

# Access services locally
kubectl port-forward -n shared-services svc/prometheus 9090:9090
kubectl port-forward -n shared-services svc/grafana 3000:3000
kubectl port-forward -n shared-services svc/jaeger-query 16686:16686
```

## Future Enhancements

- [ ] Implement long-term storage for Prometheus (Thanos/Cortex)
- [ ] Add Jaeger production deployment with Elasticsearch backend
- [ ] Configure Redis Sentinel for HA
- [ ] Add AlertManager for Prometheus alerting
- [ ] Implement Grafana SSO/OIDC authentication
- [ ] Add distributed tracing sampling strategies
