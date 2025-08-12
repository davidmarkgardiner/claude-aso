# RBAC Operations Runbook

This runbook provides step-by-step procedures for operating, monitoring, and troubleshooting the Platform API RBAC integration in production environments.

## 🚨 Emergency Procedures

### RBAC Service Down

```bash
# Check Platform API health
curl -f https://platform-api.company.com/health/detailed

# Check ASO controller status
kubectl get pods -n aso-system -l app=azureserviceoperator-controller-manager

# Emergency rollback of recent RBAC changes
kubectl get roleassignments -n aso-system --sort-by=.metadata.creationTimestamp | tail -10
kubectl delete roleassignment <problematic-assignment> -n aso-system
```

### Mass RBAC Failure

```bash
# Check Azure service status
az account show --query state
curl -s https://status.azure.com/api/v2/status

# Emergency disable RBAC processing
kubectl patch configmap platform-config -n platform-system --type merge -p '{"data":{"RBAC_ENABLED":"false"}}'

# Restart Platform API pods
kubectl rollout restart deployment/platform-api -n platform-system
```

## 📊 Daily Operations

### Morning Health Checks

```bash
#!/bin/bash
# File: scripts/rbac-health-check.sh

echo "=== RBAC Health Check $(date) ==="

# 1. Check Platform API health
echo "1. Platform API Health:"
curl -s https://platform-api.company.com/health/detailed | jq '.checks.kubernetes.healthy, .checks.argoWorkflows.healthy'

# 2. Check ASO controller health
echo "2. ASO Controller Status:"
kubectl get pods -n aso-system -o wide

# 3. Check recent RBAC operations
echo "3. Recent RBAC Operations (last 24h):"
kubectl get roleassignments -n aso-system \
  --field-selector metadata.creationTimestamp>$(date -d "24 hours ago" --iso-8601) \
  -o custom-columns=NAME:.metadata.name,STATUS:.status.conditions[0].type,AGE:.metadata.creationTimestamp

# 4. Check failed role assignments
echo "4. Failed Role Assignments:"
kubectl get roleassignments -n aso-system -o json | \
  jq -r '.items[] | select(.status.conditions[]?.type == "Failed") | .metadata.name'

# 5. Check Azure AD connectivity
echo "5. Azure AD Connectivity:"
curl -s -H "Authorization: Bearer $AZURE_AD_TOKEN" https://graph.microsoft.com/v1.0/me > /dev/null && echo "OK" || echo "FAILED"

echo "=== Health Check Complete ==="
```

### Weekly Maintenance

```bash
# 1. Clean up completed role assignments older than 90 days
kubectl get roleassignments -n aso-system -o json | \
  jq -r '.items[] | select(.status.conditions[]?.type == "Ready" and (.metadata.creationTimestamp | fromdateiso8601) < (now - 7776000)) | .metadata.name' | \
  xargs -I {} kubectl delete roleassignment {} -n aso-system

# 2. Review audit logs for anomalies
kubectl logs -n platform-system deployment/platform-api --since=168h | grep "RBAC_OPERATION" | grep "HIGH"

# 3. Check certificate expiration
kubectl get certificates -n cert-manager -o custom-columns=NAME:.metadata.name,READY:.status.conditions[0].status,EXPIRES:.status.notAfter
```

## 🔍 Monitoring & Alerting

### Key Metrics to Monitor

| Metric                        | Threshold    | Action                      |
| ----------------------------- | ------------ | --------------------------- |
| RBAC request success rate     | < 95%        | Investigate error patterns  |
| Azure AD validation latency   | > 5s         | Check Graph API status      |
| ASO manifest application time | > 60s        | Check Kubernetes API health |
| Failed role assignments       | > 5 in 1h    | Review recent changes       |
| Audit log gaps                | > 1h missing | Check log aggregation       |

### Prometheus Queries

```promql
# RBAC request success rate
(sum(rate(platform_rbac_requests_total{status=~"2.."}[5m])) /
 sum(rate(platform_rbac_requests_total[5m]))) * 100

# Average RBAC provisioning time
histogram_quantile(0.95,
  sum(rate(platform_rbac_provisioning_duration_seconds_bucket[5m])) by (le))

# Failed Azure AD validations
sum(rate(platform_rbac_azure_ad_validation_failures_total[5m])) by (error_type)
```

### Alert Rules

```yaml
# File: monitoring/rbac-alerts.yaml
groups:
  - name: rbac_alerts
    rules:
      - alert: RBACHighFailureRate
        expr: (1 - sum(rate(platform_rbac_requests_total{status=~"2.."}[5m])) / sum(rate(platform_rbac_requests_total[5m]))) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High RBAC failure rate detected
          description: "RBAC request failure rate is {{ $value | humanizePercentage }}"

      - alert: RBACProvisioningTimeout
        expr: histogram_quantile(0.95, sum(rate(platform_rbac_provisioning_duration_seconds_bucket[5m])) by (le)) > 60
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: RBAC provisioning timeouts
          description: "95th percentile provisioning time is {{ $value }}s"

      - alert: ASOControllerDown
        expr: up{job="aso-controller"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: ASO controller is down
          description: "Azure Service Operator controller is not responding"
```

## 🛠️ Troubleshooting Guide

### Issue: RBAC Request Fails with "Principal Not Found"

**Symptoms:**

```
Error: Invalid Azure AD principal: User 'user@company.com' not found
```

**Diagnosis:**

```bash
# 1. Check Azure AD connectivity
curl -H "Authorization: Bearer $AZURE_AD_TOKEN" \
  "https://graph.microsoft.com/v1.0/users/user@company.com"

# 2. Check service principal permissions
az ad sp show --id $AZURE_CLIENT_ID --query "appRoles[?value=='User.Read.All']"

# 3. Check token expiration
echo $AZURE_AD_TOKEN | base64 -d | jq '.exp'
```

**Resolution:**

1. Verify user exists in Azure AD tenant
2. Ensure service principal has `User.Read.All` permission
3. Refresh Azure AD token if expired
4. Check for tenant-specific user restrictions

### Issue: ASO Role Assignment Stuck in Pending

**Symptoms:**

```bash
kubectl get roleassignments -n aso-system
NAME                          STATUS    AGE
rbac-frontend-prod-1         Pending    15m
```

**Diagnosis:**

```bash
# 1. Check ASO controller logs
kubectl logs -n aso-system deployment/azureserviceoperator-controller-manager --tail=100

# 2. Check role assignment details
kubectl describe roleassignment rbac-frontend-prod-1 -n aso-system

# 3. Check Azure ARM deployment status
az deployment group list --resource-group $RESOURCE_GROUP --query "[?contains(name, 'rbac-frontend-prod-1')]"
```

**Resolution:**

1. Verify ASO controller has proper Azure permissions
2. Check if target resource (AKS cluster) exists and is accessible
3. Validate role assignment scope syntax
4. Check for conflicting role assignments
5. Restart ASO controller if necessary

### Issue: High Azure AD API Rate Limiting

**Symptoms:**

```
Error: Request rate limit exceeded (429)
```

**Diagnosis:**

```bash
# Check recent Azure AD request patterns
kubectl logs -n platform-system deployment/platform-api --since=1h | \
  grep "Azure AD" | grep "429"

# Check current request rate
kubectl logs -n platform-system deployment/platform-api --since=5m | \
  grep "validatePrincipalById" | wc -l
```

**Resolution:**

```bash
# 1. Implement exponential backoff (already in enhanced code)
# 2. Enable principal ID caching
kubectl patch configmap platform-config -n platform-system \
  --type merge -p '{"data":{"AZURE_AD_CACHE_TTL":"300"}}'

# 3. Scale down concurrent requests
kubectl patch deployment platform-api -n platform-system \
  -p '{"spec":{"replicas":2}}'
```

## 🔧 Maintenance Procedures

### Backup RBAC Assignments

```bash
#!/bin/bash
# File: scripts/backup-rbac.sh

BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/backup/rbac"

mkdir -p $BACKUP_DIR

# Backup all role assignments
kubectl get roleassignments -n aso-system -o yaml > \
  "$BACKUP_DIR/roleassignments-$BACKUP_DATE.yaml"

# Backup RBAC configuration
kubectl get configmap platform-rbac-config -n platform-system -o yaml > \
  "$BACKUP_DIR/rbac-config-$BACKUP_DATE.yaml"

# Create compressed archive
tar -czf "$BACKUP_DIR/rbac-backup-$BACKUP_DATE.tar.gz" \
  "$BACKUP_DIR/roleassignments-$BACKUP_DATE.yaml" \
  "$BACKUP_DIR/rbac-config-$BACKUP_DATE.yaml"

echo "Backup created: rbac-backup-$BACKUP_DATE.tar.gz"
```

### Restore RBAC Assignments

```bash
#!/bin/bash
# File: scripts/restore-rbac.sh

BACKUP_FILE="$1"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  exit 1
fi

# Extract backup
tar -xzf "$BACKUP_FILE"

# Apply role assignments
kubectl apply -f roleassignments-*.yaml

# Apply configuration
kubectl apply -f rbac-config-*.yaml

# Restart Platform API to reload config
kubectl rollout restart deployment/platform-api -n platform-system

echo "RBAC restore completed"
```

### Update RBAC Service

```bash
#!/bin/bash
# File: scripts/update-rbac-service.sh

# 1. Create backup
./scripts/backup-rbac.sh

# 2. Scale down to single replica for zero-downtime deployment
kubectl scale deployment platform-api -n platform-system --replicas=1

# 3. Apply new configuration
kubectl apply -f platform-api/k8s/configmap.yaml

# 4. Update deployment image
kubectl set image deployment/platform-api -n platform-system \
  platform-api=platform-api:$NEW_VERSION

# 5. Wait for rollout
kubectl rollout status deployment/platform-api -n platform-system --timeout=300s

# 6. Scale back up
kubectl scale deployment platform-api -n platform-system --replicas=3

# 7. Verify health
curl -f https://platform-api.company.com/health/detailed

echo "RBAC service update completed"
```

## 📈 Performance Optimization

### Scale RBAC Service

```bash
# Horizontal scaling based on load
kubectl patch hpa platform-api-hpa -n platform-system \
  --type merge -p '{"spec":{"minReplicas":3,"maxReplicas":10}}'

# Vertical scaling for high-memory workloads
kubectl patch deployment platform-api -n platform-system \
  --type merge -p '{"spec":{"template":{"spec":{"containers":[{"name":"platform-api","resources":{"requests":{"memory":"512Mi","cpu":"500m"},"limits":{"memory":"1Gi","cpu":"1000m"}}}]}}}}'
```

### Optimize Azure AD Calls

```bash
# Enable caching
kubectl patch configmap platform-config -n platform-system \
  --type merge -p '{
    "data": {
      "AZURE_AD_CACHE_ENABLED": "true",
      "AZURE_AD_CACHE_TTL": "300",
      "AZURE_AD_BATCH_SIZE": "20"
    }
  }'

# Add circuit breaker configuration
kubectl patch configmap platform-config -n platform-system \
  --type merge -p '{
    "data": {
      "CIRCUIT_BREAKER_ENABLED": "true",
      "CIRCUIT_BREAKER_TIMEOUT": "5000",
      "CIRCUIT_BREAKER_ERROR_THRESHOLD": "50"
    }
  }'
```

## 🔐 Security Procedures

### Rotate Service Principal Credentials

```bash
#!/bin/bash
# File: scripts/rotate-sp-credentials.sh

# 1. Create new client secret
NEW_SECRET=$(az ad sp credential reset --id $AZURE_CLIENT_ID --query password -o tsv)

# 2. Update Kubernetes secret
kubectl patch secret azure-sp-secret -n platform-system \
  --type merge -p "{\"data\":{\"AZURE_CLIENT_SECRET\":\"$(echo -n $NEW_SECRET | base64)\"}}"

# 3. Restart pods to pick up new secret
kubectl rollout restart deployment/platform-api -n platform-system

# 4. Verify connectivity
sleep 30
curl -f https://platform-api.company.com/health/detailed

echo "Service principal credentials rotated successfully"
```

### Review Audit Logs

```bash
# Check for suspicious RBAC operations
kubectl logs -n platform-system deployment/platform-api --since=24h | \
  grep "RBAC_OPERATION" | \
  jq 'select(.severity == "HIGH" or .success == false)' | \
  jq -r '[.timestamp, .requestedBy.email, .action, .namespace, .error] | @csv'

# Check for failed authentication attempts
kubectl logs -n platform-system deployment/platform-api --since=24h | \
  grep "AuthenticationError" | \
  jq -r '[.timestamp, .sourceIP, .userAgent] | @csv'
```

## 📞 Contact Information

| Issue Type         | Contact               | Response Time |
| ------------------ | --------------------- | ------------- |
| Critical Outage    | Platform Team On-Call | 15 minutes    |
| Security Incident  | Security Team         | 30 minutes    |
| Azure AD Issues    | Identity Team         | 1 hour        |
| Performance Issues | Platform Team         | 4 hours       |
| Feature Requests   | Product Team          | Next sprint   |

---

**Last Updated:** {{ date }}  
**Version:** 1.0  
**Owner:** Platform Engineering Team
