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
        error: error.message,
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
        approvalAction: event.action,
        approver: event.approvedBy,
        reason: event.reason
      }
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