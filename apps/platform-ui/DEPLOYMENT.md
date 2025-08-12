# Platform UI - Production Deployment Guide

This guide provides comprehensive instructions for deploying the Platform UI v1.1.0 to Azure Kubernetes Service (AKS) with production-ready configurations.

## 🏗️ Architecture Overview

The Platform UI is deployed as a containerized React application with the following production features:

- **High Availability**: 3 replica minimum with pod anti-affinity
- **Auto Scaling**: HPA based on CPU/memory utilization
- **Security**: RBAC, Network Policies, Istio mTLS, Content Security Policy
- **Monitoring**: Prometheus metrics, Grafana dashboards, alerting rules
- **Service Mesh**: Full Istio integration with traffic management
- **External Access**: Ingress with TLS termination and Istio Gateway
- **Configuration Management**: External Secrets integration

## 📋 Prerequisites

Before deploying the Platform UI, ensure you have:

### Required Components

- AKS cluster with Istio service mesh installed
- Platform API v1.1.0 deployed and running
- cert-manager for TLS certificate management
- External Secrets Operator (ESO) configured with Azure Key Vault
- Prometheus and Grafana for monitoring
- Azure AD application registered for authentication

### Required Permissions

- Cluster admin access for RBAC setup
- Azure Key Vault access for secrets management
- DNS management for external domain configuration

## 🚀 Deployment Steps

### Step 1: Prepare Configuration

1. **Update Azure AD Configuration**:

   ```bash
   # Edit configmap.yaml and update these values:
   REACT_APP_AUTH_CLIENT_ID: "your-ui-client-id"
   REACT_APP_AUTH_AUTHORITY: "https://login.microsoftonline.com/your-tenant-id"
   REACT_APP_AUTH_REDIRECT_URI: "https://platform.aks.local/auth/callback"
   ```

2. **Configure External Secrets**:

   ```bash
   # Ensure these secrets exist in Azure Key Vault:
   # - platform-ui-azure-client-secret
   # - platform-ui-session-secret
   # - platform-api-jwt-public-key
   # - platform-appinsights-connection-string
   ```

3. **Update DNS Configuration**:
   ```bash
   # Point your domain to the ingress IP
   # platform.aks.local -> <ingress-external-ip>
   ```

### Step 2: Deploy Platform UI

1. **Apply the manifests using Kustomize**:

   ```bash
   kubectl apply -k apps/platform-ui/
   ```

2. **Verify deployment**:

   ```bash
   ./apps/platform-ui/validate-deployment.sh
   ```

3. **Check pod status**:
   ```bash
   kubectl get pods -n platform-system -l app=platform-ui
   ```

### Step 3: Configure Service Mesh

1. **Verify Istio injection**:

   ```bash
   kubectl get pods -n platform-system -l app=platform-ui -o jsonpath='{.items[*].spec.containers[*].name}'
   # Should include 'istio-proxy'
   ```

2. **Check Istio configuration**:
   ```bash
   kubectl get virtualservice,destinationrule,gateway -n platform-system
   ```

### Step 4: Verify External Access

1. **Check ingress status**:

   ```bash
   kubectl get ingress platform-ui-ingress -n platform-system
   ```

2. **Test external access**:
   ```bash
   curl -k https://platform.aks.local/health
   # Should return "healthy"
   ```

## 🔧 Configuration Details

### Environment Variables

The Platform UI uses these key environment variables:

| Variable                     | Description               | Default                                                  |
| ---------------------------- | ------------------------- | -------------------------------------------------------- |
| `REACT_APP_API_URL`          | Platform API endpoint     | `https://platform-api.platform-system.svc.cluster.local` |
| `REACT_APP_AUTH_CLIENT_ID`   | Azure AD client ID        | Set via ConfigMap                                        |
| `REACT_APP_AUTH_AUTHORITY`   | Azure AD authority URL    | Set via ConfigMap                                        |
| `REACT_APP_PLATFORM_NAME`    | Platform display name     | `Platform Portal`                                        |
| `REACT_APP_ENABLE_ANALYTICS` | Enable analytics features | `true`                                                   |

### Resource Limits

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Scaling Configuration

```yaml
# HPA Configuration
minReplicas: 3
maxReplicas: 10
targetCPUUtilizationPercentage: 70
targetMemoryUtilizationPercentage: 80
```

## 🔒 Security Configuration

### Network Policies

- **Ingress**: Only allows traffic from Istio gateways and monitoring systems
- **Egress**: Restricts outbound traffic to necessary services only

### Content Security Policy

The Nginx configuration includes a comprehensive CSP:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://login.microsoftonline.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://login.microsoftonline.com https://platform-api.platform-system.svc.cluster.local wss://platform-api.platform-system.svc.cluster.local; frame-src 'self' https://login.microsoftonline.com;
```

### mTLS Configuration

Istio enforces strict mTLS between all services:

```yaml
spec:
  mtls:
    mode: STRICT
```

## 📊 Monitoring and Observability

### Metrics

The Platform UI exposes these metrics:

- HTTP request rates and error rates
- Response time percentiles
- Active connections
- Memory and CPU usage
- Pod restart counts

### Alerts

Pre-configured alerts include:

- **PlatformUIDown**: Service unavailable
- **PlatformUIHighErrorRate**: Error rate > 10%
- **PlatformUIHighLatency**: 95th percentile > 5s
- **PlatformUIHighMemoryUsage**: Memory usage > 90%
- **PlatformUIHighCPUUsage**: CPU usage > 80%

### Dashboards

Access the Grafana dashboard at:

```
https://grafana.your-domain.com/d/platform-ui
```

## 🔧 Troubleshooting

### Common Issues

1. **Pods not starting**:

   ```bash
   kubectl describe pod -n platform-system -l app=platform-ui
   kubectl logs -n platform-system -l app=platform-ui
   ```

2. **External access not working**:

   ```bash
   # Check ingress
   kubectl describe ingress platform-ui-ingress -n platform-system

   # Check certificate
   kubectl describe certificate platform-ui-tls-cert -n platform-system

   # Check DNS resolution
   nslookup platform.aks.local
   ```

3. **Authentication issues**:

   ```bash
   # Verify Azure AD configuration
   kubectl get configmap platform-ui-config -n platform-system -o yaml

   # Check secrets
   kubectl get secret platform-ui-secrets -n platform-system -o yaml
   ```

4. **API connectivity issues**:

   ```bash
   # Test internal connectivity
   kubectl exec -it -n platform-system deployment/platform-ui -- curl -f http://platform-api/health

   # Check service mesh configuration
   kubectl get virtualservice,destinationrule -n platform-system
   ```

### Health Checks

The Platform UI provides several health check endpoints:

- `/health` - Basic health check
- `/health/ready` - Readiness check
- `/metrics` - Prometheus metrics

### Log Analysis

View application logs:

```bash
# View recent logs
kubectl logs -n platform-system deployment/platform-ui --tail=100

# Follow logs in real-time
kubectl logs -n platform-system deployment/platform-ui -f

# View logs from all replicas
kubectl logs -n platform-system -l app=platform-ui --tail=50
```

## 🔄 Updates and Maintenance

### Updating the Image

1. **Update the image tag in kustomization.yaml**:

   ```yaml
   images:
     - name: davidgardiner/platform-ui
       newTag: v1.2.0
   ```

2. **Apply the update**:

   ```bash
   kubectl apply -k apps/platform-ui/
   ```

3. **Monitor the rollout**:
   ```bash
   kubectl rollout status deployment/platform-ui -n platform-system
   ```

### Configuration Updates

1. **Update ConfigMap**:

   ```bash
   kubectl edit configmap platform-ui-config -n platform-system
   ```

2. **Restart deployment to pick up changes**:
   ```bash
   kubectl rollout restart deployment/platform-ui -n platform-system
   ```

### Backup and Recovery

1. **Backup configuration**:

   ```bash
   kubectl get all,cm,secret,ingress,virtualservice,destinationrule -n platform-system -l app=platform-ui -o yaml > platform-ui-backup.yaml
   ```

2. **Restore from backup**:
   ```bash
   kubectl apply -f platform-ui-backup.yaml
   ```

## 🎯 Performance Optimization

### Caching Strategy

- **Static Assets**: 1 year cache with immutable headers
- **HTML Files**: No cache to ensure fresh content
- **API Responses**: Cached by the browser based on API headers

### Network Optimization

- **Gzip Compression**: Enabled for all text-based content
- **HTTP/2**: Supported via Istio ingress gateway
- **Connection Pooling**: Configured in Istio DestinationRule

### Resource Optimization

- **HPA**: Automatically scales based on demand
- **PDB**: Ensures minimum availability during disruptions
- **Resource Requests/Limits**: Proper resource allocation

## 📈 Scaling Considerations

### Horizontal Scaling

The HPA automatically scales replicas based on:

- CPU utilization (target: 70%)
- Memory utilization (target: 80%)
- Custom metrics (if configured)

### Vertical Scaling

To increase pod resources:

1. **Update deployment.yaml**:

   ```yaml
   resources:
     requests:
       memory: "512Mi"
       cpu: "200m"
     limits:
       memory: "1Gi"
       cpu: "1000m"
   ```

2. **Apply changes**:
   ```bash
   kubectl apply -k apps/platform-ui/
   ```

## 🔐 Security Best Practices

1. **Regular Security Updates**:
   - Update base images regularly
   - Scan for vulnerabilities using tools like Trivy

2. **Secret Rotation**:
   - Rotate Azure AD client secrets quarterly
   - Use External Secrets for automatic rotation

3. **Network Security**:
   - Review and update NetworkPolicies regularly
   - Monitor traffic patterns for anomalies

4. **Access Control**:
   - Implement least-privilege RBAC
   - Regular access reviews

## 📞 Support and Contacts

For deployment issues or questions:

1. **Check monitoring dashboards** first
2. **Review application logs** for error details
3. **Consult troubleshooting section** in this guide
4. **Contact platform team** for escalation

---

## 📚 Additional Resources

- [Platform API Integration Guide](../platform-api/DEPLOYMENT.md)
- [Istio Service Mesh Configuration](../../istio-apps/README.md)
- [Azure AD Integration Guide](https://docs.microsoft.com/en-us/azure/active-directory/)
- [Kubernetes Best Practices](https://kubernetes.io/docs/concepts/configuration/overview/)

---

**Version**: v1.1.0  
**Last Updated**: $(date +%Y-%m-%d)  
**Maintained By**: Platform Engineering Team
