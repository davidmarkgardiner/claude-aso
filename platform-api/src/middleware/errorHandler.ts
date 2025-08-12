import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Log the error
  logger.error("API Error", {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      userId: req.user?.id,
      userEmail: req.user?.email,
    },
  });

  // Default error response
  let statusCode = error.statusCode || 500;
  let message = error.message || "Internal Server Error";
  let code = error.code || "INTERNAL_ERROR";

  // Handle specific error types
  switch (error.name) {
    case "ValidationError":
      statusCode = 400;
      code = "VALIDATION_ERROR";
      break;

    case "CastError":
      statusCode = 400;
      code = "INVALID_FORMAT";
      message = "Invalid data format provided";
      break;

    case "MongoError":
    case "MongooseError":
      statusCode = 500;
      code = "DATABASE_ERROR";
      message = "Database operation failed";
      break;

    case "JsonWebTokenError":
      statusCode = 401;
      code = "INVALID_TOKEN";
      message = "Invalid authentication token";
      break;

    case "TokenExpiredError":
      statusCode = 401;
      code = "TOKEN_EXPIRED";
      message = "Authentication token has expired";
      break;

    case "AuthenticationError":
      statusCode = 401;
      code = "AUTHENTICATION_ERROR";
      break;

    case "AuthorizationError":
      statusCode = 403;
      code = "AUTHORIZATION_ERROR";
      break;

    case "AxiosError":
      // Handle external API errors
      if (error.details?.response?.status) {
        statusCode =
          error.details.response.status >= 500
            ? 502
            : error.details.response.status;
        code = "EXTERNAL_API_ERROR";
        message = "External service error";
      }
      break;
  }

  // Kubernetes API errors
  if (error.message?.includes("kubernetes")) {
    statusCode = 502;
    code = "KUBERNETES_ERROR";
    message = "Kubernetes API error";
  }

  // Argo Workflows errors
  if (error.message?.includes("workflow")) {
    statusCode = 502;
    code = "WORKFLOW_ERROR";
    message = "Workflow execution error";
  }

  // Don't expose internal error details in production
  const isDevelopment = process.env.NODE_ENV === "development";

  const errorResponse: any = {
    error: code,
    message,
    timestamp: new Date().toISOString(),
    requestId: req.headers["x-request-id"] || "unknown",
  };

  // Add additional details in development
  if (isDevelopment) {
    errorResponse.details = {
      stack: error.stack,
      originalError: error.name,
      ...(error.details && { errorDetails: error.details }),
    };
  }

  // Add validation details if present
  if (error.name === "ValidationError" && error.details) {
    errorResponse.validationErrors = error.details;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper for route handlers
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error classes
export class ValidationError extends Error {
  public statusCode = 400;
  public code = "VALIDATION_ERROR";

  constructor(
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  public statusCode = 404;
  public code = "NOT_FOUND";

  constructor(message: string = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  public statusCode = 409;
  public code = "CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ExternalServiceError extends Error {
  public statusCode = 502;
  public code = "EXTERNAL_SERVICE_ERROR";

  constructor(
    message: string,
    public service: string,
    public details?: any,
  ) {
    super(message);
    this.name = "ExternalServiceError";
  }
}
