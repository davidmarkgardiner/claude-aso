import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { DefaultAzureCredential } from "@azure/identity";
import {
  getAzureADValidationService,
  validateAzureADPrincipal,
} from "../../../src/middleware/azureAdValidation";
import {
  AzureADPrincipal,
  RBACValidationResult,
} from "../../../src/types/rbac";

// Mock dependencies
jest.mock("@azure/identity");
jest.mock("axios");
jest.mock("../../../src/utils/logger");

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockCredential = {
  getToken: jest.fn(),
} as jest.Mocked<DefaultAzureCredential>;

(DefaultAzureCredential as jest.Mock).mockImplementation(() => mockCredential);

describe("AzureADValidationService", () => {
  let validationService: ReturnType<typeof getAzureADValidationService>;
  const mockAccessToken = "mock-access-token";

  beforeEach(() => {
    jest.clearAllMocks();
    mockCredential.getToken.mockResolvedValue({
      token: mockAccessToken,
    } as any);
    validationService = getAzureADValidationService();
  });

  describe("validateUserPrincipal", () => {
    const userPrincipalName = "testuser@example.com";
    const mockUserData = {
      id: "user-object-id",
      displayName: "Test User",
      userPrincipalName: "testuser@example.com",
    };

    it("should successfully validate a user principal", async () => {
      mockAxios.get.mockResolvedValue({ data: mockUserData });

      const result =
        await validationService.validateUserPrincipal(userPrincipalName);

      expect(result.valid).toBe(true);
      expect(result.principal).toEqual({
        objectId: "user-object-id",
        userPrincipalName: "testuser@example.com",
        displayName: "Test User",
        principalType: "User",
        verified: true,
      });
      expect(result.errors).toHaveLength(0);

      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(
          `/users/${encodeURIComponent(userPrincipalName)}`,
        ),
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${mockAccessToken}`,
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("should handle user not found error", async () => {
      mockAxios.get.mockRejectedValue({
        response: { status: 404 },
        message: "Not found",
      });

      const result =
        await validationService.validateUserPrincipal(userPrincipalName);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `User '${userPrincipalName}' not found in Azure AD`,
      );
      expect(result.principal).toBeUndefined();
    });

    it("should handle other API errors", async () => {
      mockAxios.get.mockRejectedValue({
        message: "Network error",
      });

      const result =
        await validationService.validateUserPrincipal(userPrincipalName);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Failed to validate user");
      expect(result.errors[0]).toContain("Network error");
    });
  });

  describe("validateGroupPrincipal", () => {
    const groupObjectId = "group-object-id";
    const mockGroupData = {
      id: "group-object-id",
      displayName: "Test Group",
    };

    it("should successfully validate a group principal", async () => {
      mockAxios.get.mockResolvedValue({ data: mockGroupData });

      const result =
        await validationService.validateGroupPrincipal(groupObjectId);

      expect(result.valid).toBe(true);
      expect(result.principal).toEqual({
        objectId: "group-object-id",
        displayName: "Test Group",
        principalType: "Group",
        verified: true,
      });
      expect(result.errors).toHaveLength(0);
    });

    it("should handle group not found error", async () => {
      mockAxios.get.mockRejectedValue({
        response: { status: 404 },
        message: "Not found",
      });

      const result =
        await validationService.validateGroupPrincipal(groupObjectId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `Group with ID '${groupObjectId}' not found in Azure AD`,
      );
    });
  });

  describe("validatePrincipalById", () => {
    const objectId = "test-object-id";

    it("should validate as user when user lookup succeeds", async () => {
      const mockUserData = {
        id: objectId,
        displayName: "Test User",
        userPrincipalName: "testuser@example.com",
      };

      mockAxios.get.mockResolvedValueOnce({ data: mockUserData });

      const result = await validationService.validatePrincipalById(objectId);

      expect(result.valid).toBe(true);
      expect(result.principal?.principalType).toBe("User");
      expect(result.principal?.objectId).toBe(objectId);
    });

    it("should validate as group when user lookup fails but group succeeds", async () => {
      const mockGroupData = {
        id: objectId,
        displayName: "Test Group",
      };

      mockAxios.get
        .mockRejectedValueOnce({ response: { status: 404 } }) // User lookup fails
        .mockResolvedValueOnce({ data: mockGroupData }); // Group lookup succeeds

      const result = await validationService.validatePrincipalById(objectId);

      expect(result.valid).toBe(true);
      expect(result.principal?.principalType).toBe("Group");
      expect(result.principal?.objectId).toBe(objectId);
    });

    it("should fail when both user and group lookups fail", async () => {
      mockAxios.get
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockRejectedValueOnce({ response: { status: 404 } });

      const result = await validationService.validatePrincipalById(objectId);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Failed to validate principal");
    });
  });

  describe("getGraphAccessToken", () => {
    it("should handle credential failures", async () => {
      mockCredential.getToken.mockRejectedValue(new Error("Auth failed"));

      await expect(
        validationService.validateUserPrincipal("test@example.com"),
      ).rejects.toThrow("Failed to authenticate with Microsoft Graph API");
    });
  });
});

describe("validateAzureADPrincipal middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });

    req = {
      body: {},
    };
    res = {
      status: statusSpy,
      json: jsonSpy,
    };
    next = jest.fn();

    jest.clearAllMocks();
  });

  it("should validate principal and call next on success", async () => {
    const principalId = "test-principal-id";
    const mockPrincipal: AzureADPrincipal = {
      objectId: principalId,
      userPrincipalName: "test@example.com",
      displayName: "Test User",
      principalType: "User",
      verified: true,
    };

    req.body!.principalId = principalId;

    const mockValidationService = {
      validatePrincipalById: jest.fn().mockResolvedValue({
        valid: true,
        principal: mockPrincipal,
        errors: [],
      }),
    };

    // Mock the service
    jest.doMock("../../../src/middleware/azureAdValidation", () => ({
      getAzureADValidationService: () => mockValidationService,
    }));

    const middleware = validateAzureADPrincipal("principalId");
    await middleware(req as Request, res as Response, next);

    expect(mockValidationService.validatePrincipalById).toHaveBeenCalledWith(
      principalId,
    );
    expect(req.body!.validatedPrincipal).toEqual(mockPrincipal);
    expect(next).toHaveBeenCalled();
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("should return 400 when principal ID is missing", async () => {
    const middleware = validateAzureADPrincipal("principalId");
    await middleware(req as Request, res as Response, next);

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "ValidationError",
        message: "principalId is required",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 400 when validation fails", async () => {
    const principalId = "invalid-principal-id";
    req.body!.principalId = principalId;

    const mockValidationService = {
      validatePrincipalById: jest.fn().mockResolvedValue({
        valid: false,
        errors: ["Principal not found"],
        undefined,
      }),
    };

    // Mock the service
    jest.doMock("../../../src/middleware/azureAdValidation", () => ({
      getAzureADValidationService: () => mockValidationService,
    }));

    const middleware = validateAzureADPrincipal("principalId");
    await middleware(req as Request, res as Response, next);

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "ValidationError",
        message: "Invalid Azure AD principal",
        details: ["Principal not found"],
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 500 when validation throws an error", async () => {
    const principalId = "test-principal-id";
    req.body!.principalId = principalId;

    const mockValidationService = {
      validatePrincipalById: jest
        .fn()
        .mockRejectedValue(new Error("Service error")),
    };

    // Mock the service
    jest.doMock("../../../src/middleware/azureAdValidation", () => ({
      getAzureADValidationService: () => mockValidationService,
    }));

    const middleware = validateAzureADPrincipal("principalId");
    await middleware(req as Request, res as Response, next);

    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "InternalError",
        message: "Failed to validate Azure AD principal",
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
