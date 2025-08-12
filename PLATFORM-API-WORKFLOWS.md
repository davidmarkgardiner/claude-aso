# Platform API with Argo Workflows Implementation Guide

## 🤔 Why Argo Workflows for Backstage Platform API?

### Background: This is NOT Standard Backstage

This solution uses **Argo Workflows** for namespace provisioning, which is **NOT the standard Backstage approach**. Here's why this architectural decision was made:

### Standard Backstage vs. Our Custom Platform API

| Aspect                 | Standard Backstage                                   | Our Custom Platform API                      |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------- |
| **Template Engine**    | Built-in Software Templates with Cookiecutter/Yeoman | Custom Platform API with Argo Workflows      |
| **Scaffolding**        | File-based template scaffolding                      | Kubernetes resource orchestration            |
| **Orchestration**      | Simple shell scripts or webhook calls                | Complex multi-step workflow DAGs             |
| **State Management**   | Basic status tracking                                | Persistent workflow state with retries       |
| **Auditability**       | Limited audit trail                                  | Full workflow execution history              |
| **Complex Operations** | Limited to simple operations                         | Multi-step, conditional, parallel operations |

### 🎯 Why Argo Workflows Was Chosen

1. **Complex Namespace Provisioning Requirements**

   ```yaml
   # Example workflow steps:
   - Create namespace with labels/annotations
   - Apply resource quotas and limits
   - Setup RBAC (ServiceAccounts, Roles, RoleBindings)
   - Configure network policies
   - Install monitoring (ServiceMonitor, PodMonitor)
   - Setup Istio injection labels
   - Create backup policies
   - Configure ingress routes
   - Apply security policies
   - Verify health checks
   ```

2. **Enterprise-Grade Orchestration**
   - **Retry Logic**: Automatic retries on failures
   - **Parallel Execution**: Run independent tasks concurrently
   - **Conditional Logic**: Different paths based on environment/features
   - **Error Handling**: Comprehensive error recovery and rollback
   - **Auditability**: Full execution logs and history

3. **Integration with Kubernetes Ecosystem**
   - **Native Kubernetes**: Workflows run as Kubernetes resources
   - **GitOps Compatibility**: Workflow templates can be version-controlled
   - **RBAC Integration**: Fine-grained permissions for workflow execution
   - **Resource Management**: CPU/memory limits for workflow pods

4. **Enterprise Requirements**
   - **Compliance**: Full audit trail for namespace creation
   - **Approval Workflows**: Multi-step approval processes
   - **Cost Tracking**: Integration with cost management systems
   - **Security**: Secure execution environment with service accounts

### 🏗️ Alternative Approaches Considered

1. **Standard Backstage Templates**
   - ❌ Limited to simple file generation
   - ❌ No complex orchestration capabilities
   - ❌ Limited error handling and retry logic

2. **Direct Kubernetes API Calls**
   - ❌ No orchestration or state management
   - ❌ Manual error handling and rollback
   - ❌ Limited auditability

3. **Tekton Pipelines**
   - ✅ Good Kubernetes integration
   - ❌ Less mature ecosystem than Argo
   - ❌ More complex setup for simple workflows

4. **Custom Shell Scripts**
   - ❌ No state persistence or retry logic
   - ❌ Limited error handling
   - ❌ Hard to maintain and debug

## 🚀 Implementation Steps

### Prerequisites

- Kubernetes cluster (AKS, EKS, GKE, or on-premise)
- kubectl configured with cluster access
- Helm 3.x installed

### Step 1: Install Argo Workflows

#### 1.1 Create Namespace

```bash
kubectl create namespace argo-workflows
```

#### 1.2 Install Argo Workflows with Helm

```bash
# Add Argo Helm repository
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# Install Argo Workflows
helm install argo-workflows argo/argo-workflows \
  --namespace argo-workflows \
  --set workflow.serviceAccount.create=true \
  --set workflow.rbac.create=true \
  --set server.enabled=true \
  --set server.ingress.enabled=true \
  --set server.ingress.hosts[0]=argo-workflows.your-domain.com
```

#### 1.3 Alternative: Direct Kubernetes Manifests

```bash
# Quick install (not for production)
kubectl apply -n argo-workflows -f https://github.com/argoproj/argo-workflows/releases/download/v3.5.0/install.yaml
```

### Step 2: Configure RBAC for Platform API

Create service account and permissions for the Platform API to submit workflows:

```bash
# Create platform-provisioner service account
kubectl create -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: platform-provisioner
  namespace: argo-workflows
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: platform-provisioner
rules:
- apiGroups: ["argoproj.io"]
  resources: ["workflows", "workflowtemplates"]
  verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["namespaces", "resourcequotas", "limitranges", "serviceaccounts", "secrets", "configmaps"]
  verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["roles", "rolebindings", "clusterroles", "clusterrolebindings"]
  verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
- apiGroups: ["networking.k8s.io"]
  resources: ["networkpolicies", "ingresses"]
  verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
- apiGroups: ["monitoring.coreos.com"]
  resources: ["servicemonitors", "podmonitors"]
  verbs: ["create", "get", "list", "watch", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: platform-provisioner
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: platform-provisioner
subjects:
- kind: ServiceAccount
  name: platform-provisioner
  namespace: argo-workflows
EOF
```

### Step 3: Create Workflow Templates

#### 3.1 Namespace Creation Workflow Template

```bash
kubectl create -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: create-namespace-template
  namespace: argo-workflows
spec:
  serviceAccountName: platform-provisioner
  templates:
  - name: create-namespace
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
      - name: environment
    script:
      image: bitnami/kubectl:latest
      command: [sh]
      source: |
        cat <<EOF | kubectl apply -f -
        apiVersion: v1
        kind: Namespace
        metadata:
          name: {{inputs.parameters.namespace-name}}
          labels:
            platform.io/managed: "true"
            platform.io/team: "{{inputs.parameters.team-name}}"
            platform.io/environment: "{{inputs.parameters.environment}}"
            istio-injection: enabled
          annotations:
            platform.io/created-by: "platform-api"
            platform.io/created-at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        EOF
        echo "Namespace {{inputs.parameters.namespace-name}} created successfully"

  - name: apply-resource-quotas
    inputs:
      parameters:
      - name: namespace-name
      - name: cpu-limit
      - name: memory-limit
      - name: storage-quota
      - name: max-pods
      - name: max-services
    script:
      image: bitnami/kubectl:latest
      command: [sh]
      source: |
        cat <<EOF | kubectl apply -f -
        apiVersion: v1
        kind: ResourceQuota
        metadata:
          name: compute-quota
          namespace: {{inputs.parameters.namespace-name}}
        spec:
          hard:
            requests.cpu: "{{inputs.parameters.cpu-limit}}"
            requests.memory: "{{inputs.parameters.memory-limit}}"
            requests.storage: "{{inputs.parameters.storage-quota}}"
            persistentvolumeclaims: "10"
            pods: "{{inputs.parameters.max-pods}}"
            services: "{{inputs.parameters.max-services}}"
            secrets: "20"
            configmaps: "20"
        ---
        apiVersion: v1
        kind: LimitRange
        metadata:
          name: compute-limit-range
          namespace: {{inputs.parameters.namespace-name}}
        spec:
          limits:
          - default:
              cpu: "500m"
              memory: "512Mi"
            defaultRequest:
              cpu: "100m"
              memory: "128Mi"
            type: Container
        EOF
        echo "Resource quotas applied to {{inputs.parameters.namespace-name}}"

  - name: setup-rbac
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
    script:
      image: bitnami/kubectl:latest
      command: [sh]
      source: |
        cat <<EOF | kubectl apply -f -
        apiVersion: v1
        kind: ServiceAccount
        metadata:
          name: {{inputs.parameters.team-name}}-deployer
          namespace: {{inputs.parameters.namespace-name}}
        ---
        apiVersion: rbac.authorization.k8s.io/v1
        kind: Role
        metadata:
          namespace: {{inputs.parameters.namespace-name}}
          name: {{inputs.parameters.team-name}}-developer
        rules:
        - apiGroups: [""]
          resources: ["pods", "services", "configmaps", "secrets", "persistentvolumeclaims"]
          verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
        - apiGroups: ["apps"]
          resources: ["deployments", "replicasets", "statefulsets", "daemonsets"]
          verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
        - apiGroups: ["networking.k8s.io"]
          resources: ["ingresses", "networkpolicies"]
          verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
        ---
        apiVersion: rbac.authorization.k8s.io/v1
        kind: RoleBinding
        metadata:
          name: {{inputs.parameters.team-name}}-developers
          namespace: {{inputs.parameters.namespace-name}}
        subjects:
        - kind: User
          name: {{inputs.parameters.team-name}}@company.com
          apiGroup: rbac.authorization.k8s.io
        - kind: ServiceAccount
          name: {{inputs.parameters.team-name}}-deployer
          namespace: {{inputs.parameters.namespace-name}}
        roleRef:
          kind: Role
          name: {{inputs.parameters.team-name}}-developer
          apiGroup: rbac.authorization.k8s.io
        EOF
        echo "RBAC setup completed for {{inputs.parameters.namespace-name}}"

  - name: apply-network-policies
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
      - name: network-policy
    script:
      image: bitnami/kubectl:latest
      command: [sh]
      source: |
        if [ "{{inputs.parameters.network-policy}}" = "isolated" ]; then
          cat <<EOF | kubectl apply -f -
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        metadata:
          name: deny-all-ingress
          namespace: {{inputs.parameters.namespace-name}}
        spec:
          podSelector: {}
          policyTypes:
          - Ingress
        ---
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        metadata:
          name: allow-same-namespace
          namespace: {{inputs.parameters.namespace-name}}
        spec:
          podSelector: {}
          policyTypes:
          - Ingress
          ingress:
          - from:
            - namespaceSelector:
                matchLabels:
                  name: {{inputs.parameters.namespace-name}}
        EOF
        elif [ "{{inputs.parameters.network-policy}}" = "team-shared" ]; then
          cat <<EOF | kubectl apply -f -
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        metadata:
          name: allow-team-namespaces
          namespace: {{inputs.parameters.namespace-name}}
        spec:
          podSelector: {}
          policyTypes:
          - Ingress
          ingress:
          - from:
            - namespaceSelector:
                matchLabels:
                  platform.io/team: {{inputs.parameters.team-name}}
        EOF
        fi
        echo "Network policies applied to {{inputs.parameters.namespace-name}}"

  - name: setup-monitoring
    inputs:
      parameters:
      - name: namespace-name
      - name: team-name
    script:
      image: bitnami/kubectl:latest
      command: [sh]
      source: |
        cat <<EOF | kubectl apply -f -
        apiVersion: monitoring.coreos.com/v1
        kind: ServiceMonitor
        metadata:
          name: {{inputs.parameters.team-name}}-services
          namespace: {{inputs.parameters.namespace-name}}
          labels:
            team: {{inputs.parameters.team-name}}
        spec:
          selector:
            matchLabels:
              monitoring: enabled
          endpoints:
          - port: metrics
            path: /metrics
            interval: 30s
        EOF
        echo "Monitoring setup completed for {{inputs.parameters.namespace-name}}"
EOF
```

### Step 4: Configure Platform API Environment

Update the Platform API configuration to connect to Argo Workflows:

#### 4.1 Update Environment Variables

```bash
# Update platform-api secrets
kubectl patch secret platform-api-secrets -n platform-system --type merge -p='{
  "data": {
    "ARGO_WORKFLOWS_URL": "'$(echo -n 'http://argo-workflows-server.argo-workflows:2746' | base64)'",
    "ARGO_NAMESPACE": "'$(echo -n 'argo-workflows' | base64)'"
  }
}'

# Restart platform-api to pick up new config
kubectl rollout restart deployment/platform-api -n platform-system
```

#### 4.2 Alternative: ConfigMap Configuration

```bash
kubectl create configmap platform-api-config -n platform-system \
  --from-literal=ARGO_WORKFLOWS_URL=http://argo-workflows-server.argo-workflows:2746 \
  --from-literal=ARGO_NAMESPACE=argo-workflows \
  --from-literal=ARGO_TIMEOUT=30000
```

### Step 5: Test Workflow Integration

#### 5.1 Create Test Script

```bash
cat > test-argo-integration.js << 'EOF'
const http = require('http');
const jwt = require('jsonwebtoken');

const SECRET = 'change-me-in-production';
const token = jwt.sign({
  sub: 'test-argo-user',
  email: 'test@platform.local',
  name: 'Argo Test User',
  groups: ['Platform-Admins'],
  roles: ['platform:admin', 'namespace:admin', 'user:authenticated'],
  tenant: 'default',
  iss: 'platform-api',
  aud: 'platform-users',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 86400
}, SECRET);

async function testArgoIntegration() {
  const testNamespace = `argo-test-${Date.now()}`.substring(0, 30);

  console.log('🧪 Testing Argo Workflows Integration');
  console.log(`📝 Creating namespace: ${testNamespace}`);

  const payload = {
    namespaceName: testNamespace,
    team: 'platform',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'team-shared',
    features: ['istio-injection', 'monitoring-enhanced'],
    description: 'Testing Argo Workflows integration'
  };

  try {
    const response = await makeRequest('POST', '/api/platform/namespaces/request', payload);

    if (response.status === 201) {
      console.log('✅ Workflow submitted successfully!');
      console.log(`📋 Request ID: ${response.data.requestId}`);
      console.log(`🔄 Workflow ID: ${response.data.workflowId}`);

      // Monitor workflow progress
      if (response.data.requestId) {
        console.log('\n⏳ Monitoring workflow progress...');
        await monitorWorkflow(response.data.requestId);
      }
    } else {
      console.log('❌ Failed to submit workflow');
      console.log(`Error: ${JSON.stringify(response.data, null, 2)}`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function monitorWorkflow(requestId) {
  for (let i = 0; i < 12; i++) { // Check for 2 minutes
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

    const statusResponse = await makeRequest('GET', `/api/platform/namespaces/request/${requestId}/status`);

    if (statusResponse.status === 200) {
      const status = statusResponse.data.status;
      console.log(`   Check ${i + 1}: ${status}`);

      if (status === 'completed') {
        console.log('✅ Workflow completed successfully!');
        break;
      } else if (status === 'failed') {
        console.log('❌ Workflow failed');
        console.log(`Error: ${statusResponse.data.error}`);
        break;
      }
    }
  }
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonBody = JSON.parse(body);
          resolve({ status: res.statusCode, data: jsonBody });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

testArgoIntegration();
EOF

# Make executable and run
chmod +x test-argo-integration.js
node test-argo-integration.js
```

### Step 6: Access Argo Workflows UI

#### 6.1 Port Forward to Argo Server

```bash
kubectl port-forward svc/argo-workflows-server -n argo-workflows 2746:2746
```

#### 6.2 Access UI

Open browser to: http://localhost:2746

#### 6.3 Create Ingress (Optional)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argo-workflows-server
  namespace: argo-workflows
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - argo.your-domain.com
      secretName: argo-tls
  rules:
    - host: argo.your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argo-workflows-server
                port:
                  number: 2746
```

## 🔧 Troubleshooting Common Issues

### Issue 1: Workflow Submission Fails

```bash
# Check Argo Workflows server logs
kubectl logs -n argo-workflows deployment/argo-workflows-server

# Check workflow controller logs
kubectl logs -n argo-workflows deployment/argo-workflows-workflow-controller
```

### Issue 2: RBAC Permission Denied

```bash
# Verify service account exists
kubectl get serviceaccount platform-provisioner -n argo-workflows

# Check cluster role binding
kubectl describe clusterrolebinding platform-provisioner

# Test permissions
kubectl auth can-i create workflows --as=system:serviceaccount:argo-workflows:platform-provisioner
```

### Issue 3: Platform API Cannot Connect to Argo

```bash
# Test connectivity from platform-api pod
kubectl exec -it deployment/platform-api -n platform-system -- curl -v http://argo-workflows-server.argo-workflows:2746/api/v1/version
```

### Issue 4: Workflow Templates Not Found

```bash
# List available workflow templates
kubectl get workflowtemplates -n argo-workflows

# Check template content
kubectl describe workflowtemplate create-namespace-template -n argo-workflows
```

## 📚 Additional Resources

- [Argo Workflows Documentation](https://argoproj.github.io/argo-workflows/)
- [Backstage Software Templates](https://backstage.io/docs/features/software-templates/)
- [Kubernetes RBAC Documentation](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [Platform Engineering Best Practices](https://platformengineering.org/blog)

## 🎯 Next Steps

1. **Production Hardening**
   - Set up persistent workflow storage
   - Configure backup and disaster recovery
   - Implement workflow archiving

2. **Advanced Features**
   - Add approval workflows for production namespaces
   - Implement cost tracking and budgets
   - Add integration with monitoring and alerting

3. **Template Expansion**
   - Create templates for different application types
   - Add database provisioning workflows
   - Implement CI/CD pipeline setup workflows

4. **Migration to Standard Backstage**
   - Consider migrating to Backstage Software Templates for simpler use cases
   - Maintain Argo Workflows for complex multi-step operations
   - Hybrid approach: Backstage UI + Argo Workflows backend
