import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import { logger } from "../utils/logger";
import { config } from "../config/config";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  groups: string[];
  roles: string[];
  tenant: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Skip auth for health checks and public endpoints
    if (
      req.path === "/health" ||
      req.path === "/" ||
      req.path.startsWith("/public/")
    ) {
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      throw new AuthenticationError("Authentication token required");
    }

    const user = await validateToken(token);
    req.user = user;

    logger.debug("User authenticated successfully", {
      userId: user.id,
      email: user.email,
      groups: user.groups,
    });

    next();
  } catch (error: unknown) {
    logger.warn("Authentication failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      path: req.path,
      ip: req.ip,
    });

    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      res.status(error.statusCode).json({
        error: error.name,
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(401).json({
        error: "AuthenticationError",
        message: "Invalid authentication token",
        timestamp: new Date().toISOString(),
      });
    }
  }
};

function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Check cookie (for browser sessions)
  const cookieToken = req.cookies?.["platform-token"];
  if (cookieToken) {
    return cookieToken;
  }

  // Check query parameter (for API testing - not recommended for production)
  if (config.nodeEnv === "development" && req.query.token) {
    return req.query.token as string;
  }

  return null;
}

async function validateToken(token: string): Promise<AuthenticatedUser> {
  try {
    // First try to validate as JWT
    const decoded = jwt.verify(token, config.jwt.secret) as any;

    if (decoded.iss === config.jwt.issuer) {
      // Platform-issued JWT token
      return {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        groups: decoded.groups || [],
        roles: decoded.roles || [],
        tenant: decoded.tenant || "default",
      };
    }
  } catch (jwtError: unknown) {
    logger.debug("JWT validation failed, trying Azure AD validation", {
      error: jwtError instanceof Error ? jwtError.message : "Unknown JWT error",
    });
  }

  // Try Azure AD token validation
  try {
    const user = await validateAzureAdToken(token);
    return user;
  } catch (azureError: unknown) {
    logger.debug("Azure AD validation failed", {
      error:
        azureError instanceof Error
          ? azureError.message
          : "Unknown Azure AD error",
    });
    throw new AuthenticationError("Invalid authentication token");
  }
}

async function validateAzureAdToken(token: string): Promise<AuthenticatedUser> {
  try {
    // Get Microsoft Graph API user info
    const response = await axios.get("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 5000,
    });

    const userData = response.data;

    // Get user's group memberships
    const groupsResponse = await axios.get(
      "https://graph.microsoft.com/v1.0/me/memberOf",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 5000,
      },
    );

    const groups = groupsResponse.data.value
      .filter((group: any) => group["@odata.type"] === "#microsoft.graph.group")
      .map((group: any) => group.displayName);

    // Map groups to roles based on your organization's structure
    const roles = mapGroupsToRoles(groups);

    return {
      id: userData.id,
      email: userData.mail || userData.userPrincipalName,
      name: userData.displayName,
      groups,
      roles,
      tenant: extractTenantFromEmail(
        userData.mail || userData.userPrincipalName,
      ),
    };
  } catch (error: unknown) {
    logger.error("Azure AD token validation failed:", error);
    throw new AuthenticationError("Invalid Azure AD token");
  }
}

function mapGroupsToRoles(groups: string[]): string[] {
  const roleMapping: Record<string, string[]> = {
    // Platform team roles
    "Platform-Admins": ["platform:admin", "namespace:admin"],
    "Platform-Engineers": ["platform:engineer", "namespace:admin"],
    "Platform-Viewers": ["platform:viewer"],

    // Team-specific roles
    "Frontend-Team-Admins": ["team:frontend:admin", "namespace:admin"],
    "Frontend-Team-Developers": [
      "team:frontend:developer",
      "namespace:developer",
    ],
    "Backend-Team-Admins": ["team:backend:admin", "namespace:admin"],
    "Backend-Team-Developers": [
      "team:backend:developer",
      "namespace:developer",
    ],
    "Data-Team-Admins": ["team:data:admin", "namespace:admin"],
    "Data-Team-Developers": ["team:data:developer", "namespace:developer"],

    // Environment-specific roles
    "Production-Admins": ["env:production:admin"],
    "Staging-Admins": ["env:staging:admin"],
    "Development-Users": ["env:development:user"],
  };

  const roles = new Set<string>();

  groups.forEach((group) => {
    const mappedRoles = roleMapping[group];
    if (mappedRoles) {
      mappedRoles.forEach((role) => roles.add(role));
    }
  });

  // Default role for authenticated users
  roles.add("user:authenticated");

  return Array.from(roles);
}

function extractTenantFromEmail(email: string): string {
  // Extract team from email domain or username
  // This is organization-specific logic

  if (email.includes("frontend")) return "frontend";
  if (email.includes("backend")) return "backend";
  if (email.includes("data")) return "data";
  if (email.includes("platform")) return "platform";

  // Default tenant
  return "default";
}

// Authorization middleware for specific permissions
export const requireRole = (requiredRoles: string | string[]) => {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: "AuthenticationError",
        message: "Authentication required",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hasRequiredRole = roles.some((role) =>
      req.user!.roles.includes(role),
    );

    if (!hasRequiredRole) {
      logger.warn("Authorization failed", {
        userId: req.user.id,
        userRoles: req.user.roles,
        requiredRoles: roles,
        path: req.path,
      });

      res.status(403).json({
        error: "AuthorizationError",
        message: `Insufficient permissions. Required roles: ${roles.join(", ")}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
};

// Team authorization middleware
export const requireTeamAccess = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({
      error: "AuthenticationError",
      message: "Authentication required",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const requestedTeam = req.params.team || req.body.team;

  if (!requestedTeam) {
    return next(); // No team specified, continue
  }

  // Platform admins can access any team
  if (req.user.roles.includes("platform:admin")) {
    return next();
  }

  // Check if user has access to the requested team
  const hasTeamAccess = req.user.roles.some(
    (role) =>
      role.startsWith(`team:${requestedTeam}:`) ||
      role === `team:${requestedTeam}`,
  );

  if (!hasTeamAccess) {
    logger.warn("Team authorization failed", {
      userId: req.user.id,
      requestedTeam,
      userRoles: req.user.roles,
      path: req.path,
    });

    res.status(403).json({
      error: "AuthorizationError",
      message: `Access denied to team: ${requestedTeam}`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
};

// Utility function to generate platform JWT tokens
export const generatePlatformToken = (
  user: Partial<AuthenticatedUser>,
): string => {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    groups: user.groups || [],
    roles: user.roles || [],
    tenant: user.tenant || "default",
    iss: config.jwt.issuer,
    aud: config.jwt.audience,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  };

  return jwt.sign(payload, config.jwt.secret);
};
