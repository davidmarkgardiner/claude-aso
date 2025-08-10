/**
 * Security Policies for Platform API
 * Implements security controls, validation, and audit requirements
 */

import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface SecurityPolicy {
  name: string;
  description: string;
  enforce: boolean;
  validate: (context: any) => Promise<SecurityValidationResult>;
}

export interface SecurityValidationResult {
  valid: boolean;
  violations: string[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityContext {
  userId?: string;
  userEmail?: string;
  userRoles?: string[];
  sourceIP?: string;
  userAgent?: string;
  operation: string;
  resource: string;
  timestamp: Date;
  correlationId?: string;
}

/**
 * Namespace Creation Security Policy
 */
export const namespaceCreationPolicy: SecurityPolicy = {
  name: 'namespace-creation-policy',
  description: 'Validates namespace creation requests for security compliance',
  enforce: true,
  validate: async (context: SecurityContext): Promise<SecurityValidationResult> => {
    const violations: string[] = [];
    const recommendations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Validate user authentication
    if (!context.userId || !context.userEmail) {
      violations.push('User must be authenticated to create namespaces');
      riskLevel = 'critical';
    }

    // Validate source IP (if configured)
    if (config.nodeEnv === 'production' && context.sourceIP) {
      const allowedIPRanges = process.env.ALLOWED_IP_RANGES?.split(',') || [];
      if (allowedIPRanges.length > 0 && !isIPAllowed(context.sourceIP, allowedIPRanges)) {
        violations.push(`Source IP ${context.sourceIP} not in allowed ranges`);
        riskLevel = 'high';
      }
    }

    // Validate namespace naming
    const namespaceName = context.resource;
    if (!isValidNamespaceName(namespaceName)) {
      violations.push('Namespace name violates naming conventions');
      recommendations.push('Use lowercase letters, numbers, and hyphens only');
      riskLevel = 'medium';
    }

    // Check for reserved names
    if (isReservedNamespace(namespaceName)) {
      violations.push('Cannot use reserved namespace names');
      riskLevel = 'high';
    }

    return {
      valid: violations.length === 0,
      violations,
      recommendations,
      riskLevel
    };
  }
};

/**
 * RBAC Assignment Security Policy
 */
export const rbacAssignmentPolicy: SecurityPolicy = {
  name: 'rbac-assignment-policy',
  description: 'Validates RBAC assignments for principle of least privilege',
  enforce: true,
  validate: async (context: SecurityContext & { roleDefinition?: string; principalId?: string }): Promise<SecurityValidationResult> => {
    const violations: string[] = [];
    const recommendations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Validate role assignment
    if (context.roleDefinition === 'aks-rbac-cluster-admin' && config.nodeEnv === 'production') {
      violations.push('Cluster admin role assignments require approval in production');
      riskLevel = 'critical';
    }

    // Validate principal ID format
    if (context.principalId && !isValidAzureGuid(context.principalId)) {
      violations.push('Invalid Azure AD principal ID format');
      riskLevel = 'high';
    }

    // Check for overprivileged assignments
    if (context.roleDefinition === 'aks-rbac-admin' && config.nodeEnv === 'production') {
      recommendations.push('Consider using more restrictive roles like aks-rbac-writer for most use cases');
      riskLevel = 'medium';
    }

    return {
      valid: violations.length === 0,
      violations,
      recommendations,
      riskLevel
    };
  }
};

/**
 * Resource Quota Security Policy
 */
export const resourceQuotaPolicy: SecurityPolicy = {
  name: 'resource-quota-policy',
  description: 'Ensures proper resource limits are applied to prevent resource exhaustion',
  enforce: true,
  validate: async (context: SecurityContext & { resourceTier?: string; quotaLimits?: any }): Promise<SecurityValidationResult> => {
    const violations: string[] = [];
    const recommendations: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Validate resource tier
    const validTiers = ['small', 'medium', 'large'];
    if (context.resourceTier && !validTiers.includes(context.resourceTier)) {
      violations.push(`Invalid resource tier: ${context.resourceTier}`);
      riskLevel = 'medium';
    }

    // Validate quota limits are not excessive
    if (context.quotaLimits) {
      const maxCpu = parseFloat(context.quotaLimits['limits.cpu'] || '0');
      const maxMemory = parseResourceMemory(context.quotaLimits['limits.memory'] || '0Gi');

      if (maxCpu > 32) {
        violations.push('CPU limit exceeds maximum allowed (32 cores)');
        riskLevel = 'high';
      }

      if (maxMemory > 128) { // 128 GiB
        violations.push('Memory limit exceeds maximum allowed (128 GiB)');
        riskLevel = 'high';
      }

      if (maxCpu > 16) {
        recommendations.push('Consider if high CPU limits are necessary for this workload');
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      recommendations,
      riskLevel
    };
  }
};

/**
 * Security Policy Engine
 */
export class SecurityPolicyEngine {
  private policies: SecurityPolicy[];

  constructor() {
    this.policies = [
      namespaceCreationPolicy,
      rbacAssignmentPolicy,
      resourceQuotaPolicy
    ];
  }

  async validateOperation(operation: string, context: SecurityContext): Promise<SecurityValidationResult> {
    const applicablePolicies = this.policies.filter(policy => 
      this.isPolicyApplicable(policy, operation)
    );

    const results = await Promise.all(
      applicablePolicies.map(policy => policy.validate(context))
    );

    // Aggregate results
    const allViolations = results.flatMap(r => r.violations);
    const allRecommendations = results.flatMap(r => r.recommendations);
    const maxRiskLevel = results.reduce((max, r) => 
      getRiskLevelPriority(r.riskLevel) > getRiskLevelPriority(max) ? r.riskLevel : max,
      'low' as const
    );

    const aggregatedResult: SecurityValidationResult = {
      valid: allViolations.length === 0,
      violations: [...new Set(allViolations)], // Remove duplicates
      recommendations: [...new Set(allRecommendations)],
      riskLevel: maxRiskLevel
    };

    // Log security validation results
    if (!aggregatedResult.valid || aggregatedResult.riskLevel === 'high' || aggregatedResult.riskLevel === 'critical') {
      logger.warn('Security policy validation failed or high risk detected', {
        operation,
        violations: aggregatedResult.violations,
        riskLevel: aggregatedResult.riskLevel,
        correlationId: context.correlationId,
        userId: context.userId
      });
    }

    return aggregatedResult;
  }

  private isPolicyApplicable(policy: SecurityPolicy, operation: string): boolean {
    const policyOperationMap: { [key: string]: string[] } = {
      [namespaceCreationPolicy.name]: ['create-namespace'],
      [rbacAssignmentPolicy.name]: ['create-rbac', 'assign-role'],
      [resourceQuotaPolicy.name]: ['create-namespace', 'update-quota']
    };

    return policyOperationMap[policy.name]?.includes(operation) || false;
  }

  addPolicy(policy: SecurityPolicy): void {
    this.policies.push(policy);
  }

  removePolicy(policyName: string): void {
    this.policies = this.policies.filter(p => p.name !== policyName);
  }

  listPolicies(): SecurityPolicy[] {
    return [...this.policies];
  }
}

// Utility functions
function isValidNamespaceName(name: string): boolean {
  // Kubernetes namespace naming rules
  const nameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  return nameRegex.test(name) && name.length <= 63;
}

function isReservedNamespace(name: string): boolean {
  const reservedNames = [
    'kube-system',
    'kube-public',
    'kube-node-lease',
    'azure-system',
    'aso-system',
    'istio-system',
    'platform-system',
    'default',
    'cert-manager',
    'external-dns'
  ];
  return reservedNames.includes(name);
}

function isValidAzureGuid(guid: string): boolean {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return guidRegex.test(guid);
}

function isIPAllowed(ip: string, allowedRanges: string[]): boolean {
  // Simple implementation - in production, use a proper CIDR library
  return allowedRanges.some(range => {
    if (range.includes('/')) {
      // CIDR notation - simplified check
      const [rangeIP] = range.split('/');
      return ip.startsWith(rangeIP.substring(0, rangeIP.lastIndexOf('.')));
    } else {
      // Exact IP match
      return ip === range;
    }
  });
}

function parseResourceMemory(memoryString: string): number {
  // Parse memory string like "8Gi", "1024Mi" to GiB
  const match = memoryString.match(/^(\d+(?:\.\d+)?)(Gi|Mi|G|M)?$/);
  if (!match) return 0;

  const [, value, unit] = match;
  const numValue = parseFloat(value);

  switch (unit) {
    case 'Gi': return numValue;
    case 'Mi': return numValue / 1024;
    case 'G': return numValue * 0.931; // GB to GiB
    case 'M': return numValue / 1074; // MB to GiB
    default: return numValue / (1024 * 1024 * 1024); // Bytes to GiB
  }
}

function getRiskLevelPriority(level: 'low' | 'medium' | 'high' | 'critical'): number {
  const priorities = { low: 1, medium: 2, high: 3, critical: 4 };
  return priorities[level];
}

// Singleton instance
let securityPolicyEngine: SecurityPolicyEngine;

export const getSecurityPolicyEngine = (): SecurityPolicyEngine => {
  if (!securityPolicyEngine) {
    securityPolicyEngine = new SecurityPolicyEngine();
  }
  return securityPolicyEngine;
};