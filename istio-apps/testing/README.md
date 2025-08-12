# Istio Testing Suite

This directory contains comprehensive testing configurations for validating Istio service mesh functionality, including GitOps integration, load testing, chaos engineering, and external connectivity validation.

## Overview

The testing suite provides automated and manual testing capabilities to ensure:

- **Service mesh reliability** under various conditions
- **Security policy enforcement** across tenants
- **Traffic routing and load balancing** functionality
- **External service connectivity** through service entries
- **Circuit breaker and resilience** features
- **Performance baselines** and SLA validation

## Components

### 1. GitOps Test Suite (`gitops-test-suite.yaml`)

Automated testing integrated with Flux GitOps pipeline.

#### Pre-Deployment Validation Job

Runs before any deployment to validate configurations:

**Istio Configuration Validator**:

- Validates Gateway, VirtualService, and DestinationRule configurations
- Uses `istioctl validate` and `istioctl analyze`
- Prevents deployment of invalid Istio resources
- Catches configuration conflicts early

**Security Policy Tester**:

- Tests cross-tenant isolation (should be blocked)
- Validates intra-tenant access (should be allowed)
- Ensures security boundaries are maintained
- Prevents security misconfigurations

**Resource Quota Checker**:

- Monitors resource usage across namespaces
- Validates resource limits compliance
- Alerts on high memory/CPU usage
- Prevents resource exhaustion

#### Post-Deployment Integration Tests

Runs after successful deployment:

**Traffic Flow Tester**:

- Tests HTTPS gateway connectivity
- Validates canary routing with headers
- Checks load balancing distribution
- Uses Fortio for load generation

**Observability Stack Tester**:

- Validates Prometheus metrics collection
- Tests Grafana dashboard availability
- Checks Jaeger tracing functionality
- Ensures monitoring stack health

**Circuit Breaker Tester**:

- Generates high load to trigger circuit breakers
- Validates circuit breaker metrics
- Tests system resilience under load
- Monitors recovery behavior

#### Chaos Engineering CronWorkflow

Scheduled chaos tests running daily at 2 AM:

**Pod Failure Test**:

- Randomly kills pods in tenant namespaces
- Validates automatic pod recovery
- Tests Kubernetes resilience
- Ensures minimum replica maintenance

**Network Partition Test**:

- Simulates network delays using `tc` (traffic control)
- Tests service resilience under network stress
- Validates timeout and retry configurations
- Cleans up network modifications

**Latency Injection Test**:

- Uses Istio fault injection headers
- Measures response times under artificial latency
- Tests application behavior with delays
- Validates timeout configurations

### 2. Load Generator (`load-generator.yaml`)

Continuous load generation for testing and metrics collection.

#### Load Generator Deployment

- **Tenant A Testing**: 10 requests per cycle with proper host headers
- **Canary Testing**: 5 requests with `canary: true` header
- **Tenant B Testing**: 10 requests to development environment
- **External Service Testing**: Tests HTTPBin and JSONPlaceholder APIs
- **Cycle Duration**: 30-second intervals for sustained load

#### Chaos Engineering Pod

- **Random Behavior**: Introduces random delays and errors
- **Health Degradation**: Becomes unhealthy after 300 seconds
- **Visual Identification**: Pink UI color for chaos testing
- **Resource Limits**: Conservative limits to prevent impact

### 3. External Test Client (`external-test-client.yaml`)

Comprehensive connectivity and functionality testing.

#### External Test Client Deployment

**External Service Testing**:

- HTTPBin API connectivity and response time
- JSONPlaceholder HTTPS connectivity
- GitHub API accessibility
- Response code and timing validation

**Internal Service Testing**:

- Cross-namespace service discovery
- Redis connectivity validation
- Service mesh communication
- Response time monitoring

**Security Validation**:

- Cross-tenant access blocking verification
- Network policy enforcement testing
- Service mesh security boundary validation
- Alerts on security violations

**Service Mesh Feature Testing**:

- Circuit breaker activation through high load
- Retry policy validation with 503 responses
- Timeout behavior testing
- Load balancing verification

#### Debug Client Pod

Interactive debugging environment with comprehensive tools:

- **Network Tools**: curl, dig, nslookup, ping, netstat, ss
- **Monitoring Tools**: tcpdump, nmap
- **Usage**: `kubectl exec -it debug-client -n istio-testing -- bash`

#### Performance Test Job

Baseline performance testing using Fortio:

- **Configuration**: 10 concurrent connections, 100 QPS
- **Duration**: 5 minutes sustained load
- **Target**: Tenant A podinfo service
- **Metrics**: Response time distribution, success rate

## Test Categories

### 1. Configuration Validation

- **Pre-deployment**: Istio configuration syntax and semantic validation
- **Conflict Detection**: Cross-resource dependency analysis
- **Best Practices**: Policy and security configuration compliance
- **Resource Validation**: Quota and limit enforcement

### 2. Functional Testing

- **Traffic Routing**: Gateway, VirtualService, and DestinationRule functionality
- **Load Balancing**: Distribution algorithms and health-based routing
- **Service Discovery**: DNS resolution and service registration
- **External Connectivity**: ServiceEntry and egress traffic management

### 3. Security Testing

- **Multi-tenant Isolation**: Cross-namespace access prevention
- **mTLS Enforcement**: Mutual TLS communication validation
- **Authorization Policies**: RBAC and access control testing
- **Network Segmentation**: Traffic flow restriction validation

### 4. Resilience Testing

- **Circuit Breakers**: Failure threshold and recovery testing
- **Retry Policies**: Automatic retry behavior validation
- **Timeout Handling**: Request timeout and deadline enforcement
- **Fault Injection**: Error and delay injection testing

### 5. Performance Testing

- **Throughput**: Maximum request processing capacity
- **Latency**: Response time under various load conditions
- **Scalability**: Performance under increasing load
- **Resource Utilization**: CPU and memory efficiency

### 6. Chaos Engineering

- **Infrastructure Failures**: Pod and node failure scenarios
- **Network Issues**: Partition, delay, and packet loss simulation
- **Resource Exhaustion**: Memory and CPU starvation testing
- **Dependency Failures**: External service unavailability

## Monitoring and Metrics

### Test Execution Metrics

```promql
# Test success rate
sum(rate(test_execution_total{status="success"}[5m])) / sum(rate(test_execution_total[5m])) * 100

# Test execution duration
histogram_quantile(0.95, sum(rate(test_duration_seconds_bucket[5m])) by (le, test_type))

# Failed test count
sum(rate(test_execution_total{status="failed"}[5m])) by (test_type)
```

### Service Health Metrics

```promql
# Service availability during tests
up{job="kubernetes-pods", namespace=~"tenant-.*|shared-services"}

# Response time during load tests
histogram_quantile(0.99, sum(rate(istio_request_duration_milliseconds_bucket[5m])) by (le))

# Error rate during chaos tests
sum(rate(istio_requests_total{response_code=~"5.*"}[5m])) / sum(rate(istio_requests_total[5m])) * 100
```

## Usage Guide

### Running Pre-Deployment Tests

```bash
# Manually trigger pre-deployment validation
kubectl create job --from=job/pre-deploy-validation pre-deploy-$(date +%s) -n istio-testing

# Check test results
kubectl logs job/pre-deploy-$(date +%s) -n istio-testing -c istio-config-validator
```

### Running Post-Deployment Tests

```bash
# Trigger integration tests after deployment
kubectl create job --from=job/post-deploy-integration-tests integration-$(date +%s) -n istio-testing

# Monitor test progress
kubectl logs job/integration-$(date +%s) -n istio-testing -c traffic-flow-tester -f
```

### Manual Testing with Debug Client

```bash
# Access debug client
kubectl exec -it debug-client -n istio-testing -- bash

# Test internal connectivity
curl http://podinfo.tenant-a.svc.cluster.local:9898/

# Test external connectivity
curl http://httpbin.org/headers

# Check DNS resolution
dig podinfo.tenant-a.svc.cluster.local

# Network troubleshooting
netstat -an | grep :9898
ss -tuln
```

### Performance Testing

```bash
# Run performance baseline test
kubectl create job --from=job/performance-test perf-$(date +%s) -n istio-testing

# Check results
kubectl logs job/perf-$(date +%s) -n istio-testing
```

### Chaos Engineering

```bash
# Manually trigger chaos tests
kubectl create -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: manual-chaos-test
  namespace: istio-testing
spec:
  template:
    spec:
      containers:
      - name: chaos
        image: chaosmesh/chaos-mesh:2.5.1
        command: ["/bin/sh", "-c"]
        args: ["kubectl delete pod -n tenant-a -l app=podinfo --field-selector=status.phase=Running --timeout=1s"]
      restartPolicy: Never
EOF
```

## Test Automation Integration

### GitOps Integration

```yaml
# Flux dependency configuration
apiVersion: kustomize.toolkit.fluxcd.io/v1beta2
kind: Kustomization
metadata:
  name: tenant-applications
spec:
  dependsOn:
    - name: pre-deploy-validation
      namespace: istio-testing
  healthChecks:
    - apiVersion: batch/v1
      kind: Job
      name: post-deploy-integration-tests
      namespace: istio-testing
```

### CI/CD Pipeline Integration

```bash
#!/bin/bash
# Example CI/CD script integration

# Run pre-deployment tests
kubectl wait --for=condition=complete job/pre-deploy-validation -n istio-testing --timeout=300s

# Deploy application if tests pass
if [ $? -eq 0 ]; then
  kubectl apply -f application-manifests/

  # Run post-deployment tests
  kubectl wait --for=condition=complete job/post-deploy-integration-tests -n istio-testing --timeout=600s
else
  echo "Pre-deployment tests failed. Aborting deployment."
  exit 1
fi
```

## Troubleshooting

### Common Issues

#### Test Job Stuck in Pending

**Symptoms**: Test jobs don't start or remain in pending state

**Solutions**:

```bash
# Check resource quotas
kubectl describe resourcequota -n istio-testing

# Check node resources
kubectl top nodes

# Check pod scheduling
kubectl describe pod -n istio-testing -l job-name=pre-deploy-validation
```

#### External Service Tests Failing

**Symptoms**: HTTPBin or JSONPlaceholder tests fail

**Solutions**:

```bash
# Verify ServiceEntry exists
kubectl get serviceentry -n external-services

# Check egress traffic policy
kubectl get sidecar -n istio-testing -o yaml

# Test DNS resolution
kubectl exec debug-client -n istio-testing -- nslookup httpbin.org
```

#### Cross-Tenant Security Tests False Positives

**Symptoms**: Cross-tenant access unexpectedly allowed

**Solutions**:

```bash
# Check AuthorizationPolicy
kubectl get authorizationpolicy -A

# Verify PeerAuthentication
kubectl get peerauthentication -A

# Check Sidecar configuration
kubectl get sidecar -n tenant-a -o yaml
```

## Performance Benchmarks

### Expected Performance Baselines

- **Response Time P99**: <100ms for simple requests
- **Throughput**: >1000 RPS per pod
- **Success Rate**: >99.9% under normal load
- **Circuit Breaker Activation**: <5 seconds under overload
- **Recovery Time**: <30 seconds after failure

### Load Test Parameters

- **Concurrent Users**: 10-100 depending on test scenario
- **Request Rate**: 10-1000 QPS based on capacity
- **Test Duration**: 5 minutes for baseline, 30 minutes for stress
- **Success Criteria**: <1% error rate, <500ms P95 latency

## Security Considerations

### Test Environment Security

- Tests run in isolated `istio-testing` namespace
- RBAC limits test runner permissions
- No external network access for sensitive tests
- Cleanup procedures remove temporary resources

### Data Privacy

- Tests use synthetic data only
- No production data in test scenarios
- External API calls use public endpoints
- Logs contain no sensitive information

## Maintenance

### Regular Maintenance Tasks

```bash
# Clean up completed test jobs (weekly)
kubectl delete job -n istio-testing --field-selector=status.successful=1

# Update test images (monthly)
kubectl set image deployment/load-generator load-generator=curlimages/curl:latest -n istio-testing

# Review and update chaos scenarios (quarterly)
kubectl get cronjob chaos-testing-schedule -n istio-testing -o yaml
```

### Test Suite Updates

- Monitor test reliability and adjust thresholds
- Add new test scenarios for new features
- Update external service endpoints as needed
- Sync test configurations with application changes
