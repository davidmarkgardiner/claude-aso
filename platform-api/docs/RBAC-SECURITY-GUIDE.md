# RBAC Security Guide

This comprehensive security guide covers all aspects of securing the Platform API RBAC integration, from development through production deployment.

## 🔐 Security Architecture Overview

### Multi-Layer Security Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RBAC Security Layers                        │
├─────────────────────────────────────────────────────────────────────┤
│ 1. Network Security    │ VPC, Private Endpoints, Firewalls         │
│ 2. API Security        │ Rate Limiting, Circuit Breakers, WAF      │
│ 3. Authentication      │ JWT Tokens, Azure AD Integration          │
│ 4. Authorization       │ RBAC, Namespace Scoping, Role Validation  │
│ 5. Data Security       │ Encryption at Rest/Transit, Secret Mgmt   │
│ 6. Audit & Compliance  │ Comprehensive Logging, SOC 2 Controls     │
│ 7. Runtime Security    │ Pod Security, Network Policies, mTLS      │
└─────────────────────────────────────────────────────────────────────┘
```

## 🛡️ Threat Model & Mitigations

### High-Severity Threats

#### 1. Privilege Escalation
**Threat:** Unauthorized users gaining admin access to production namespaces
**Mitigations:**
- ✅ Namespace-scoped role assignments only
- ✅ Admin role approval workflow for production
- ✅ Comprehensive audit logging
- ✅ Rate limiting on admin role requests

```typescript
// Automatic admin role approval requirement
private requiresApproval(roleDefinition?: AKSRoleDefinition, environment?: string): boolean {
  return roleDefinition === 'aks-rbac-admin' && environment === 'production';
}
```

#### 2. Credential Theft
**Threat:** Stolen service principal credentials used for unauthorized access
**Mitigations:**
- ✅ Azure Key Vault for secret storage
- ✅ Workload Identity (no stored secrets)
- ✅ Short-lived tokens with automatic rotation
- ✅ Network restrictions on API access

#### 3. API Abuse & DoS
**Threat:** Malicious requests overwhelming the RBAC service
**Mitigations:**
- ✅ Multi-tier rate limiting
- ✅ Circuit breakers for external services
- ✅ Request validation and sanitization
- ✅ Geographic access restrictions

### Medium-Severity Threats

#### 4. Azure AD Token Interception
**Threat:** Man-in-the-middle attacks on Graph API calls
**Mitigations:**
- ✅ TLS 1.3 encryption for all API calls
- ✅ Certificate pinning for Graph API
- ✅ Token validation and expiration checks

#### 5. Audit Log Tampering
**Threat:** Attackers modifying or deleting audit logs
**Mitigations:**
- ✅ Immutable log storage (Azure Monitor)
- ✅ Log forwarding to multiple destinations
- ✅ Cryptographic log integrity verification

## 🔑 Authentication & Authorization

### Azure AD Integration Security

#### Service Principal Configuration
```bash
# Create dedicated service principal with minimal permissions
az ad sp create-for-rbac --name platform-rbac-service \
  --role "AKS RBAC Admin" \
  --scopes /subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG_NAME

# Grant only necessary Graph API permissions
az ad app permission add --id $APP_ID --api 00000003-0000-0000-c000-000000000000 --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Role

# Enable certificate-based authentication
az ad sp credential reset --id $APP_ID --create-cert --keyvault $KEYVAULT_NAME
```

#### JWT Token Validation
```typescript
// Comprehensive token validation
export const validateJWTToken = async (token: string): Promise<boolean> => {
  try {
    // 1. Verify signature
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    
    // 2. Check expiration
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }
    
    // 3. Validate issuer
    if (decoded.iss !== `https://sts.windows.net/${AZURE_TENANT_ID}/`) {
      throw new Error('Invalid issuer');
    }
    
    // 4. Check audience
    if (!decoded.aud.includes(config.azure.clientId)) {
      throw new Error('Invalid audience');
    }
    
    return true;
  } catch (error) {
    logger.error('JWT validation failed', { error: error.message });
    return false;
  }
};
```

### Role-Based Access Control

#### Permission Matrix
```yaml
# platform-rbac-roles.yaml
roles:
  platform:admin:
    permissions:
      - rbac:create:*
      - rbac:delete:*
      - rbac:read:*
      - clusters:list
    namespaces: ["*"]
    
  namespace:admin:
    permissions:
      - rbac:create:owned
      - rbac:delete:owned
      - rbac:read:owned
    namespaces: ["team-*"] # Pattern-based namespace access
    
  developer:
    permissions:
      - rbac:read:owned
    namespaces: ["team-frontend", "team-backend"]
    
  viewer:
    permissions:
      - rbac:read:owned
    namespaces: ["team-*"]
```

## 🔒 Data Protection

### Encryption Standards

#### At Rest
- **Kubernetes etcd:** AES-256 encryption enabled
- **Azure Storage:** Customer-managed keys in Key Vault
- **Database:** TDE with HSM-backed keys
- **Logs:** Encrypted storage with retention policies

#### In Transit
```yaml
# TLS Configuration
tls:
  version: "1.3"
  cipherSuites:
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
  certificateSource: "Azure Key Vault"
  mtls: 
    enabled: true
    clientCertValidation: required
```

### Secret Management

#### Azure Key Vault Integration
```typescript
// Secure secret retrieval
export class SecureConfigService {
  private keyVaultClient: SecretClient;
  
  async getSecret(secretName: string): Promise<string> {
    try {
      const secret = await this.keyVaultClient.getSecret(secretName);
      
      // Log access for audit
      logger.info('Secret accessed', {
        secretName: this.hashSecretName(secretName),
        timestamp: new Date().toISOString(),
        userId: 'system'
      });
      
      return secret.value!;
    } catch (error) {
      logger.error('Failed to retrieve secret', { secretName, error });
      throw new Error('Secret retrieval failed');
    }
  }
}
```

#### Environment Variable Security
```bash
# ❌ NEVER DO THIS
export AZURE_CLIENT_SECRET="super-secret-value" # pragma: allowlist secret

# ✅ Use Azure Key Vault CSI Driver
apiVersion: v1
kind: SecretProviderClass
metadata:
  name: rbac-secrets
spec:
  provider: azure
  parameters:
    keyvaultName: "platform-kv"
    objects: |
      array:
        - |
          objectName: azure-client-secret
          objectType: secret
```

## 📊 Security Monitoring

### Real-Time Threat Detection

#### Anomaly Detection Rules
```yaml
# security-rules.yaml
rules:
  - name: "mass-admin-assignment"
    condition: "count(rbac.admin_assignments) > 5 in 1h"
    severity: "HIGH"
    action: "alert+block"
    
  - name: "unusual-source-ip"
    condition: "source_ip not in allowed_ranges"
    severity: "MEDIUM" 
    action: "alert+log"
    
  - name: "after-hours-rbac"
    condition: "time outside business_hours AND action=create"
    severity: "MEDIUM"
    action: "alert"
```

#### Security Metrics Dashboard
```promql
# High-priority security metrics

# Failed authentication rate
rate(platform_rbac_auth_failures_total[5m]) > 0.1

# Admin role assignment rate 
rate(platform_rbac_admin_assignments_total[1h]) > 3

# Unusual geographic access
rate(platform_rbac_requests_total{country!="allowed"}[5m]) > 0

# Circuit breaker activations
platform_circuit_breaker_state{service="azure-ad"} == 1
```

### Audit Trail Requirements

#### SOC 2 Compliance
```typescript
// Comprehensive audit event structure
interface SecurityAuditEvent {
  timestamp: string;
  eventType: 'AUTHENTICATION' | 'AUTHORIZATION' | 'DATA_ACCESS' | 'RBAC_OPERATION';
  userId: string;
  sourceIP: string;
  userAgent: string;
  resource: {
    type: string;
    identifier: string;
    namespace?: string;
  };
  action: string;
  result: 'SUCCESS' | 'FAILURE';
  riskScore: number; // 0-100
  businessJustification?: string;
  approverUserId?: string;
  retentionClass: 'IMMEDIATE' | 'SHORT_TERM' | 'LONG_TERM' | 'PERMANENT';
}
```

## 🚨 Incident Response

### Security Incident Playbooks

#### 1. Compromised Service Principal
```bash
#!/bin/bash
# incident-response/compromised-sp.sh

echo "🚨 SECURITY INCIDENT: Compromised Service Principal"

# 1. Immediately disable the service principal
az ad sp update --id $COMPROMISED_SP_ID --set accountEnabled=false

# 2. Revoke all active sessions
az ad sp credential delete --id $COMPROMISED_SP_ID --key-id $KEY_ID

# 3. Emergency disable RBAC processing
kubectl patch configmap platform-config -n platform-system \
  --type merge -p '{"data":{"RBAC_ENABLED":"false"}}'

# 4. Scale down Platform API
kubectl scale deployment platform-api -n platform-system --replicas=0

# 5. Create new service principal
NEW_SP=$(az ad sp create-for-rbac --name platform-rbac-service-emergency \
  --role "AKS RBAC Admin" \
  --scopes /subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG_NAME)

# 6. Update secrets
kubectl patch secret azure-sp-secret -n platform-system \
  --type merge -p "{\"data\":{\"AZURE_CLIENT_SECRET\":\"$(echo -n $NEW_CLIENT_SECRET | base64)\"}}"

# 7. Re-enable service
kubectl scale deployment platform-api -n platform-system --replicas=3
kubectl patch configmap platform-config -n platform-system \
  --type merge -p '{"data":{"RBAC_ENABLED":"true"}}'

echo "✅ Emergency response completed. Review audit logs immediately."
```

#### 2. Mass Unauthorized Access
```bash
#!/bin/bash
# incident-response/mass-unauthorized-access.sh

echo "🚨 SECURITY INCIDENT: Mass Unauthorized Access Detected"

# 1. Identify affected namespaces
AFFECTED_NS=$(kubectl get roleassignments -n aso-system \
  --field-selector metadata.creationTimestamp>$(date -d "1 hour ago" --iso-8601) \
  -o jsonpath='{.items[*].metadata.labels.platform\.io/namespace}' | tr ' ' '\n' | sort -u)

# 2. Emergency suspend recent role assignments
for ns in $AFFECTED_NS; do
  kubectl get roleassignments -n aso-system \
    -l platform.io/namespace=$ns \
    -o name | xargs kubectl patch -n aso-system --type merge \
    -p '{"spec":{"suspended":true}}'
done

# 3. Alert security team
curl -X POST $SECURITY_WEBHOOK_URL \
  -d "{\"text\":\"🚨 Mass unauthorized RBAC access detected. $AFFECTED_NS namespaces suspended.\"}"

# 4. Generate incident report
echo "Incident Report - $(date)" > /tmp/security-incident-$(date +%s).txt
echo "Affected Namespaces: $AFFECTED_NS" >> /tmp/security-incident-$(date +%s).txt
kubectl get roleassignments -n aso-system -o yaml >> /tmp/security-incident-$(date +%s).txt

echo "✅ Emergency containment completed. Investigate affected role assignments."
```

### Forensic Data Collection

#### Log Collection Script
```bash
#!/bin/bash
# forensics/collect-rbac-logs.sh

INCIDENT_DATE="$1"
OUTPUT_DIR="/forensics/rbac-incident-$(date +%s)"

mkdir -p $OUTPUT_DIR

# 1. Platform API logs
kubectl logs -n platform-system deployment/platform-api \
  --since-time="${INCIDENT_DATE}" > $OUTPUT_DIR/platform-api.log

# 2. ASO controller logs
kubectl logs -n aso-system deployment/azureserviceoperator-controller-manager \
  --since-time="${INCIDENT_DATE}" > $OUTPUT_DIR/aso-controller.log

# 3. RBAC audit events
kubectl logs -n platform-system deployment/platform-api \
  --since-time="${INCIDENT_DATE}" | grep "RBAC_OPERATION" > $OUTPUT_DIR/rbac-audit.log

# 4. Current state snapshot
kubectl get roleassignments -n aso-system -o yaml > $OUTPUT_DIR/current-assignments.yaml
kubectl get configmaps -n platform-system -o yaml > $OUTPUT_DIR/current-config.yaml

# 5. Network traffic (if available)
tcpdump -w $OUTPUT_DIR/network-capture.pcap -i any host platform-api.platform-system.svc.cluster.local

# 6. Azure audit logs (requires Azure CLI)
az monitor activity-log list --start-time "${INCIDENT_DATE}" \
  --resource-group $RESOURCE_GROUP \
  --output json > $OUTPUT_DIR/azure-audit.json

echo "✅ Forensic data collected in $OUTPUT_DIR"
```

## ✅ Security Checklist

### Pre-Production Security Review

- [ ] **Authentication & Authorization**
  - [ ] Azure AD integration properly configured
  - [ ] JWT token validation implemented
  - [ ] Role-based access control enforced
  - [ ] Namespace scoping verified

- [ ] **Data Protection**
  - [ ] All secrets stored in Azure Key Vault
  - [ ] TLS 1.3 enabled for all communications
  - [ ] Data encryption at rest configured
  - [ ] Certificate-based authentication enabled

- [ ] **API Security**
  - [ ] Rate limiting implemented and tested
  - [ ] Circuit breakers configured
  - [ ] Input validation and sanitization
  - [ ] CORS policies properly configured

- [ ] **Monitoring & Logging**
  - [ ] Comprehensive audit logging enabled
  - [ ] Security metrics dashboard configured
  - [ ] Alert rules defined and tested
  - [ ] Log retention policies set

- [ ] **Network Security**
  - [ ] Private endpoints configured
  - [ ] Network security groups configured
  - [ ] WAF rules implemented
  - [ ] Geographic restrictions enabled

- [ ] **Incident Response**
  - [ ] Security playbooks documented
  - [ ] Emergency response procedures tested
  - [ ] Forensic data collection automated
  - [ ] Security team contacts verified

### Production Security Validation

```bash
#!/bin/bash
# scripts/security-validation.sh

echo "🔍 Running Production Security Validation"

# 1. Verify TLS configuration
echo "Checking TLS configuration..."
openssl s_client -connect platform-api.company.com:443 -tls1_3 2>/dev/null | grep "TLSv1.3"

# 2. Test rate limiting
echo "Testing rate limiting..."
for i in {1..12}; do
  curl -w "%{http_code}\n" -s -o /dev/null https://platform-api.company.com/api/platform/namespaces
done

# 3. Verify authentication
echo "Testing authentication..."
curl -H "Authorization: Bearer invalid-token" https://platform-api.company.com/api/platform/namespaces 2>/dev/null | grep -q "401"

# 4. Check circuit breaker status
echo "Checking circuit breaker health..."
curl -s https://platform-api.company.com/health/detailed | jq '.circuitBreakers'

# 5. Verify audit logging
echo "Testing audit logging..."
kubectl logs -n platform-system deployment/platform-api --tail=10 | grep "RBAC_OPERATION"

echo "✅ Security validation completed"
```

## 📋 Compliance & Governance

### Regulatory Compliance

#### SOC 2 Type II Controls
- **CC6.1:** Logical access controls restrict unauthorized access
- **CC6.2:** Transmission and disposal of confidential information is protected
- **CC6.3:** Access rights are reviewed and approved periodically
- **CC7.1:** Data is classified and appropriate controls are implemented

#### GDPR Compliance
- **Article 25:** Privacy by Design implemented
- **Article 32:** Appropriate security measures in place
- **Article 35:** Data Protection Impact Assessment completed

### Security Governance

#### Quarterly Security Review Process
1. **Access Review:** Validate all role assignments are still necessary
2. **Threat Assessment:** Update threat model based on new attack vectors
3. **Penetration Testing:** Conduct third-party security assessment
4. **Compliance Audit:** Verify continued adherence to standards

#### Security Metrics Reporting
```typescript
// Monthly security report generation
export const generateSecurityReport = async (month: string): Promise<SecurityReport> => {
  return {
    period: month,
    totalRBACOperations: await getMetric('rbac_operations_total'),
    failedAuthentications: await getMetric('auth_failures_total'),
    securityIncidents: await getIncidentCount(month),
    complianceScore: await calculateComplianceScore(),
    recommendations: await generateSecurityRecommendations()
  };
};
```

---

## 📞 Security Contacts

| Issue Type | Contact | Phone | Email |
|------------|---------|-------|-------|
| **Critical Security Incident** | SOC Team | +1-XXX-XXX-XXXX | soc@company.com |
| **Data Breach** | CISO Office | +1-XXX-XXX-XXXX | security@company.com |
| **Compliance Issues** | Legal Team | +1-XXX-XXX-XXXX | legal@company.com |
| **Azure AD Issues** | Identity Team | +1-XXX-XXX-XXXX | identity@company.com |

---

**Document Classification:** CONFIDENTIAL  
**Last Updated:** 2024-01-20  
**Next Review:** 2024-04-20  
**Owner:** Security Engineering Team  
**Approved By:** CISO