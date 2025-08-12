# Argo Workflows YAML Examples - Platform API Integration

## Summary

This document shows the actual YAML structures sent between the Platform API and Argo Workflows for namespace provisioning.

## 1. Frontend Request → Platform API

When a user requests a namespace through the Platform UI, this JSON is sent to the Platform API:

```json
{
  "namespaceName": "demo-team-project",
  "team": "engineering-team",
  "resourceTier": "medium",
  "features": ["istio-injection", "monitoring-enhanced", "logging-basic"],
  "rbac": {
    "adminUsers": ["alice@company.com", "bob@company.com"],
    "developerUsers": ["charlie@company.com"]
  },
  "requestId": "req-1754949379572"
}
```

## 2. Platform API → Argo Workflows

The Platform API converts the frontend request into this Argo Workflow YAML:

### HTTP Request

```http
POST https://localhost:2746/api/v1/workflows/argo
Content-Type: application/json

{
  "workflow": {
    // Workflow YAML below
  }
}
```

### Workflow YAML Structure

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: create-namespace-
  namespace: argo
  labels:
    platform.io/type: namespace-provisioning
    platform.io/team: engineering-team
    platform.io/request-id: req-1754949379572
spec:
  entrypoint: namespace-provisioning-dag
  arguments:
    parameters:
      - name: namespaceName
        value: demo-team-project
      - name: team
        value: engineering-team
      - name: resourceTier
        value: medium
      - name: features
        value: '["istio-injection","monitoring-enhanced","logging-basic"]'
      - name: rbacConfig
        value: '{"adminUsers":["alice@company.com","bob@company.com"],"developerUsers":["charlie@company.com"]}'
      - name: requestId
        value: req-1754949379572

  templates:
    # DAG orchestration
    - name: namespace-provisioning-dag
      dag:
        tasks:
          - name: create-namespace
            template: create-namespace-step
          - name: setup-rbac
            template: setup-rbac-step
            dependencies: [create-namespace]
          - name: apply-quotas
            template: apply-quotas-step
            dependencies: [create-namespace]
          - name: enable-features
            template: enable-features-step
            dependencies: [create-namespace]
          - name: finalize
            template: finalize-step
            dependencies: [setup-rbac, apply-quotas, enable-features]

    # Step implementations
    - name: create-namespace-step
      container:
        image: bitnami/kubectl:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            echo "🏗️ Creating namespace: {{workflow.parameters.namespaceName}}"
            kubectl create namespace {{workflow.parameters.namespaceName}}
            kubectl label namespace {{workflow.parameters.namespaceName}} \
              platform.io/managed=true \
              platform.io/team={{workflow.parameters.team}} \
              platform.io/tier={{workflow.parameters.resourceTier}}
            echo "✅ Namespace created successfully"
        resources:
          limits: { cpu: 200m, memory: 256Mi }
          requests: { cpu: 100m, memory: 128Mi }

    - name: setup-rbac-step
      container:
        image: bitnami/kubectl:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            echo "🔐 Setting up RBAC for team: {{workflow.parameters.team}}"
            kubectl create serviceaccount team-service-account -n {{workflow.parameters.namespaceName}}
            kubectl create role namespace-admin --verb=* --resource=* -n {{workflow.parameters.namespaceName}}
            kubectl create rolebinding team-admin \
              --role=namespace-admin \
              --serviceaccount={{workflow.parameters.namespaceName}}:team-service-account \
              -n {{workflow.parameters.namespaceName}}
            echo "✅ RBAC configured successfully"
        resources:
          limits: { cpu: 200m, memory: 256Mi }
          requests: { cpu: 100m, memory: 128Mi }

    - name: apply-quotas-step
      container:
        image: bitnami/kubectl:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            echo "📊 Applying {{workflow.parameters.resourceTier}} tier quotas"
            case "{{workflow.parameters.resourceTier}}" in
              "small") CPU="2"; MEMORY="4Gi"; PODS="10" ;;
              "medium") CPU="4"; MEMORY="8Gi"; PODS="20" ;;
              "large") CPU="8"; MEMORY="16Gi"; PODS="50" ;;
            esac
            kubectl create quota compute-resources \
              --hard=requests.cpu=$CPU,requests.memory=$MEMORY,pods=$PODS \
              -n {{workflow.parameters.namespaceName}}
            echo "✅ Resource quotas applied: $CPU CPU, $MEMORY memory, $PODS pods"
        resources:
          limits: { cpu: 200m, memory: 256Mi }
          requests: { cpu: 100m, memory: 128Mi }

    - name: enable-features-step
      container:
        image: bitnami/kubectl:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            echo "🎛️ Enabling features: {{workflow.parameters.features}}"
            FEATURES='{{workflow.parameters.features}}'
            if echo "$FEATURES" | grep -q "istio-injection"; then
              kubectl label namespace {{workflow.parameters.namespaceName}} istio-injection=enabled
              echo "✅ Istio injection enabled"
            fi
            if echo "$FEATURES" | grep -q "monitoring-enhanced"; then
              kubectl label namespace {{workflow.parameters.namespaceName}} monitoring=enhanced
              echo "✅ Enhanced monitoring enabled"
            fi
            if echo "$FEATURES" | grep -q "logging-basic"; then
              kubectl label namespace {{workflow.parameters.namespaceName}} logging=basic
              echo "✅ Basic logging enabled"
            fi
            echo "✅ All requested features configured"
        resources:
          limits: { cpu: 200m, memory: 256Mi }
          requests: { cpu: 100m, memory: 128Mi }

    - name: finalize-step
      container:
        image: bitnami/kubectl:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            echo "🎯 Finalizing namespace setup"
            kubectl annotate namespace {{workflow.parameters.namespaceName}} \
              platform.io/provisioned-at="$(date -Iseconds)" \
              platform.io/status="ready"
            echo "📋 Namespace Summary:"
            kubectl get namespace {{workflow.parameters.namespaceName}} --show-labels
            echo "🎉 Namespace {{workflow.parameters.namespaceName}} ready for team {{workflow.parameters.team}}!"
        resources:
          limits: { cpu: 200m, memory: 256Mi }
          requests: { cpu: 100m, memory: 128Mi }
```

## 3. Argo Response → Platform API

After workflow submission, Argo returns this response:

```json
{
  "metadata": {
    "name": "create-namespace-abc123",
    "namespace": "argo",
    "creationTimestamp": "2025-08-11T21:50:00Z",
    "labels": {
      "platform.io/type": "namespace-provisioning",
      "platform.io/team": "engineering-team",
      "workflows.argoproj.io/phase": "Running"
    }
  },
  "status": {
    "phase": "Running",
    "startedAt": "2025-08-11T21:50:00Z",
    "progress": "1/5",
    "nodes": {
      "create-namespace-abc123": {
        "id": "create-namespace-abc123",
        "name": "create-namespace-abc123",
        "phase": "Running",
        "type": "DAG"
      }
    }
  }
}
```

## 4. Platform API → Frontend

The Platform API returns this to the frontend:

```json
{
  "success": true,
  "message": "Namespace creation workflow submitted",
  "data": {
    "workflowName": "create-namespace-abc123",
    "status": "Running",
    "requestId": "req-1754949379572",
    "estimatedCompletion": "2 minutes"
  }
}
```

## 5. Workflow Status Updates

As the workflow progresses, status updates show:

```json
{
  "workflowName": "create-namespace-abc123",
  "status": "Running",
  "progress": "3/5",
  "currentStep": "apply-quotas",
  "steps": {
    "create-namespace": "Succeeded",
    "setup-rbac": "Succeeded",
    "apply-quotas": "Running",
    "enable-features": "Pending",
    "finalize": "Pending"
  },
  "logs": [
    "🏗️ Creating namespace: demo-team-project",
    "✅ Namespace created successfully",
    "🔐 Setting up RBAC for team: engineering-team",
    "✅ RBAC configured successfully",
    "📊 Applying medium tier quotas..."
  ]
}
```

## 6. Final Success Response

When complete:

```json
{
  "workflowName": "create-namespace-abc123",
  "status": "Succeeded",
  "progress": "5/5",
  "completedAt": "2025-08-11T21:52:30Z",
  "duration": "2m30s",
  "result": {
    "namespaceName": "demo-team-project",
    "resources": {
      "namespace": "created",
      "serviceAccount": "created",
      "role": "created",
      "roleBinding": "created",
      "resourceQuota": "created",
      "features": ["istio-injection", "monitoring-enhanced", "logging-basic"]
    },
    "status": "ready"
  }
}
```

## Key Points

1. **Parameter Passing**: Frontend data becomes workflow parameters
2. **DAG Structure**: Dependencies ensure proper execution order
3. **Container Steps**: Each step runs in a separate pod with kubectl access
4. **Resource Limits**: Consistent resource constraints across all steps
5. **Label Management**: Kubernetes resources tagged for identification
6. **Status Tracking**: Real-time progress updates through Argo API
7. **Error Handling**: Failed steps can be retried or investigated

## Production Considerations

### RBAC Requirements

The workflow service account needs permissions for:

- Creating namespaces
- Managing RBAC (roles, rolebindings, serviceaccounts)
- Creating resource quotas
- Labeling and annotating resources

### Security

- Use dedicated service accounts with minimal permissions
- Implement approval workflows for production namespaces
- Audit all workflow executions
- Secure container images (use signed images)

### Scalability

- Monitor workflow controller resource usage
- Implement workflow timeouts
- Use persistent storage for large workflows
- Consider workflow archival policies

This YAML flow demonstrates how the Platform API transforms user requests into automated Kubernetes operations through Argo Workflows, providing enterprise-grade namespace provisioning with full audit trails and error handling.
