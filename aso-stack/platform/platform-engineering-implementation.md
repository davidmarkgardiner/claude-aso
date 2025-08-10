# Platform Engineering Implementation Guide

## 🚀 Practical Implementation of Namespace-as-a-Service

This guide provides concrete implementation steps, code examples, and configurations to build the NaaS platform described in the architecture document.

## 📋 Implementation Components

### 1. Backstage Developer Portal Setup

#### Installation and Configuration

```bash
# Create Backstage app
npx @backstage/create-app@latest --path ./developer-portal

cd developer-portal

# Install required plugins
yarn add --cwd packages/app @backstage/plugin-catalog
yarn add --cwd packages/app @backstage/plugin-kubernetes
yarn add --cwd packages/app @backstage/plugin-cost-insights
```

#### Custom Namespace Request Plugin

```typescript
// plugins/namespace-request/src/plugin.ts
import {
  createPlugin,
  createRouteRef,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'namespace-request',
});

export const namespaceRequestPlugin = createPlugin({
  id: 'namespace-request',
  routes: {
    root: rootRouteRef,
  },
});

export const NamespaceRequestPage = namespaceRequestPlugin.provide(
  createRoutableExtension({
    name: 'NamespaceRequestPage',
    component: () =>
      import('./components/NamespaceRequestPage').then(m => m.NamespaceRequestPage),
    mountPoint: rootRouteRef,
  }),
);
```

#### Namespace Request Form Component

```tsx
// plugins/namespace-request/src/components/NamespaceRequestPage.tsx
import React, { useState } from 'react';
import {
  Content,
  Header,
  Page,
  InfoCard,
} from '@backstage/core-components';
import {
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Box,
} from '@material-ui/core';
import { configApiRef, useApi, alertApiRef } from '@backstage/core-plugin-api';

export const NamespaceRequestPage = () => {
  const configApi = useApi(configApiRef);
  const alertApi = useApi(alertApiRef);
  
  const [formData, setFormData] = useState({
    namespaceName: '',
    team: '',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'isolated',
    features: [],
  });

  const resourceTiers = [
    { value: 'micro', label: 'Micro (1 CPU, 2GB RAM)', cost: '$50/month' },
    { value: 'small', label: 'Small (2 CPU, 4GB RAM)', cost: '$100/month' },
    { value: 'medium', label: 'Medium (4 CPU, 8GB RAM)', cost: '$200/month' },
    { value: 'large', label: 'Large (8 CPU, 16GB RAM)', cost: '$400/month' },
  ];

  const availableFeatures = [
    'istio-injection',
    'monitoring-enhanced', 
    'backup-enabled',
    'gpu-access',
    'database-access',
    'external-ingress',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const platformApiUrl = configApi.getString('backend.baseUrl');
      const response = await fetch(`${platformApiUrl}/api/platform/namespaces/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const result = await response.json();
        alertApi.post({
          message: `Namespace request submitted successfully! Request ID: ${result.requestId}`,
          severity: 'success',
        });
      } else {
        throw new Error(`Request failed: ${response.statusText}`);
      }
    } catch (error) {
      alertApi.post({
        message: `Failed to submit request: ${error.message}`,
        severity: 'error',
      });
    }
  };

  return (
    <Page themeId="tool">
      <Header title="Request New Namespace" subtitle="Self-service namespace provisioning" />
      <Content>
        <InfoCard title="Namespace Configuration">
          <form onSubmit={handleSubmit}>
            <Box display="flex" flexDirection="column" gap={3}>
              <TextField
                required
                label="Namespace Name"
                value={formData.namespaceName}
                onChange={(e) => setFormData({ ...formData, namespaceName: e.target.value })}
                helperText="Must be lowercase, alphanumeric with hyphens"
                pattern="^[a-z0-9-]+$"
              />
              
              <TextField
                required
                label="Team Name"
                value={formData.team}
                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                helperText="Your team identifier (e.g., frontend, backend, data)"
              />
              
              <FormControl>
                <InputLabel>Environment</InputLabel>
                <Select
                  value={formData.environment}
                  onChange={(e) => setFormData({ ...formData, environment: e.target.value as string })}
                >
                  <MenuItem value="development">Development</MenuItem>
                  <MenuItem value="staging">Staging</MenuItem>
                  <MenuItem value="production">Production</MenuItem>
                </Select>
              </FormControl>
              
              <FormControl>
                <InputLabel>Resource Tier</InputLabel>
                <Select
                  value={formData.resourceTier}
                  onChange={(e) => setFormData({ ...formData, resourceTier: e.target.value as string })}
                >
                  {resourceTiers.map((tier) => (
                    <MenuItem key={tier.value} value={tier.value}>
                      {tier.label} - {tier.cost}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl>
                <InputLabel>Network Policy</InputLabel>
                <Select
                  value={formData.networkPolicy}
                  onChange={(e) => setFormData({ ...formData, networkPolicy: e.target.value as string })}
                >
                  <MenuItem value="isolated">Isolated (Recommended)</MenuItem>
                  <MenuItem value="team-shared">Team Shared</MenuItem>
                  <MenuItem value="open">Open (Development Only)</MenuItem>
                </Select>
              </FormControl>
              
              <Box>
                <InputLabel>Optional Features</InputLabel>
                <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
                  {availableFeatures.map((feature) => (
                    <Chip
                      key={feature}
                      label={feature}
                      clickable
                      color={formData.features.includes(feature) ? 'primary' : 'default'}
                      onClick={() => {
                        const newFeatures = formData.features.includes(feature)
                          ? formData.features.filter(f => f !== feature)
                          : [...formData.features, feature];
                        setFormData({ ...formData, features: newFeatures });
                      }}
                    />
                  ))}
                </Box>
              </Box>
              
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
              >
                Request Namespace
              </Button>
            </Box>
          </form>
        </InfoCard>
      </Content>
    </Page>
  );
};
```

### 2. Platform API Backend

#### Express.js API Server

```typescript
// platform-api/src/app.ts
import express from 'express';
import cors from 'cors';
import { namespaceRouter } from './routes/namespaces';
import { catalogRouter } from './routes/catalog';
import { analyticsRouter } from './routes/analytics';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';

const app = express();

app.use(cors());
app.use(express.json());
app.use(authMiddleware);
app.use(rateLimitMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/platform/namespaces', namespaceRouter);
app.use('/api/platform/catalog', catalogRouter);
app.use('/api/platform/analytics', analyticsRouter);

export default app;
```

#### Namespace Provisioning Service

```typescript
// platform-api/src/services/namespaceProvisioning.ts
import { k8s } from '@kubernetes/client-node';
import { ArgoWorkflowsApi } from './argoWorkflows';
import { CapsuleApi } from './capsule';

export interface NamespaceRequest {
  namespaceName: string;
  team: string;
  environment: string;
  resourceTier: string;
  networkPolicy: string;
  features: string[];
  requestedBy: string;
}

export class NamespaceProvisioningService {
  private kubernetesClient: k8s.CoreV1Api;
  private argoClient: ArgoWorkflowsApi;
  private capsuleClient: CapsuleApi;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    this.kubernetesClient = kc.makeApiClient(k8s.CoreV1Api);
    this.argoClient = new ArgoWorkflowsApi(kc);
    this.capsuleClient = new CapsuleApi(kc);
  }

  async provisionNamespace(request: NamespaceRequest): Promise<string> {
    // Generate request ID
    const requestId = `ns-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Validate request
    await this.validateRequest(request);
    
    // Create Argo Workflow for provisioning
    const workflowSpec = this.generateWorkflowSpec(request, requestId);
    
    try {
      // Submit workflow
      const workflow = await this.argoClient.submitWorkflow(workflowSpec);
      
      // Store request metadata
      await this.storeRequestMetadata(requestId, request, workflow.metadata.name);
      
      return requestId;
    } catch (error) {
      console.error('Failed to provision namespace:', error);
      throw new Error(`Provisioning failed: ${error.message}`);
    }
  }

  private async validateRequest(request: NamespaceRequest): Promise<void> {
    // Check namespace naming conventions
    const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!namePattern.test(request.namespaceName)) {
      throw new Error('Invalid namespace name format');
    }
    
    // Check if namespace already exists
    try {
      await this.kubernetesClient.readNamespace(request.namespaceName);
      throw new Error('Namespace already exists');
    } catch (error) {
      if (error.response?.statusCode !== 404) {
        throw error;
      }
      // 404 is expected - namespace doesn't exist, which is good
    }
    
    // Check team quotas
    const teamNamespaces = await this.getTeamNamespaces(request.team);
    const teamQuota = await this.getTeamQuota(request.team);
    
    if (teamNamespaces.length >= teamQuota.maxNamespaces) {
      throw new Error(`Team ${request.team} has reached namespace quota limit`);
    }
  }

  private generateWorkflowSpec(request: NamespaceRequest, requestId: string) {
    const resourceTierConfig = this.getResourceTierConfig(request.resourceTier);
    
    return {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: `provision-namespace-${requestId}`,
        namespace: 'argo',
        labels: {
          'platform.io/request-id': requestId,
          'platform.io/team': request.team,
          'platform.io/environment': request.environment,
        },
      },
      spec: {
        entrypoint: 'provision-namespace',
        arguments: {
          parameters: [
            { name: 'namespace-name', value: request.namespaceName },
            { name: 'team-name', value: request.team },
            { name: 'environment', value: request.environment },
            { name: 'resource-tier', value: request.resourceTier },
            { name: 'network-policy', value: request.networkPolicy },
            { name: 'features', value: JSON.stringify(request.features) },
            { name: 'cpu-limit', value: resourceTierConfig.cpuLimit },
            { name: 'memory-limit', value: resourceTierConfig.memoryLimit },
            { name: 'storage-quota', value: resourceTierConfig.storageQuota },
          ],
        },
        templates: [
          {
            name: 'provision-namespace',
            dag: {
              tasks: [
                {
                  name: 'create-namespace',
                  template: 'create-namespace',
                },
                {
                  name: 'apply-resource-quotas',
                  template: 'apply-resource-quotas',
                  dependencies: ['create-namespace'],
                },
                {
                  name: 'setup-rbac',
                  template: 'setup-rbac', 
                  dependencies: ['create-namespace'],
                },
                {
                  name: 'apply-network-policies',
                  template: 'apply-network-policies',
                  dependencies: ['create-namespace'],
                },
                {
                  name: 'setup-monitoring',
                  template: 'setup-monitoring',
                  dependencies: ['create-namespace'],
                },
                {
                  name: 'configure-istio',
                  template: 'configure-istio',
                  dependencies: ['create-namespace'],
                  when: '{{workflow.parameters.features}} contains "istio-injection"',
                },
                {
                  name: 'setup-backup',
                  template: 'setup-backup',
                  dependencies: ['create-namespace'],
                  when: '{{workflow.parameters.features}} contains "backup-enabled"',
                },
                {
                  name: 'notify-completion',
                  template: 'notify-completion',
                  dependencies: [
                    'apply-resource-quotas',
                    'setup-rbac', 
                    'apply-network-policies',
                    'setup-monitoring',
                  ],
                },
              ],
            },
          },
          // Template definitions would be loaded from external files
          ...this.loadWorkflowTemplates(),
        ],
      },
    };
  }

  private getResourceTierConfig(tier: string) {
    const tiers = {
      micro: { cpuLimit: '1', memoryLimit: '2Gi', storageQuota: '10Gi' },
      small: { cpuLimit: '2', memoryLimit: '4Gi', storageQuota: '20Gi' },
      medium: { cpuLimit: '4', memoryLimit: '8Gi', storageQuota: '50Gi' },
      large: { cpuLimit: '8', memoryLimit: '16Gi', storageQuota: '100Gi' },
    };
    
    return tiers[tier] || tiers.small;
  }

  // Additional methods...
  private async getTeamNamespaces(team: string): Promise<string[]> {
    // Implementation to get team's existing namespaces
  }
  
  private async getTeamQuota(team: string): Promise<{ maxNamespaces: number }> {
    // Implementation to get team quota limits
  }
}
```

### 3. Argo Workflow Templates

#### Core Namespace Creation Template

```yaml
# workflow-templates/create-namespace.yaml
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: create-namespace-template
  namespace: argo
spec:
  templates:
  - name: create-namespace
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
      - name: environment
    script:
      image: bitnami/kubectl:1.28
      command: [bash]
      source: |
        set -e
        echo "Creating namespace {{inputs.parameters.namespace-name}}..."
        
        # Create namespace with proper labels
        cat <<EOF | kubectl apply -f -
        apiVersion: v1
        kind: Namespace
        metadata:
          name: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
            platform.io/team: {{inputs.parameters.team-name}}
            platform.io/environment: {{inputs.parameters.environment}}
            platform.io/created: $(date -Iseconds)
            capsule.clastix.io/tenant: {{inputs.parameters.team-name}}
          annotations:
            platform.io/provisioned-by: "namespace-as-a-service"
            platform.io/provisioned-at: $(date -Iseconds)
        EOF
        
        echo "Namespace {{inputs.parameters.namespace-name}} created successfully"

  - name: apply-resource-quotas
    inputs:
      parameters:
      - name: namespace-name
      - name: cpu-limit
      - name: memory-limit
      - name: storage-quota
    script:
      image: bitnami/kubectl:1.28
      command: [bash]
      source: |
        set -e
        echo "Applying resource quotas to {{inputs.parameters.namespace-name}}..."
        
        # Create ResourceQuota
        cat <<EOF | kubectl apply -f -
        apiVersion: v1
        kind: ResourceQuota
        metadata:
          name: {{inputs.parameters.namespace-name}}-quota
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
        spec:
          hard:
            requests.cpu: "{{inputs.parameters.cpu-limit}}"
            requests.memory: "{{inputs.parameters.memory-limit}}"
            limits.cpu: "{{inputs.parameters.cpu-limit}}"
            limits.memory: "{{inputs.parameters.memory-limit}}"
            persistentvolumeclaims: "10"
            requests.storage: "{{inputs.parameters.storage-quota}}"
            services: "10"
            secrets: "20"
            configmaps: "20"
        EOF
        
        # Create LimitRange for default values
        cat <<EOF | kubectl apply -f -
        apiVersion: v1
        kind: LimitRange
        metadata:
          name: {{inputs.parameters.namespace-name}}-limits
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
        spec:
          limits:
          - default:
              cpu: 500m
              memory: 512Mi
            defaultRequest:
              cpu: 100m
              memory: 128Mi
            type: Container
        EOF
        
        echo "Resource quotas applied successfully"

  - name: setup-rbac
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
    script:
      image: bitnami/kubectl:1.28
      command: [bash]
      source: |
        set -e
        echo "Setting up RBAC for {{inputs.parameters.namespace-name}}..."
        
        # Create RoleBinding for team developers
        cat <<EOF | kubectl apply -f -
        apiVersion: rbac.authorization.k8s.io/v1
        kind: RoleBinding
        metadata:
          name: {{inputs.parameters.team-name}}-developers
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
        subjects:
        - kind: Group
          name: {{inputs.parameters.team-name}}-developers
          apiGroup: rbac.authorization.k8s.io
        roleRef:
          kind: ClusterRole
          name: platform-namespace-developer
          apiGroup: rbac.authorization.k8s.io
        EOF
        
        # Create RoleBinding for team admins
        cat <<EOF | kubectl apply -f -
        apiVersion: rbac.authorization.k8s.io/v1
        kind: RoleBinding
        metadata:
          name: {{inputs.parameters.team-name}}-admins
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
        subjects:
        - kind: Group
          name: {{inputs.parameters.team-name}}-admins
          apiGroup: rbac.authorization.k8s.io
        roleRef:
          kind: ClusterRole
          name: platform-namespace-admin
          apiGroup: rbac.authorization.k8s.io
        EOF
        
        echo "RBAC configured successfully"

  - name: apply-network-policies
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
      - name: network-policy
    script:
      image: bitnami/kubectl:1.28
      command: [bash]
      source: |
        set -e
        echo "Applying network policies to {{inputs.parameters.namespace-name}}..."
        
        case "{{inputs.parameters.network-policy}}" in
          "isolated")
            cat <<EOF | kubectl apply -f -
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        metadata:
          name: {{inputs.parameters.namespace-name}}-isolated
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
        spec:
          podSelector: {}
          policyTypes: ["Ingress", "Egress"]
          ingress:
          # Allow from same namespace
          - from:
            - namespaceSelector:
                matchLabels:
                  metadata.name: {{inputs.parameters.namespace-name}}
          # Allow from shared services
          - from:
            - namespaceSelector:
                matchLabels:
                  platform.io/shared-services: "true"
            ports:
            - protocol: TCP
              port: 443
          egress:
          # Allow to same team namespaces
          - to:
            - namespaceSelector:
                matchLabels:
                  platform.io/team: {{inputs.parameters.team-name}}
          # Allow DNS
          - to: []
            ports:
            - protocol: UDP
              port: 53
          # Allow HTTPS egress
          - to: []
            ports:
            - protocol: TCP
              port: 443
        EOF
            ;;
          "team-shared")
            cat <<EOF | kubectl apply -f -
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        metadata:
          name: {{inputs.parameters.namespace-name}}-team-shared
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
        spec:
          podSelector: {}
          policyTypes: ["Ingress", "Egress"]
          ingress:
          # Allow from team namespaces
          - from:
            - namespaceSelector:
                matchLabels:
                  platform.io/team: {{inputs.parameters.team-name}}
          # Allow from shared services  
          - from:
            - namespaceSelector:
                matchLabels:
                  platform.io/shared-services: "true"
          egress:
          # Allow to team namespaces
          - to:
            - namespaceSelector:
                matchLabels:
                  platform.io/team: {{inputs.parameters.team-name}}
          # Allow to shared services
          - to:
            - namespaceSelector:
                matchLabels:
                  platform.io/shared-services: "true"
          # Allow DNS and external HTTPS
          - to: []
            ports:
            - protocol: UDP
              port: 53
            - protocol: TCP
              port: 443
        EOF
            ;;
        esac
        
        echo "Network policies applied successfully"

  - name: setup-monitoring
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
    script:
      image: bitnami/kubectl:1.28
      command: [bash]
      source: |
        set -e
        echo "Setting up monitoring for {{inputs.parameters.namespace-name}}..."
        
        # Create ServiceMonitor for automatic service discovery
        cat <<EOF | kubectl apply -f -
        apiVersion: monitoring.coreos.com/v1
        kind: ServiceMonitor
        metadata:
          name: {{inputs.parameters.namespace-name}}-services
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
            team: {{inputs.parameters.team-name}}
        spec:
          selector:
            matchLabels:
              monitoring: enabled
          endpoints:
          - port: metrics
            interval: 30s
            path: /metrics
        EOF
        
        # Create PrometheusRule for namespace-specific alerts
        cat <<EOF | kubectl apply -f -
        apiVersion: monitoring.coreos.com/v1
        kind: PrometheusRule
        metadata:
          name: {{inputs.parameters.namespace-name}}-alerts
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
            team: {{inputs.parameters.team-name}}
        spec:
          groups:
          - name: {{inputs.parameters.namespace-name}}-resource-alerts
            rules:
            - alert: HighCPUUsage
              expr: |
                sum(rate(container_cpu_usage_seconds_total{namespace="{{inputs.parameters.namespace-name}}"}[5m])) > 0.8
              for: 5m
              labels:
                severity: warning
                namespace: {{inputs.parameters.namespace-name}}
                team: {{inputs.parameters.team-name}}
              annotations:
                summary: "High CPU usage in namespace {{inputs.parameters.namespace-name}}"
                
            - alert: HighMemoryUsage
              expr: |
                sum(container_memory_working_set_bytes{namespace="{{inputs.parameters.namespace-name}}"}) > 0.8
              for: 5m  
              labels:
                severity: warning
                namespace: {{inputs.parameters.namespace-name}}
                team: {{inputs.parameters.team-name}}
              annotations:
                summary: "High memory usage in namespace {{inputs.parameters.namespace-name}}"
        EOF
        
        echo "Monitoring setup completed successfully"
```

### 4. Capsule Multi-Tenancy Configuration

#### Tenant Template

```yaml
# capsule-config/tenant-template.yaml
apiVersion: capsule.clastix.io/v1beta2
kind: TenantTemplate
metadata:
  name: standard-tenant-template
spec:
  spec:
    # Maximum namespaces per tenant
    namespaceOptions:
      quota: 20
      forbiddenListOptions:
        exactMatch: ["kube-system", "kube-public", "kube-node-lease", "capsule-system"]
        regexMatch: ["^kube-.*", "^openshift-.*"]
    
    # Default network policies
    networkPolicies:
      items:
      - spec:
          podSelector: {}
          policyTypes: ["Ingress", "Egress"]
          ingress:
          - from:
            - namespaceSelector:
                matchLabels:
                  name: {{ .metadata.namespace }}
          egress:
          - to:
            - namespaceSelector:
                matchLabels:
                  name: {{ .metadata.namespace }}
          - to: []
            ports:
            - protocol: UDP
              port: 53
            - protocol: TCP
              port: 443
    
    # Resource quotas
    limitRanges:
      items:
      - limits:
        - default:
            cpu: 500m
            memory: 512Mi
          defaultRequest:
            cpu: 100m
            memory: 128Mi
          type: Container
        - max:
            cpu: 2
            memory: 4Gi
          type: Container
    
    # Service account restrictions
    serviceAccountOptions:
      additionalMetadata:
        labels:
          tenant: {{ .spec.owners[0].name }}
    
    # Ingress configuration
    ingressOptions:
      hostnameCollisionPolicy: Allowed
      allowedClasses:
        allowed: ["nginx", "istio"]
        allowedRegex: "^(nginx|istio).*"
    
    # Storage classes
    storageClasses:
      allowed: ["managed-premium", "azurefile-premium"]
      allowedRegex: "^(managed|azure).*"
    
    # Registry restrictions
    containerRegistries:
      allowed: 
        - "aksprodregistry001.azurecr.io"
        - "mcr.microsoft.com"
        - "docker.io"
      allowedRegex: "^(aksprodregistry001|mcr\\.microsoft\\.com|docker\\.io).*"
```

#### Team-Specific Tenant

```yaml
# capsule-config/team-frontend-tenant.yaml
apiVersion: capsule.clastix.io/v1beta2
kind: Tenant
metadata:
  name: team-frontend
  labels:
    team: frontend
    department: engineering
spec:
  # Team owners (Azure AD groups)
  owners:
  - name: "frontend-team-admins"
    kind: Group
    clusterRoles:
    - "admin"
    - "capsule-namespace-deleter"
  - name: "frontend-team-developers"  
    kind: Group
    clusterRoles:
    - "edit"
  
  # Namespace quota
  namespaceOptions:
    quota: 15  # Frontend team gets 15 namespaces max
    forbiddenListOptions:
      exactMatch: ["kube-system", "capsule-system", "istio-system"]
  
  # Custom resource quotas for frontend workloads
  resourceQuota:
    items:
    - hard:
        limits.cpu: "20"      # Total CPU limit across all namespaces
        limits.memory: "40Gi" # Total memory limit
        requests.storage: "500Gi"
        persistentvolumeclaims: "50"
        services.loadbalancers: "5"  # Max 5 LoadBalancer services
        count/ingresses.networking.k8s.io: "20"
  
  # Frontend-specific limit ranges
  limitRanges:
    items:
    - limits:
      - default:
          cpu: 200m      # Smaller default for frontend apps
          memory: 256Mi
        defaultRequest:
          cpu: 50m
          memory: 64Mi
        type: Container
  
  # Network policies for frontend apps
  networkPolicies:
    items:
    - spec:
        podSelector: {}
        policyTypes: ["Ingress", "Egress"]
        ingress:
        # Allow from same tenant
        - from:
          - namespaceSelector:
              matchLabels:
                capsule.clastix.io/tenant: team-frontend
        # Allow from ingress controllers
        - from:
          - namespaceSelector:
              matchLabels:
                name: istio-system
        egress:
        # Allow to backend services (team-backend tenant)
        - to:
          - namespaceSelector:
              matchLabels:
                capsule.clastix.io/tenant: team-backend
          ports:
          - protocol: TCP
            port: 8080
          - protocol: TCP
            port: 443
        # Allow to external APIs
        - to: []
          ports:
          - protocol: TCP
            port: 443
        # Allow DNS
        - to: []
          ports:
          - protocol: UDP
            port: 53
  
  # Additional metadata propagated to namespaces
  additionalRoleBindings:
  - clusterRoleName: view
    subjects:
    - kind: Group
      name: "platform-team"
      apiGroup: rbac.authorization.k8s.io
  
  # Ingress hostnames allowed for this tenant
  ingressOptions:
    hostnameCollisionPolicy: Allowed
    allowedHostnames:
      allowed: [".frontend.davidmarkgardiner.co.uk"]
      allowedRegex: "^.*\\.frontend\\.davidmarkgardiner\\.co\\.uk$"
  
  # Node selector for frontend workloads
  nodeSelector:
    workload-type: "frontend"
    kubernetes.io/arch: "amd64"
  
  # Priority class for frontend pods
  priorityClasses:
    allowed: ["frontend-priority", "system-cluster-critical"]
```

### 5. Gatekeeper Policy Templates

#### Security Policy Templates

```yaml
# gatekeeper-policies/required-labels.yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  name: k8srequiredlabels
spec:
  crd:
    spec:
      names:
        kind: K8sRequiredLabels
      validation:
        type: object
        properties:
          labels:
            type: array
            items:
              type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8srequiredlabels
        
        violation[{"msg": msg}] {
          required := input.parameters.labels
          provided := input.review.object.metadata.labels
          missing := required[_]
          not provided[missing]
          msg := sprintf("Missing required label: %v", [missing])
        }

---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: platform-required-labels
spec:
  match:
    kinds:
    - apiGroups: ["apps"]
      kinds: ["Deployment", "StatefulSet", "DaemonSet"]
    - apiGroups: [""]
      kinds: ["Service", "ConfigMap", "Secret"]
    excludedNamespaces: ["kube-system", "kube-public", "gatekeeper-system"]
  parameters:
    labels: 
      - "platform.io/team"
      - "platform.io/environment"
      - "platform.io/managed"
```

#### Resource Constraints

```yaml
# gatekeeper-policies/resource-limits.yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  name: k8scontainerresources
spec:
  crd:
    spec:
      names:
        kind: K8sContainerResources
      validation:
        type: object
        properties:
          maxCpu:
            type: string
          maxMemory:
            type: string
          requireResources:
            type: boolean
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8scontainerresources
        
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          input.parameters.requireResources
          not container.resources.requests
          msg := "Container must have resource requests defined"
        }
        
        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          cpu_limit := container.resources.limits.cpu
          max_cpu := input.parameters.maxCpu
          cpu_exceeds_limit(cpu_limit, max_cpu)
          msg := sprintf("CPU limit %v exceeds maximum allowed %v", [cpu_limit, max_cpu])
        }
        
        cpu_exceeds_limit(limit, max) {
          limit_num := parse_cpu(limit)
          max_num := parse_cpu(max)
          limit_num > max_num
        }
        
        parse_cpu(cpu) = num {
          endswith(cpu, "m")
          num := to_number(trim_suffix(cpu, "m"))
        }
        
        parse_cpu(cpu) = num {
          not endswith(cpu, "m")
          num := to_number(cpu) * 1000
        }

---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sContainerResources
metadata:
  name: container-resource-limits
spec:
  match:
    kinds:
    - apiGroups: ["apps"]
      kinds: ["Deployment", "StatefulSet", "DaemonSet"]
    excludedNamespaces: ["kube-system", "istio-system"]
  parameters:
    maxCpu: "2000m"    # 2 CPU max per container
    maxMemory: "4Gi"   # 4GB max per container
    requireResources: true
```

### 6. Monitoring and Alerting Configuration

#### Namespace-Specific Grafana Dashboard Template

```json
{
  "dashboard": {
    "id": null,
    "title": "Namespace: ${namespace}",
    "tags": ["namespace", "${team}", "platform"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Pod Status Overview",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(kube_pod_status_phase{namespace=\"${namespace}\", phase=\"Running\"})",
            "legendFormat": "Running"
          },
          {
            "expr": "sum(kube_pod_status_phase{namespace=\"${namespace}\", phase=\"Pending\"})", 
            "legendFormat": "Pending"
          },
          {
            "expr": "sum(kube_pod_status_phase{namespace=\"${namespace}\", phase=\"Failed\"})",
            "legendFormat": "Failed"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(container_cpu_usage_seconds_total{namespace=\"${namespace}\"}[5m])) by (pod)",
            "legendFormat": "{{ pod }}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0},
        "yAxes": [
          {"unit": "percent", "max": 100}
        ]
      },
      {
        "id": 3,
        "title": "Memory Usage",
        "type": "graph", 
        "targets": [
          {
            "expr": "sum(container_memory_working_set_bytes{namespace=\"${namespace}\"}) by (pod)",
            "legendFormat": "{{ pod }}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8},
        "yAxes": [
          {"unit": "bytes"}
        ]
      },
      {
        "id": 4,
        "title": "Network I/O",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(container_network_receive_bytes_total{namespace=\"${namespace}\"}[5m])) by (pod)",
            "legendFormat": "RX {{ pod }}"
          },
          {
            "expr": "sum(rate(container_network_transmit_bytes_total{namespace=\"${namespace}\"}[5m])) by (pod)", 
            "legendFormat": "TX {{ pod }}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8},
        "yAxes": [
          {"unit": "Bps"}
        ]
      },
      {
        "id": 5,
        "title": "Cost Analysis (Last 7 Days)",
        "type": "table",
        "targets": [
          {
            "expr": "avg_over_time(namespace_cost_total{namespace=\"${namespace}\"}[7d])",
            "format": "table", 
            "instant": true
          }
        ],
        "gridPos": {"h": 8, "w": 24, "x": 0, "y": 16}
      }
    ],
    "templating": {
      "list": [
        {
          "name": "namespace",
          "type": "query",
          "query": "label_values(kube_namespace_labels, namespace)",
          "current": {"text": "", "value": ""}
        },
        {
          "name": "team", 
          "type": "query",
          "query": "label_values(kube_namespace_labels{namespace=\"$namespace\"}, label_platform_io_team)",
          "current": {"text": "", "value": ""}
        }
      ]
    },
    "time": {"from": "now-1h", "to": "now"},
    "refresh": "30s"
  }
}
```

---

## 🚦 Implementation Timeline

### Week 1-2: Foundation Setup
- [ ] Install and configure Backstage portal
- [ ] Set up basic API backend with authentication
- [ ] Deploy Capsule for multi-tenancy
- [ ] Create initial workflow templates

### Week 3-4: Core Provisioning
- [ ] Implement namespace provisioning workflows
- [ ] Set up automatic RBAC configuration
- [ ] Configure basic monitoring per namespace
- [ ] Test end-to-end provisioning flow

### Week 5-6: Advanced Features  
- [ ] Implement network policy automation
- [ ] Add cost tracking per namespace
- [ ] Set up policy enforcement with Gatekeeper
- [ ] Create team-specific dashboards

### Week 7-8: Production Readiness
- [ ] Add comprehensive monitoring and alerting
- [ ] Implement disaster recovery procedures
- [ ] Complete security hardening
- [ ] Conduct load testing and optimization

---

## 📊 Success Metrics

- **Provisioning Speed**: < 5 minutes from request to ready namespace
- **Self-Service Adoption**: > 90% of namespace requests via portal
- **Platform Reliability**: 99.9% API availability
- **Developer Satisfaction**: > 4.5/5 rating
- **Cost Optimization**: 20% reduction in infrastructure waste

This implementation guide provides concrete steps to build your Namespace-as-a-Service platform, transforming your current infrastructure-centric approach into a modern, self-service platform engineering solution.