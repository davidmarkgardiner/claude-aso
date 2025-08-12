import { Request, Response, NextFunction } from "express";
import {
  authenticateToken,
  requireRole,
  requireTeamAccess,
} from "../../../src/middleware/auth";
import * as jwt from "jsonwebtoken";

// Mock dependencies
jest.mock("jsonwebtoken");
jest.mock("axios");

describe("Authentication Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe("authenticateToken", () => {
    const mockJwtPayload = {
      id: "user-123",
      email: "test@company.com",
      name: "Test User",
      groups: ["frontend-team-developers"],
      roles: ["namespace:developer", "team:frontend:developer"],
      tenant: "frontend",
    };

    it("should authenticate valid JWT token", async () => {
      // Arrange
      mockRequest.headers = {
        authorization: "Bearer valid-jwt-token",
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockJwtPayload);

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockRequest.user).toEqual(mockJwtPayload);
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should reject request without authorization header", async () => {
      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Access denied. No token provided.",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("should reject request with invalid token format", async () => {
      // Arrange
      mockRequest.headers = {
        authorization: "InvalidFormat token",
      };

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid token format. Use Bearer <token>",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("should reject invalid JWT token", async () => {
      // Arrange
      mockRequest.headers = {
        authorization: "Bearer invalid-token",
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid token",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("should handle expired JWT token", async () => {
      // Arrange
      mockRequest.headers = {
        authorization: "Bearer expired-token",
      };

      const error = new Error("Token expired");
      error.name = "TokenExpiredError";
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Token has expired",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe("requireRole", () => {
    const baseUser = {
      id: "user-123",
      email: "test@company.com",
      name: "Test User",
      groups: ["frontend-team-developers"],
      tenant: "frontend",
    };

    it("should allow access when user has required role", () => {
      // Arrange
      mockRequest.user = {
        ...baseUser,
        roles: ["namespace:developer", "team:frontend:developer"],
      };

      const middleware = requireRole(["namespace:developer"]);

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should allow access when user has any of the required roles", () => {
      // Arrange
      mockRequest.user = {
        ...baseUser,
        roles: ["team:frontend:developer"],
      };

      const middleware = requireRole([
        "namespace:admin",
        "team:frontend:developer",
      ]);

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should deny access when user lacks required role", () => {
      // Arrange
      mockRequest.user = {
        ...baseUser,
        roles: ["team:frontend:developer"],
      };

      const middleware = requireRole(["namespace:admin"]);

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Insufficient permissions. Required roles: namespace:admin",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("should deny access when user has no roles", () => {
      // Arrange
      mockRequest.user = {
        ...baseUser,
        roles: [],
      };

      const middleware = requireRole(["namespace:developer"]);

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("should deny access when user is not authenticated", () => {
      // Arrange - no user on request

      const middleware = requireRole(["namespace:developer"]);

      // Act
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe("requireTeamAccess", () => {
    const baseUser = {
      id: "user-123",
      email: "test@company.com",
      name: "Test User",
      groups: ["frontend-team-developers"],
      roles: ["team:frontend:developer"],
      tenant: "frontend",
    };

    it("should allow access when user belongs to the requested team", () => {
      // Arrange
      mockRequest.user = baseUser;
      mockRequest.body = { team: "frontend" };

      // Act
      requireTeamAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should allow access for platform admin regardless of team", () => {
      // Arrange
      mockRequest.user = {
        ...baseUser,
        roles: ["platform:admin"],
        tenant: "platform",
      };
      mockRequest.body = { team: "backend" };

      // Act
      requireTeamAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should allow access for namespace admin regardless of team", () => {
      // Arrange
      mockRequest.user = {
        ...baseUser,
        roles: ["namespace:admin"],
      };
      mockRequest.body = { team: "backend" };

      // Act
      requireTeamAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should deny access when user does not belong to requested team", () => {
      // Arrange
      mockRequest.user = baseUser;
      mockRequest.body = { team: "backend" };

      // Act
      requireTeamAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error:
          "Access denied. You can only access resources for team: frontend",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("should deny access when no team specified in request", () => {
      // Arrange
      mockRequest.user = baseUser;
      mockRequest.body = {};

      // Act
      requireTeamAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Team specification required",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it("should check team in params if not in body", () => {
      // Arrange
      mockRequest.user = baseUser;
      mockRequest.body = {};
      mockRequest.params = { team: "frontend" };

      // Act
      requireTeamAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should deny access when user is not authenticated", () => {
      // Arrange - no user on request
      mockRequest.body = { team: "frontend" };

      // Act
      requireTeamAccess(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
});
