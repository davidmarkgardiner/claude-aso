# Flux Health Checks for Istio Components

This directory contains GitOps configurations for monitoring and managing Istio deployments using Flux.

## Overview

The `health-checks.yaml` file defines a comprehensive GitOps health monitoring and progressive deployment system for Istio applications using Flux.

## Core Components

### 1. Flux Kustomization
- Monitors critical Istio resources with health checks
- Validates Gateway readiness (`main-gateway`)
- Checks VirtualService health for tenant applications
- Monitors application deployment status
- Runs on a 5-minute sync interval with 10-minute timeout

### 2. Slack Notifications
- Sends deployment alerts to `#istio-deployments` channel
- Triggers on deployment failures
- Provides error severity filtering

### 3. Progressive Deployment (Flagger)
- Implements canary deployments with gradual traffic shifting
- Traffic increases in 2% increments up to 10% maximum
- Validates key metrics:
  - Success rate must be >99%
  - Request latency must be <500ms
  - Error rate must be <1%
- Runs pre-rollout validation checks for Istio proxy and security policies
- Automatic rollback on metric failures

### 4. Resource Controls

#### ResourceQuota
Limits for tenant-a namespace:
- CPU: 4 cores maximum
- Memory: 8Gi maximum
- Pods: 20 maximum
- PVCs: 5 maximum
- Services: 10 maximum

#### NetworkPolicy
- Isolates tenant traffic between namespaces
- Allows Istio system plane access
- Permits monitoring from shared-services
- Enables external HTTPS/HTTP traffic through Istio

## How It Works

1. **Health Monitoring**: Flux continuously checks if critical Istio resources (Gateways, VirtualServices, Deployments) are healthy
2. **Progressive Rollouts**: New deployments use canary analysis with automatic rollback on metric failures
3. **Security Isolation**: NetworkPolicy ensures tenants can only communicate through the Istio service mesh
4. **Resource Safety**: Quotas prevent resource exhaustion during deployments
5. **Alert Integration**: Failed deployments trigger immediate Slack notifications

## Dependencies

- Flux v2 (Kustomization controller)
- Flagger (for canary deployments)
- Istio service mesh
- Slack webhook secret (for notifications)

## Usage

Apply the configuration:
```bash
kubectl apply -f health-checks.yaml
```

Monitor health check status:
```bash
flux get kustomizations istio-health-checks
```

Check canary deployment progress:
```bash
kubectl get canary -n tenant-a
```

## Configuration

To customize for your environment:
1. Update the Slack channel and webhook secret reference
2. Adjust resource quotas based on your tenant requirements
3. Modify canary analysis thresholds for your SLOs
4. Update namespace labels in NetworkPolicy as needed