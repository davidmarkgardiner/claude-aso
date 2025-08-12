import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { auditService } from "../services/auditService";

// Rate limit configurations for different RBAC operations
export const rbacRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 RBAC requests per window per IP
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many RBAC requests from this IP, please try again later",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Use user ID if authenticated, otherwise fall back to IP
    return req.user?.id || req.ip || "unknown";
  },
  handler: async (req: Request, res: Response) => {
    // Log rate limit violations for security monitoring
    logger.warn("RBAC rate limit exceeded", {
      ip: req.ip,
      userId: req.user?.id,
      userAgent: req.get("user-agent"),
      path: req.path,
      method: req.method,
    });

    // Create audit event for rate limiting
    await auditService.logRBACEvent({
      action: "create", // The attempted action
      namespace: req.params.namespaceName || "unknown",
      principalId: "rate-limited",
      principalType: "User",
      roleDefinition: "unknown",
      clusterName: "unknown",
      requestedBy: {
        userId: req.user?.id || "anonymous",
        email: req.user?.email || "anonymous@unknown.com",
        roles: req.user?.roles || [],
      },
      sourceIP: req.ip || "unknown",
      userAgent: req.get("user-agent") || "unknown",
      correlationId:
        (req.headers["x-correlation-id"] as string) || "rate-limited",
      timestamp: new Date().toISOString(),
      success: false,
      error: "Rate limit exceeded",
    });

    res.status(429).json({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many RBAC requests from this IP, please try again later",
      retryAfter: 900, // 15 minutes in seconds
      timestamp: new Date().toISOString(),
    });
  },
});

// More restrictive rate limiting for admin role assignments
export const adminRoleRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 admin role assignments per hour per user
  message: {
    error: "ADMIN_RATE_LIMIT_EXCEEDED",
    message: "Too many admin role assignment requests, please try again later",
    retryAfter: "1 hour",
  },
  skip: (req: Request) => {
    // Only apply to admin role requests
    const body = req.body;
    return body.roleDefinition !== "aks-rbac-admin";
  },
  keyGenerator: (req: Request): string => {
    // Always use user ID for admin operations
    return req.user?.id || "anonymous";
  },
  handler: async (req: Request, res: Response) => {
    logger.error("Admin role assignment rate limit exceeded", {
      userId: req.user?.id,
      email: req.user?.email,
      ip: req.ip,
      namespace: req.params.namespaceName,
      timestamp: new Date().toISOString(),
    });

    // This is a high-severity security event
    await auditService.logRBACEvent({
      action: "create",
      namespace: req.params.namespaceName || "unknown",
      principalId: req.body?.principalId || "unknown",
      principalType: "User",
      roleDefinition: "aks-rbac-admin",
      clusterName: req.body?.clusterName || "unknown",
      requestedBy: {
        userId: req.user?.id || "anonymous",
        email: req.user?.email || "anonymous@unknown.com",
        roles: req.user?.roles || [],
      },
      sourceIP: req.ip || "unknown",
      userAgent: req.get("user-agent") || "unknown",
      correlationId:
        (req.headers["x-correlation-id"] as string) || "admin-rate-limited",
      timestamp: new Date().toISOString(),
      success: false,
      error:
        "Admin role assignment rate limit exceeded - potential security concern",
    });

    res.status(429).json({
      error: "ADMIN_RATE_LIMIT_EXCEEDED",
      message:
        "Too many admin role assignment requests. Admin role assignments are limited for security reasons.",
      retryAfter: 3600, // 1 hour in seconds
      timestamp: new Date().toISOString(),
      recommendation:
        "Consider using lower-privileged roles or contact your administrator",
    });
  },
});

// Global rate limiting for all Platform API endpoints
export const globalRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 requests per 5 minutes per IP
  message: {
    error: "GLOBAL_RATE_LIMIT_EXCEEDED",
    message: "Too many requests from this IP, please slow down",
    retryAfter: "5 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return req.ip || "unknown";
  },
  handler: (req: Request, res: Response) => {
    logger.warn("Global rate limit exceeded", {
      ip: req.ip,
      userId: req.user?.id,
      path: req.path,
      method: req.method,
      userAgent: req.get("user-agent"),
    });

    res.status(429).json({
      error: "GLOBAL_RATE_LIMIT_EXCEEDED",
      message: "Too many requests from this IP, please slow down",
      retryAfter: 300, // 5 minutes in seconds
      timestamp: new Date().toISOString(),
    });
  },
});

// Sliding window rate limiter for burst protection
export const burstProtectionLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute sliding window
  max: 20, // 20 requests per minute per user
  message: {
    error: "BURST_LIMIT_EXCEEDED",
    message: "Request rate too high, please slow down",
    retryAfter: "1 minute",
  },
  keyGenerator: (req: Request): string => {
    return req.user?.id || req.ip || "unknown";
  },
});

// Rate limiting configuration based on user roles
export const createRoleBasedRateLimit = (role: string) => {
  const limits: { [key: string]: { windowMs: number; max: number } } = {
    "platform:admin": { windowMs: 5 * 60 * 1000, max: 50 }, // Higher limits for platform admins
    "namespace:admin": { windowMs: 15 * 60 * 1000, max: 20 }, // Medium limits for namespace admins
    developer: { windowMs: 15 * 60 * 1000, max: 10 }, // Standard limits for developers
    viewer: { windowMs: 15 * 60 * 1000, max: 5 }, // Lower limits for viewers
  };

  const config = limits[role] || limits["viewer"]; // Default to most restrictive

  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    keyGenerator: (req: Request): string => {
      return `${role}:${req.user?.id || req.ip}`;
    },
    message: {
      error: "ROLE_RATE_LIMIT_EXCEEDED",
      message: `Rate limit exceeded for role '${role}'`,
      retryAfter: `${Math.ceil(config.windowMs / 60000)} minutes`,
    },
  });
};

export default {
  rbacRateLimit,
  adminRoleRateLimit,
  globalRateLimit,
  burstProtectionLimit,
  createRoleBasedRateLimit,
};
