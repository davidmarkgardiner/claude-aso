import { logger } from '../utils/logger';

export interface RBACauditEvent {
  action: 'create' | 'update' | 'delete' | 'list' | 'get';
  namespace: string;
  principalId: string;
  principalType: 'User' | 'Group';
  roleDefinition: string;
  clusterName: string;
  requestedBy: {
    userId: string;
    email: string;
    roles: string[];
  };
  sourceIP: string;
  userAgent: string;
  correlationId: string;
  timestamp: string;
  success: boolean;
  error?: string;
  details?: {
    roleAssignmentIds?: string[];
    scope?: string;
    duration?: number;
  };
}

export class AuditService {
  private static instance: AuditService;

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log RBAC audit event for compliance and security monitoring
   */
  async logRBACEvent(event: RBACauditEvent): Promise<void> {
    try {
      // Structure the log entry for security monitoring
      const auditLog = {
        eventType: 'RBAC_OPERATION',
        category: 'SECURITY',
        severity: this.determineEventSeverity(event),
        ...event,
        // Add additional context
        resourceType: 'namespace',
        resourceName: event.namespace,
        operation: `rbac.${event.action}`,
        // Compliance fields
        complianceCategory: 'ACCESS_CONTROL',
        dataClassification: 'INTERNAL',
        retention: '7_YEARS' // For compliance requirements
      };

      // Log to structured logger (will be picked up by log aggregation)
      logger.info('RBAC Audit Event', auditLog);

      // In production, also send to dedicated audit store
      if (process.env.NODE_ENV === 'production') {
        await this.sendToAuditStore(auditLog);
      }

      // Alert on high-severity events
      if (auditLog.severity === 'HIGH') {
        await this.sendSecurityAlert(auditLog);
      }

    } catch (error) {
      // Never fail the main operation due to audit logging issues
      logger.error('Failed to log audit event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        originalEvent: event
      });
    }
  }

  /**
   * Log approval workflow events for admin role assignments
   */
  async logApprovalEvent(event: {
    namespace: string;
    principalId: string;
    roleDefinition: string;
    requestedBy: string;
    approvedBy?: string;
    action: 'requested' | 'approved' | 'rejected';
    reason?: string;
    correlationId: string;
  }): Promise<void> {
    const auditEvent: Partial<RBACauditEvent> = {
      action: 'create', // Will be 'requested', 'approved', or 'rejected' in details
      namespace: event.namespace,
      principalId: event.principalId,
      roleDefinition: event.roleDefinition,
      correlationId: event.correlationId,
      timestamp: new Date().toISOString(),
      success: event.action === 'approved',
      details: {
        roleAssignmentIds: [],
        scope: event.reason,
        duration: undefined
      } as any
    };

    logger.info('RBAC Approval Event', {
      eventType: 'RBAC_APPROVAL',
      category: 'SECURITY',
      severity: 'MEDIUM',
      ...auditEvent
    });
  }

  /**
   * Create audit log query for compliance reporting
   */
  async queryAuditLogs(filter: {
    startDate: Date;
    endDate: Date;
    namespace?: string;
    principalId?: string;
    action?: string;
    userId?: string;
  }): Promise<RBACauditEvent[]> {
    // In production, this would query the audit store
    // For now, return empty array as this would be implemented
    // with your log aggregation system (ELK, Splunk, etc.)
    logger.info('Audit log query requested', filter);
    return [];
  }

  /**
   * Log security policy validation events
   */
  async logSecurityPolicyEvent(event: {
    operation: string;
    resource: string;
    userId?: string;
    violations: string[];
    recommendations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    correlationId?: string;
    sourceIP?: string;
  }): Promise<void> {
    try {
      const auditLog = {
        eventType: 'SECURITY_POLICY_VALIDATION',
        category: 'SECURITY',
        severity: this.mapRiskLevelToSeverity(event.riskLevel),
        timestamp: new Date().toISOString(),
        operation: event.operation,
        resource: event.resource,
        userId: event.userId,
        sourceIP: event.sourceIP,
        correlationId: event.correlationId,
        success: event.violations.length === 0,
        violations: event.violations,
        recommendations: event.recommendations,
        riskLevel: event.riskLevel,
        complianceCategory: 'SECURITY_POLICY',
        dataClassification: 'INTERNAL'
      };

      logger.info('Security Policy Validation Event', auditLog);

      // Alert on policy violations
      if (event.violations.length > 0 || event.riskLevel === 'high' || event.riskLevel === 'critical') {
        await this.sendSecurityAlert({
          ...auditLog,
          alertReason: 'Security policy violation detected'
        });
      }

    } catch (error: unknown) {
      logger.error('Failed to log security policy event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        originalEvent: event
      });
    }
  }

  /**
   * Log managed identity authentication events
   */
  async logManagedIdentityEvent(event: {
    operation: 'authentication' | 'token_refresh' | 'validation';
    success: boolean;
    clientId?: string;
    error?: string;
    duration?: number;
    correlationId?: string;
  }): Promise<void> {
    try {
      const auditLog = {
        eventType: 'MANAGED_IDENTITY_AUTH',
        category: 'AUTHENTICATION',
        severity: event.success ? 'LOW' : 'HIGH',
        timestamp: new Date().toISOString(),
        operation: `managed_identity.${event.operation}`,
        success: event.success,
        clientId: event.clientId?.substring(0, 8) + '***', // Masked for security
        error: event.error,
        duration: event.duration,
        correlationId: event.correlationId,
        complianceCategory: 'AUTHENTICATION',
        dataClassification: 'SENSITIVE'
      };

      logger.info('Managed Identity Event', auditLog);

      // Alert on authentication failures
      if (!event.success) {
        await this.sendSecurityAlert({
          ...auditLog,
          alertReason: 'Managed identity authentication failure'
        });
      }

    } catch (error) {
      logger.error('Failed to log managed identity event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        originalEvent: event
      });
    }
  }

  /**
   * Log namespace lifecycle events
   */
  async logNamespaceEvent(event: {
    action: 'create' | 'update' | 'delete';
    namespaceName: string;
    teamName?: string;
    environment?: string;
    resourceTier?: string;
    features?: string[];
    userId?: string;
    success: boolean;
    error?: string;
    duration?: number;
    correlationId?: string;
  }): Promise<void> {
    try {
      const auditLog = {
        eventType: 'NAMESPACE_LIFECYCLE',
        category: 'RESOURCE_MANAGEMENT',
        severity: this.determineNamespaceEventSeverity(event),
        timestamp: new Date().toISOString(),
        operation: `namespace.${event.action}`,
        resource: event.namespaceName,
        resourceType: 'namespace',
        success: event.success,
        error: event.error,
        duration: event.duration,
        correlationId: event.correlationId,
        userId: event.userId,
        teamName: event.teamName,
        environment: event.environment,
        resourceTier: event.resourceTier,
        features: event.features,
        complianceCategory: 'RESOURCE_LIFECYCLE',
        dataClassification: 'INTERNAL'
      };

      logger.info('Namespace Lifecycle Event', auditLog);

      // Alert on namespace deletion or failures
      if (!event.success || event.action === 'delete') {
        await this.sendSecurityAlert({
          ...auditLog,
          alertReason: event.action === 'delete' ? 'Namespace deletion performed' : 'Namespace operation failed'
        });
      }

    } catch (error) {
      logger.error('Failed to log namespace event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        originalEvent: event
      });
    }
  }

  /**
   * Generate comprehensive audit report for compliance
   */
  async generateComplianceReport(period: {
    startDate: Date;
    endDate: Date;
    includeMetrics?: boolean;
  }): Promise<any> {
    try {
      const report = {
        reportId: `compliance-${Date.now()}`,
        generatedAt: new Date().toISOString(),
        period: {
          start: period.startDate.toISOString(),
          end: period.endDate.toISOString()
        },
        complianceFramework: 'SOC2',
        summary: {
          totalAuditEvents: 0,
          securityEvents: 0,
          policyViolations: 0,
          authenticationEvents: 0,
          namespaceOperations: 0,
          rbacOperations: 0,
          successRate: 100,
          complianceStatus: 'COMPLIANT'
        },
        riskAssessment: {
          overallRisk: 'LOW',
          criticalIssues: 0,
          highRiskEvents: 0,
          recommendedActions: []
        },
        topUsers: [],
        frequentOperations: [],
        securityIncidents: [],
        metrics: period.includeMetrics ? await this.generateAuditMetrics(period) : undefined
      };

      logger.info('Compliance report generated', {
        reportId: report.reportId,
        period: report.period,
        framework: report.complianceFramework
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate compliance report', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private mapRiskLevelToSeverity(riskLevel: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    switch (riskLevel) {
      case 'critical': return 'HIGH';
      case 'high': return 'HIGH';
      case 'medium': return 'MEDIUM';
      case 'low': 
      default: return 'LOW';
    }
  }

  private determineNamespaceEventSeverity(event: any): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (!event.success) return 'HIGH';
    if (event.action === 'delete') return 'HIGH';
    if (event.action === 'create' || event.action === 'update') return 'MEDIUM';
    return 'LOW';
  }

  private async generateAuditMetrics(_period: any): Promise<any> {
    // In production, this would query the audit store for metrics
    return {
      eventsByType: {},
      eventsByUser: {},
      successRates: {},
      responseTimeTrends: {},
      securityTrends: {},
      complianceMetrics: {}
    };
  }

  private determineEventSeverity(event: RBACauditEvent): 'LOW' | 'MEDIUM' | 'HIGH' {
    // High severity events
    if (!event.success) return 'HIGH';
    if (event.action === 'delete') return 'HIGH';
    if (event.roleDefinition === 'aks-rbac-admin') return 'HIGH';
    
    // Medium severity events
    if (event.action === 'create' || event.action === 'update') return 'MEDIUM';
    
    // Low severity events (read operations)
    return 'LOW';
  }

  private async sendToAuditStore(auditLog: any): Promise<void> {
    // In production, implement sending to dedicated audit store
    // Examples:
    // - Azure Monitor/Log Analytics
    // - AWS CloudTrail
    // - Splunk
    // - ELK Stack
    // - Database audit table
    
    // For now, just ensure it's logged at INFO level so it's captured
    logger.info('Audit store entry', { auditStoreDestination: 'pending_implementation', ...auditLog });
  }

  private async sendSecurityAlert(auditLog: any): Promise<void> {
    // In production, send alerts for high-severity events
    // Examples:
    // - PagerDuty
    // - Slack notifications
    // - Email alerts
    // - SIEM integration
    
    logger.warn('High-severity RBAC event detected', {
      alertType: 'SECURITY_EVENT',
      requiresReview: true,
      ...auditLog
    });
  }
}

export const auditService = AuditService.getInstance();