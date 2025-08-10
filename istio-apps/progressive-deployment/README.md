# Progressive Deployment with Flagger

This directory contains comprehensive Flagger configurations for automated canary deployments in the Istio service mesh, enabling safe and controlled rollouts with automated rollback capabilities.

## Overview

Flagger provides progressive delivery capabilities for Kubernetes applications by automating canary deployments, A/B testing, and blue-green deployments using Istio traffic management features.

### Key Features

- **Automated Canary Analysis**: Traffic shifting based on success rate, latency, and custom metrics
- **Multi-Stage Validation**: Pre-rollout, promotion, and post-rollout webhooks
- **Environment-Specific Configuration**: Different strategies for production vs development
- **Custom Metrics Integration**: Business KPIs and Istio telemetry
- **Automated Rollback**: Instant rollback on metric threshold violations
- **Approval Gates**: Manual approval steps for critical deployments

## Components

### 1. Production Canary (Tenant A)

Conservative deployment strategy for production workloads.

#### Configuration Parameters
- **Interval**: 60s between analysis cycles
- **Step Weight**: 5% traffic increments
- **Max Weight**: 20% maximum canary traffic
- **Iterations**: 10 cycles (total ~10 minutes)
- **Threshold**: 10 failed checks trigger rollback

#### Success Criteria
- **Success Rate**: ≥99.5% (strict)
- **P99 Latency**: ≤500ms
- **Error Rate**: ≤0.5%
- **Business Metrics**: ≥95% conversion rate

#### Validation Gates
1. **Security Validation**: Vulnerability scan
2. **Load Testing**: Performance baseline
3. **Configuration Validation**: Istio config check
4. **Manual Approval**: Business stakeholder sign-off
5. **Post-Deployment**: Comprehensive verification

### 2. Development Canary (Tenant B)

Aggressive deployment strategy for development environments.

#### Configuration Parameters
- **Interval**: 30s (faster cycles)
- **Step Weight**: 10% traffic increments
- **Max Weight**: 50% maximum canary traffic
- **Iterations**: 5 cycles (total ~5 minutes)
- **Threshold**: 5 failed checks trigger rollback

#### Relaxed Criteria
- **Success Rate**: ≥95% (lenient)
- **P99 Latency**: ≤1000ms
- **Simplified Validation**: Basic health checks only

### 3. Custom Metric Templates

#### Business KPI Template
Measures conversion rate from application metrics:
```promql
sum(rate(podinfo_requests_total{deployment=~"{{ .Target }}.*"}[{{ .Interval }}])) /
sum(rate(http_requests_total{deployment=~"{{ .Target }}.*"}[{{ .Interval }}])) * 100
```

#### Istio Success Rate Template
Uses Istio telemetry for accurate traffic analysis:
```promql
sum(rate(istio_requests_total{response_code!~"5.*"}[{{ .Interval }}])) /
sum(rate(istio_requests_total[{{ .Interval }}])) * 100
```

#### P99 Latency Template
Measures 99th percentile response time:
```promql
histogram_quantile(0.99,
  sum(rate(istio_request_duration_milliseconds_bucket[{{ .Interval }}])) by (le)
)
```

## Deployment Workflow

### Phase 1: Pre-Rollout Validation (0% traffic)
```
1. Security scan of new image
2. Load test against canary endpoint
3. Istio configuration validation
4. [Production only] Manual approval gate
```

### Phase 2: Progressive Traffic Shift
```
Production (Tenant A):
0% → 5% → 10% → 15% → 20% → Promote
Each step: 60s analysis + metric validation

Development (Tenant B):
0% → 10% → 20% → 30% → 40% → 50% → Promote
Each step: 30s analysis + basic validation
```

### Phase 3: Promotion Decision
- **Success**: All metrics pass → Promote to 100%
- **Failure**: Any metric fails → Immediate rollback
- **Stuck**: Manual intervention after 30 minutes

### Phase 4: Post-Rollout Verification
```
1. Health check validation
2. Performance baseline verification
3. Security posture confirmation
4. Notification to stakeholders
```

## Webhook Integrations

### Pre-Rollout Webhooks

#### Security Validator
```bash
URL: http://security-validator.shared-services.svc.cluster.local:8080/validate
Purpose: CVE scanning, image vulnerability assessment
Timeout: 30s
```

#### Load Tester
```bash
URL: http://flagger-loadtester.istio-testing.svc.cluster.local:80/
Purpose: Performance baseline validation
Command: fortio load -c 10 -n 100 -qps 50
Timeout: 60s
```

#### Configuration Validator
```bash
URL: http://istio-validator.shared-services.svc.cluster.local:8080/validate-config
Purpose: Istio resource validation
Timeout: 15s
```

### Promotion Webhooks

#### Approval Gate (Production Only)
```bash
URL: http://approval-service.shared-services.svc.cluster.local:8080/approve
Purpose: Manual stakeholder approval
Timeout: 300s (5 minutes)
```

### Post-Rollout Webhooks

#### Comprehensive Verification
```bash
# Health check
curl -f http://podinfo.tenant-a.svc.cluster.local:9898/healthz

# Performance verification
fortio load -c 5 -n 50 -qps 10 http://podinfo.tenant-a.svc.cluster.local:9898/

# Security verification
curl -f http://security-validator.shared-services.svc.cluster.local:8080/verify-deployment
```

## Monitoring and Alerting

### Flagger Metrics
- `flagger_canary_status`: Current canary state (0=failed, 1=running, 2=succeeded)
- `flagger_canary_weight`: Current traffic weight percentage
- `flagger_canary_duration_seconds`: Time spent in canary analysis

### Critical Alerts

#### Canary Analysis Failed
```yaml
expr: flagger_canary_status == 0
severity: warning
description: Automatic rollback triggered due to metric violations
```

#### Canary Deployment Stuck
```yaml
expr: flagger_canary_status == 1 and increase(flagger_canary_status[30m]) == 0
severity: critical
description: Canary hasn't progressed in 30 minutes - manual intervention required
```

#### High Error Rate During Canary
```yaml
expr: sum(rate(istio_requests_total{response_code=~"5.*"}[5m])) / sum(rate(istio_requests_total[5m])) * 100 > 5
severity: critical
description: Error rate exceeds 5% during canary analysis
```

## Grafana Dashboard

The configuration includes a comprehensive Grafana dashboard showing:

### Key Panels
1. **Canary Analysis Status**: Real-time status of all canary deployments
2. **Success Rate Trends**: Success rate over time for each service
3. **Traffic Weight Distribution**: Current canary vs primary traffic split
4. **Latency Percentiles**: P50, P95, P99 response times
5. **Error Rate by Service**: Error breakdown by deployment
6. **Deployment Timeline**: Historical view of canary events

### Dashboard Queries
```promql
# Canary status
flagger_canary_status

# Success rate
sum(rate(istio_requests_total{response_code!~"5.*"}[5m])) by (destination_service_name) / 
sum(rate(istio_requests_total[5m])) by (destination_service_name) * 100

# Traffic weight
flagger_canary_weight
```

## Usage Examples

### Trigger a Canary Deployment
```bash
# Update the target deployment image
kubectl set image deployment/podinfo-v1 podinfo=stefanprodan/podinfo:6.0.1 -n tenant-a

# Flagger automatically detects the change and starts canary analysis
```

### Monitor Canary Progress
```bash
# Watch canary status
kubectl get canary -n tenant-a -w

# Check detailed analysis
kubectl describe canary tenant-a-podinfo-progressive -n tenant-a

# View Flagger logs
kubectl logs -n flagger-system deployment/flagger -f
```

### Manual Rollback
```bash
# Force rollback if needed
kubectl patch canary tenant-a-podinfo-progressive -n tenant-a --type='merge' -p='{"spec":{"revertOnDeletion":true}}'
kubectl delete canary tenant-a-podinfo-progressive -n tenant-a
```

## Troubleshooting

### Issue: Canary Stuck at 0% Traffic

**Symptoms**: Canary shows "Progressing" but traffic weight remains 0%

**Common Causes**:
1. Pre-rollout webhook failures
2. Security validation blocking deployment
3. Load test not passing

**Debug Steps**:
```bash
# Check canary events
kubectl describe canary tenant-a-podinfo-progressive -n tenant-a

# Check webhook logs
kubectl logs -n shared-services deployment/security-validator

# Test webhook manually
curl -X POST http://security-validator.shared-services.svc.cluster.local:8080/validate
```

### Issue: Metrics Not Available

**Symptoms**: Canary fails with "metric not found" error

**Solutions**:
1. Verify Prometheus is scraping targets:
```bash
kubectl port-forward -n shared-services svc/prometheus 9090:9090
# Check targets at http://localhost:9090/targets
```

2. Check metric template queries:
```bash
kubectl get metrictemplate -n flagger-system
kubectl describe metrictemplate success-rate -n flagger-system
```

### Issue: Approval Gate Timeout

**Symptoms**: Canary stuck waiting for manual approval

**Solutions**:
```bash
# Check approval service
kubectl logs -n shared-services deployment/approval-service

# Approve manually via API
curl -X POST http://approval-service.shared-services.svc.cluster.local:8080/approve \
  -H "Content-Type: application/json" \
  -d '{"canary": "tenant-a-podinfo-progressive", "namespace": "tenant-a", "approved": true}'
```

## Best Practices

### Production Deployments
1. **Always use approval gates** for critical services
2. **Set conservative thresholds** (99.5% success rate)
3. **Include business metrics** in analysis
4. **Test webhooks thoroughly** in staging
5. **Monitor canary dashboards** during deployments

### Development Deployments
1. **Use faster iterations** for quick feedback
2. **Relax metric thresholds** for experimentation
3. **Skip manual approvals** for automated testing
4. **Include chaos testing** in validation

### Metric Selection
1. **Primary metrics**: Success rate, latency, error rate
2. **Secondary metrics**: Business KPIs, resource utilization
3. **Avoid noisy metrics** that cause false rollbacks
4. **Use appropriate time windows** (1-5 minutes)

## Security Considerations

### Webhook Security
- All webhooks use internal cluster DNS
- Webhooks have timeouts to prevent hanging
- Security validation runs before any traffic shift
- RBAC restricts access to canary resources

### Traffic Management
- Canary traffic isolated using Istio VirtualServices
- mTLS enforced between all services
- Header-based routing for testing
- Circuit breakers prevent cascade failures

## Integration with GitOps

### Flux Integration
```bash
# Canary deployments triggered by Flux image updates
flux create image policy podinfo-policy \
  --image-ref=podinfo-registry \
  --select-semver=">1.0.0"

# Flagger watches for deployment changes
# No manual intervention needed
```

### Rollback Strategy
- Automatic rollback on metric violations
- Manual rollback via kubectl or Flux
- Image rollback through GitOps repository
- State preserved in Kubernetes events

## Performance Impact

### Resource Overhead
- Flagger controller: ~50MB memory, ~10m CPU
- Analysis per canary: ~1MB memory, ~1m CPU
- Webhook calls: Minimal network overhead
- Prometheus queries: Configurable intervals

### Network Impact
- Traffic splitting via Istio (no performance impact)
- Webhook validation: <100ms per call
- Metric collection: Background scraping
- Rollback: Instantaneous traffic shift

## Future Enhancements

- [ ] Integration with external approval systems (Jira, ServiceNow)
- [ ] Machine learning-based anomaly detection
- [ ] Multi-cluster canary deployments
- [ ] Integration with cost optimization metrics
- [ ] Advanced A/B testing capabilities
- [ ] Canary deployment templates for different application types