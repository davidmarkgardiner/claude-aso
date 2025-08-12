# Platform-as-a-Service: Namespace-as-a-Service Architecture

A comprehensive Azure Service Operator (ASO) demonstration platform showcasing Kubernetes-native infrastructure management and self-service multi-tenancy.

## 🏗️ Architecture Overview

This platform demonstrates enterprise-grade patterns for:

- **Infrastructure as Code** via Azure Service Operator (ASO)
- **Self-service namespace provisioning** with RBAC controls
- **Service mesh integration** with Istio
- **GitOps deployment** workflows
- **Real-time cluster state tracking**

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Platform UI   │────│  Platform API   │────│  Kubernetes     │
│   React/TS      │    │   Node.js/TS    │    │   Cluster       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────│ State Tracking  │──────────────┘
                        │   Architecture  │
                        └─────────────────┘
```

## 🔄 State Tracking Architecture

### 1. Real-time Cluster Integration

**Direct Kubernetes API Access** (`platform-api/src/services/kubernetesClient.ts`)

- **Multiple API Clients**: Core, Apps, RBAC, Networking, CustomObjects
- **Context-aware Configuration**: Supports in-cluster, kubeconfig, and managed identity auth
- **Resource Lifecycle Management**: Create, read, update, delete operations

```typescript
// Direct cluster state queries
async getNamespace(name: string): Promise<k8s.V1Namespace | null>
async listNamespaces(labelSelector?: string): Promise<k8s.V1Namespace[]>
```

### 2. Provisioning Request Lifecycle

**State Flow** (`platform-ui/src/types/simple.ts`)

```typescript
interface ProvisioningRequest {
  requestId: string;
  status: "pending" | "provisioning" | "completed" | "failed";
  workflowStatus?: {
    phase: string;
    message: string;
  };
}
```

**Status Tracking Pattern**:

1. **Request Submission** → `pending`
2. **Kubernetes Operations** → `provisioning`
3. **Resource Creation** → `completed`
4. **Error Handling** → `failed`

### 3. UI State Management

**API Integration Layer** (`platform-ui/src/services/api.ts`)

```typescript
class PlatformApiClient {
  // Real-time status polling
  async getProvisioningStatus(requestId: string): Promise<ProvisioningRequest>;

  // Team resource tracking
  async getTeamNamespaces(
    team: string,
  ): Promise<Array<Record<string, unknown>>>;

  // Health monitoring
  async checkHealth(): Promise<{ status: string; timestamp: string }>;
}
```

**Dashboard Metrics** (`platform-ui/src/pages/Dashboard.tsx`)

- **Total Namespaces**: Live cluster count
- **Active Deployments**: Cross-namespace deployment tracking
- **Success Rate**: Provisioning success percentage
- **Average Provision Time**: Performance metrics

### 4. Resource Labeling Strategy

**Platform-managed Resources** (`platform-api/src/services/kubernetesClient.ts:56-64`)

```yaml
metadata:
  labels:
    platform.io/managed: "true"
    platform.io/team: "frontend"
    platform.io/environment: "development"
  annotations:
    platform.io/provisioned-by: "namespace-as-a-service"
    platform.io/provisioned-at: "2024-01-15T10:30:00Z"
```

**Benefits**:

- **Resource Discovery**: Query all platform-managed resources
- **Ownership Tracking**: Team and environment attribution
- **Automated Cleanup**: Bulk operations on labeled resources
- **Audit Trail**: Provisioning metadata

## 🚀 Quick Start

### Platform UI Development

```bash
cd platform-ui
npm install
npm run dev
# Access at http://localhost:5173
```

### Platform API Development

```bash
cd platform-api
npm install
npm run dev
# API available at http://localhost:3000
```

### Kubernetes Cluster Setup

```bash
# Configure cluster access
export KUBECONFIG=./aks-kubeconfig

# Deploy platform components
kubectl apply -k apps/platform-api/
kubectl apply -k istio-apps/platform-api/
```

## 📊 State Monitoring Capabilities

### Real-time Tracking

- **Namespace Lifecycle**: Creation, configuration, deletion
- **Resource Quotas**: CPU, memory, storage limits
- **RBAC Policies**: Team access controls
- **Network Policies**: Traffic isolation rules

### Operational Insights

- **Provisioning Performance**: Time-to-ready metrics
- **Resource Utilization**: Team-based usage patterns
- **Error Rates**: Failure analysis and debugging
- **System Health**: Component status monitoring

### Data Flow Architecture

```
User Request → UI Form → API Validation → Kubernetes Operation → Status Update → UI Refresh
     ↓              ↓           ↓                ↓                 ↓            ↓
   Form State → API Call → K8s Client → Resource Create → Event Log → Dashboard
```

## 🛠️ Technology Stack

### Frontend

- **React 19** with TypeScript
- **TailwindCSS** for styling
- **React Router** for navigation
- **Vite** for build tooling

### Backend

- **Node.js** with TypeScript
- **@kubernetes/client-node** for cluster integration
- **Express.js** REST API framework
- **Structured logging** with correlation IDs

### Infrastructure

- **Azure Service Operator (ASO)** for infrastructure provisioning
- **Istio Service Mesh** for traffic management
- **FluxCD** for GitOps deployment
- **cert-manager** for TLS certificate automation

## 🔧 Configuration

### Environment Variables

```bash
# Platform API
NODE_ENV=development
PORT=3000
KUBE_CONTEXT=your-cluster-context
KUBE_NAMESPACE=platform-system

# Platform UI
VITE_API_BASE_URL=http://localhost:3000
VITE_ENVIRONMENT=development
```

### Kubernetes Context

```bash
# List available contexts
kubectl config get-contexts

# Set platform context
kubectl config use-context your-platform-context
```

## 📈 Monitoring and Observability

### Built-in Monitoring

- **Request Correlation**: Every API call tracked with correlation ID
- **Error Handling**: Structured error responses with context
- **Performance Metrics**: Response times and success rates
- **Resource Tracking**: Kubernetes resource lifecycle events

### Future Enhancements

- **Prometheus Metrics**: Operational metrics collection
- **Event Sourcing**: Complete audit trail of all operations
- **WebSocket Updates**: Real-time UI state synchronization
- **Resource Topology**: Visual cluster resource relationships

## 🎯 Key Features

### Self-Service Provisioning

- **Template-based Deployment**: Standardized resource configurations
- **Multi-tier Resource Plans**: Micro, small, medium, large resource allocations
- **Network Policy Options**: Isolated, team-shared, or open networking
- **Feature Toggles**: Optional capabilities (monitoring, backup, etc.)

### Security & Compliance

- **RBAC Integration**: Kubernetes-native access controls
- **Network Segmentation**: Istio-based traffic policies
- **Resource Quotas**: Prevent resource exhaustion
- **Audit Logging**: Complete operational audit trail

### Developer Experience

- **Instant Feedback**: Real-time provisioning status
- **Error Recovery**: Clear error messages and remediation guidance
- **Resource Discovery**: Easy access to team resources
- **Performance Insights**: Usage analytics and optimization recommendations

## 📚 Documentation

- **Agent Configurations**: `.claude/agents/` - Specialized automation agents
- **ASO Manifests**: `aso-stack/` - Azure resource definitions
- **Application Configs**: `apps/` - GitOps deployment manifests
- **Istio Configurations**: `istio-apps/` - Service mesh policies
- **Platform Security**: `SECURITY.md` files in component directories

## 🤝 Contributing

1. **Create Feature Branch**: `git checkout -b feature/feature-name`
2. **Link GitHub Issue**: Create issue and reference in branch
3. **Use Specialized Agents**: Leverage `.claude/agents/build-aks/` for complex tasks
4. **Run Tests**: `npm test` in both platform-api and platform-ui
5. **Security Scan**: `./scripts/scan-secrets.sh` before commits

## 🏷️ License

This project demonstrates enterprise patterns for Azure Service Operator and Kubernetes platform engineering.
