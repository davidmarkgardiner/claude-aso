# Argo Workflows for AKS - Platform API Integration

This directory contains production-ready Argo Workflows manifests optimized for Azure Kubernetes Service (AKS) deployment and integrated with the Platform API for namespace-as-a-service functionality.

## 📋 Overview

Argo Workflows is deployed as the workflow execution engine for the Platform API, enabling automated namespace provisioning, resource management, and operational workflows within the AKS cluster.

### Key Features

- **Production-ready AKS configuration** with Azure-specific optimizations
- **Platform API integration** for namespace provisioning workflows
- **Comprehensive security** with Pod Security Standards, Network Policies, and RBAC
- **Full observability** with Prometheus metrics, alerts, and Grafana dashboards
- **GitOps deployment** via Flux with proper resource ordering
- **High availability** with multi-replica deployment and pod disruption budgets

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AKS Cluster                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────────────────────┐  │
│  │   Platform API  │────│        Argo Server             │  │
│  │   Namespace     │    │  - API Gateway (2746)          │  │
│  └─────────────────┘    │  - Azure AD Integration        │  │
│                         │  - TLS Termination             │  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Argo Namespace                           │  │
│  │  ┌──────────────────┐  ┌────────────────────────────┐ │  │
│  │  │ Workflow         │  │    Argo Server            │ │  │
│  │  │ Controller       │  │  - Web UI & API           │ │  │
│  │  │ - Execution      │  │  - Authentication         │ │  │
│  │  │ - Scheduling     │  │  - Authorization          │ │  │
│  │  └──────────────────┘  └────────────────────────────┘ │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │           Workflow Templates                     │ │  │
│  │  │  - namespace-provisioning                       │ │  │
│  │  │  - Platform API integrations                    │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Monitoring & Observability            │  │
│  │  - Prometheus ServiceMonitors                         │  │
│  │  - Grafana Dashboards                                 │  │
│  │  - Alert Rules                                        │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 📁 File Structure

```
apps/argo/
├── README.md                           # This file
├── kustomization.yaml                  # GitOps orchestration
├── namespace.yaml                      # Namespace with security policies
├── serviceaccount.yaml                 # Service accounts with Azure Workload Identity
├── clusterrole.yaml                    # RBAC cluster roles
├── clusterrolebinding.yaml             # RBAC bindings
├── configmap.yaml                      # Workflow controller configuration
├── workflow-controller-deployment.yaml # Core workflow controller
├── argo-server-deployment.yaml         # API server deployment
├── service.yaml                        # Services and load balancers
├── networkpolicy.yaml                  # Network security policies
├── poddisruptionbudget.yaml           # High availability configuration
├── workflow-templates.yaml             # Platform API workflow templates
└── monitoring.yaml                     # Observability configuration
```

## 🚀 Deployment

### Prerequisites

1. **AKS cluster** with the following features:
   - Azure Workload Identity enabled
   - Pod Security Standards enforced
   - Network policies enabled (Azure CNI)
   - System node pool available

2. **Required Azure resources**:
   - Azure Storage Account for workflow artifacts
   - Azure PostgreSQL (optional, for workflow persistence)
   - Azure Key Vault with secrets

3. **Cluster dependencies**:
   - Flux CD installed and configured
   - External Secrets Operator (for Azure Key Vault integration)
   - Prometheus and Grafana (for monitoring)

### Environment Variables & Secrets

Create the following secrets in Azure Key Vault:

```bash
# Azure Workload Identity
AZURE_CLIENT_ID="<workload-identity-client-id>"
AZURE_TENANT_ID="<azure-tenant-id>"

# Platform API Integration
PLATFORM_API_TOKEN="<secure-api-token>"

# Storage Configuration
AZURE_STORAGE_ACCOUNT="<storage-account-name>"
AZURE_STORAGE_KEY="<storage-account-key>"

# SSO Configuration (Optional)
SSO_CLIENT_ID="<azure-ad-app-id>"
SSO_CLIENT_SECRET="<azure-ad-app-secret>"
```

### GitOps Deployment

1. **Enable in main kustomization**:

   ```yaml
   # apps/kustomization.yaml
   resources:
     - argo/
   ```

2. **Deploy via Flux**:

   ```bash
   kubectl apply -k apps/argo/
   ```

3. **Verify deployment**:
   ```bash
   kubectl get pods -n argo
   kubectl get workflows -n argo
   ```

### Manual Deployment (Alternative)

```bash
# Deploy with kubectl
kubectl apply -k apps/argo/

# Wait for rollout
kubectl rollout status deployment/workflow-controller -n argo
kubectl rollout status deployment/argo-server -n argo
```

## 🔧 Configuration

### Workflow Controller Configuration

Key configuration options in `configmap.yaml`:

- **Parallelism**: `10` workflows max concurrent execution
- **TTL Strategy**: Completed workflows retained for 1 hour
- **Security Context**: Non-root execution with restricted capabilities
- **Node Selection**: System node pool targeting
- **Persistence**: PostgreSQL backend for workflow state
- **Artifact Repository**: Azure Blob Storage integration

### Argo Server Configuration

- **Authentication**: Azure AD SSO integration
- **Authorization**: RBAC-based access control
- **TLS**: Certificate-based encryption
- **API Access**: Platform API service-to-service communication
- **UI Access**: Web interface with Azure AD authentication

### Resource Quotas & Limits

**Workflow Controller**:

- CPU: 100m request, 500m limit
- Memory: 256Mi request, 1Gi limit

**Argo Server**:

- CPU: 100m request, 500m limit
- Memory: 128Mi request, 512Mi limit

**Workflow Pods**:

- Default CPU: 50m request, 500m limit
- Default Memory: 64Mi request, 512Mi limit

## 🔐 Security

### Pod Security Standards

- **Security Context**: Non-root user (1001:1001)
- **Capabilities**: All dropped, no privilege escalation
- **Filesystem**: Read-only root filesystem where possible
- **Seccomp**: Runtime/default profile enforced

### Network Security

- **Default Deny**: All ingress/egress blocked by default
- **Selective Allow**: DNS, Kubernetes API, Azure services
- **Namespace Isolation**: Traffic restricted to required services
- **Platform API**: Dedicated network policy for API communication

### RBAC Configuration

- **Principle of Least Privilege**: Minimal required permissions
- **Namespace Scoped**: Operations limited to managed namespaces
- **Platform Integration**: Extended permissions for namespace provisioning
- **Azure Integration**: Workload Identity for Azure resource access

## 🔄 Platform API Integration

### Workflow Templates

The `namespace-provisioning` WorkflowTemplate provides:

1. **Validation**: Namespace name and team validation
2. **Creation**: Kubernetes namespace with proper labeling
3. **Resource Quotas**: Tier-based resource allocation
4. **RBAC Setup**: Team-based access controls
5. **Network Policies**: Security-first networking
6. **Feature Configuration**: Istio, monitoring, backup enablement
7. **Registration**: Platform API state synchronization

### API Integration

**Platform API → Argo Workflows**:

```typescript
// Submit namespace provisioning workflow
const workflow = await argoClient.submitWorkflow({
  metadata: { generateName: "namespace-provision-" },
  spec: {
    workflowTemplateRef: { name: "namespace-provisioning" },
    arguments: {
      parameters: [
        { name: "namespace-name", value: "team-frontend-dev" },
        { name: "team-name", value: "frontend" },
        { name: "resource-tier", value: "medium" },
      ],
    },
  },
});
```

**Workflow → Platform API**:

```bash
# Register completed namespace with Platform API
curl -X POST \
  -H "Authorization: Bearer ${PLATFORM_API_TOKEN}" \
  -d '{"name":"team-frontend-dev","status":"active"}' \
  "http://platform-api.platform-api.svc.cluster.local:3000/api/v1/namespaces"
```

## 📊 Monitoring & Observability

### Metrics Collection

**ServiceMonitors** configured for:

- Argo Server: API request metrics, authentication metrics
- Workflow Controller: Workflow execution metrics, queue depth, resource usage

### Key Metrics

- `argo_workflows_count{status}`: Workflow completion by status
- `argo_workflow_duration_seconds`: Workflow execution duration
- `argo_workflows_queue_depth`: Pending workflow count
- `argo_server_api_requests_total`: API request rate and errors

### Alerts

**Critical Alerts**:

- `ArgoServerDown`: Argo Server unavailable
- `ArgoWorkflowControllerDown`: Controller unavailable
- `PlatformAPIWorkflowIntegrationFailure`: Platform integration failures

**Warning Alerts**:

- `HighWorkflowFailureRate`: >10% workflow failure rate
- `LongRunningWorkflows`: Workflows running >1 hour
- `WorkflowQueueDepthHigh`: Queue depth >50 workflows

### Grafana Dashboard

Pre-configured dashboard includes:

- Workflow success rate trending
- Active workflow count
- Duration percentiles (P50, P95, P99)
- Platform API integration metrics
- Resource utilization trends

## 🛠️ Operations

### Common Tasks

**View workflow status**:

```bash
kubectl get workflows -n argo
kubectl describe workflow <workflow-name> -n argo
```

**Check logs**:

```bash
kubectl logs -l app.kubernetes.io/component=workflow-controller -n argo
kubectl logs -l app.kubernetes.io/component=argo-server -n argo
```

**Access Argo UI**:

```bash
kubectl port-forward svc/argo-server 2746:2746 -n argo
# Navigate to https://localhost:2746
```

### Troubleshooting

**Workflow Controller Issues**:

1. Check controller logs for errors
2. Verify RBAC permissions
3. Validate configmap configuration
4. Check node resource availability

**Argo Server Issues**:

1. Verify TLS certificate validity
2. Check Azure AD integration
3. Validate service discovery
4. Review network policies

**Platform API Integration**:

1. Verify service-to-service connectivity
2. Check authentication token validity
3. Validate workflow template parameters
4. Review platform API logs

### Scaling

**Horizontal Scaling**:

```bash
kubectl scale deployment argo-server --replicas=3 -n argo
```

**Vertical Scaling**:
Update resource limits in deployment manifests and apply.

### Backup & Recovery

**Workflow State**: Persisted in PostgreSQL (if configured)
**Workflow Templates**: Version controlled in Git
**Configuration**: Managed via GitOps
**Artifacts**: Stored in Azure Blob Storage

## 🔗 Integration Points

### External Dependencies

1. **Azure Services**:
   - Azure AD (Authentication)
   - Azure Storage (Artifacts)
   - Azure PostgreSQL (Persistence)
   - Azure Key Vault (Secrets)

2. **Cluster Services**:
   - Prometheus (Metrics)
   - Grafana (Dashboards)
   - External Secrets (Secret management)
   - Istio (Service mesh, optional)

3. **Platform Components**:
   - Platform API (Namespace management)
   - Platform UI (Workflow visualization)
   - Platform RBAC (Team integration)

### API Endpoints

- **Argo Server API**: `https://argo-workflows.azure.local/api/v1/`
- **Platform API Integration**: `http://platform-api.platform-api.svc.cluster.local:3000/api/v1/workflows`
- **Metrics**: `http://workflow-controller-metrics:9090/metrics`

## 📚 Additional Resources

- [Argo Workflows Documentation](https://argoproj.github.io/argo-workflows/)
- [Azure Workload Identity](https://azure.github.io/azure-workload-identity/)
- [Platform API Documentation](../platform-api/README.md)
- [AKS Best Practices](https://docs.microsoft.com/en-us/azure/aks/)
- [Kubernetes Security Best Practices](https://kubernetes.io/docs/concepts/security/)

## 🤝 Contributing

When making changes to Argo Workflows configuration:

1. Test changes in development environment first
2. Update monitoring and alerts as needed
3. Validate Platform API integration
4. Update documentation
5. Follow GitOps workflow for production deployment

## 📞 Support

For issues or questions:

- **Platform Team**: Create issue in Platform API repository
- **Argo Workflows**: Check upstream documentation
- **Azure Integration**: Consult Azure AKS documentation
- **Emergency**: Follow platform incident response procedures
