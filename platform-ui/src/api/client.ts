import axios from "axios";
import type { AxiosInstance, AxiosResponse } from "axios";
import type {
  Template,
  NamespaceRequest,
  ProvisioningRequest,
  ApiResponse,
} from "../types";
import { getConfig, getEnvironmentInfo } from "../config/environment";

class PlatformApiClient {
  private client: AxiosInstance;
  private config = getConfig();
  private envInfo = getEnvironmentInfo();

  constructor(baseURL?: string) {
    // Use provided baseURL, or get from config, with secure fallback
    const apiUrl = baseURL || this.config.apiUrl;

    // Validate API URL in production
    if (this.envInfo.isProduction && apiUrl.includes("localhost")) {
      throw new Error("Production environment cannot use localhost API URL");
    }

    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-Platform-Version": "1.0.0",
      },
    });

    // Add request interceptor for auth token and security headers
    this.client.interceptors.request.use((config) => {
      // Add auth token if authentication is enabled
      if (this.config.authEnabled) {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      // Add API key if configured (for service-to-service auth)
      const apiKey = this.getApiKey();
      if (apiKey) {
        config.headers["X-API-Key"] = apiKey;
      }

      // Add environment and correlation headers
      config.headers["X-Environment"] = this.config.environment;
      config.headers["X-Correlation-ID"] = this.generateCorrelationId();

      return config;
    });

    // Add response interceptor for error handling and security
    this.client.interceptors.response.use(
      (response) => {
        // Log successful requests in debug mode
        if (this.envInfo.debugMode) {
          console.debug("API Response:", {
            url: response.config.url,
            status: response.status,
            headers: response.headers,
          });
        }
        return response;
      },
      (error) => {
        // Enhanced error handling with security considerations
        const errorDetails = {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          method: error.config?.method,
        };

        // Log error details (but not sensitive data)
        if (this.envInfo.debugMode) {
          console.error("API Error Details:", errorDetails);
        } else {
          console.error(
            "API Error:",
            error.response?.status || "Network Error",
          );
        }

        // Handle authentication errors
        if (error.response?.status === 401) {
          this.handleAuthError();
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Get authentication token from secure storage
   */
  private getAuthToken(): string | null {
    try {
      // In production, prefer sessionStorage over localStorage for security
      const storage = this.envInfo.isProduction ? sessionStorage : localStorage;
      return storage.getItem("auth_token");
    } catch (error) {
      console.warn("Failed to get auth token:", error);
      return null;
    }
  }

  /**
   * Get API key for service authentication
   */
  private getApiKey(): string | null {
    // API key should only be used in specific scenarios and never logged
    return null; // Will be set via environment if needed
  }

  /**
   * Generate correlation ID for request tracing
   */
  private generateCorrelationId(): string {
    return `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(): void {
    if (this.config.authEnabled) {
      // Clear stored tokens
      localStorage.removeItem("auth_token");
      sessionStorage.removeItem("auth_token");

      // Redirect to login if we're not already there
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
  }

  // Health check
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get("/health");
    return response.data;
  }

  // Service Catalog
  async getTemplates(): Promise<Template[]> {
    const response: AxiosResponse<ApiResponse<Template[]>> =
      await this.client.get("/api/platform/catalog");
    return response.data.data;
  }

  async getTemplate(id: string): Promise<Template> {
    const response: AxiosResponse<ApiResponse<Template>> =
      await this.client.get(`/api/platform/catalog/${id}`);
    return response.data.data;
  }

  // Namespace Provisioning
  async requestNamespace(
    request: NamespaceRequest,
  ): Promise<ProvisioningRequest> {
    const response: AxiosResponse<ApiResponse<ProvisioningRequest>> =
      await this.client.post("/api/platform/namespaces/request", request);
    return response.data.data;
  }

  async getProvisioningStatus(requestId: string): Promise<ProvisioningRequest> {
    const response: AxiosResponse<ApiResponse<ProvisioningRequest>> =
      await this.client.get(
        `/api/platform/namespaces/request/${requestId}/status`,
      );
    return response.data.data;
  }

  async cancelProvisioning(requestId: string): Promise<void> {
    await this.client.delete(`/api/platform/namespaces/request/${requestId}`);
  }

  // Namespace Management
  async getTeamNamespaces(team: string): Promise<{
    team: string;
    count: number;
    namespaces: Array<Record<string, unknown>>;
  }> {
    const response: AxiosResponse<
      ApiResponse<{
        team: string;
        count: number;
        namespaces: Array<Record<string, unknown>>;
      }>
    > = await this.client.get(`/api/platform/namespaces/team/${team}`);
    return response.data.data;
  }

  async getNamespaceDetails(
    namespaceName: string,
  ): Promise<Record<string, unknown>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> =
      await this.client.get(`/api/platform/namespaces/${namespaceName}`);
    return response.data.data;
  }

  async getNamespaceCost(
    namespaceName: string,
    timeRange: string = "7d",
  ): Promise<Record<string, unknown>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> =
      await this.client.get(
        `/api/platform/namespaces/${namespaceName}/cost?timeRange=${timeRange}`,
      );
    return response.data.data;
  }

  async getAllNamespaces(filters?: {
    team?: string;
    environment?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    namespaces: Array<Record<string, unknown>>;
    pagination: Record<string, unknown>;
  }> {
    const params = new URLSearchParams();
    if (filters?.team) params.append("team", filters.team);
    if (filters?.environment) params.append("environment", filters.environment);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());

    const response: AxiosResponse<
      ApiResponse<{
        namespaces: Array<Record<string, unknown>>;
        pagination: Record<string, unknown>;
      }>
    > = await this.client.get(`/api/platform/namespaces?${params.toString()}`);
    return response.data.data;
  }

  // Analytics
  async getAnalytics(): Promise<Record<string, unknown>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> =
      await this.client.get("/api/platform/analytics");
    return response.data.data;
  }

  async getTeamAnalytics(team: string): Promise<Record<string, unknown>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> =
      await this.client.get(`/api/platform/analytics/team/${team}`);
    return response.data.data;
  }
}

// Create singleton instance with configuration
let platformApiInstance: PlatformApiClient | null = null;

/**
 * Get the platform API client instance
 * This ensures the client is created with the latest configuration
 */
export function getPlatformApi(): PlatformApiClient {
  if (!platformApiInstance) {
    platformApiInstance = new PlatformApiClient();
  }
  return platformApiInstance;
}

/**
 * Reset the API client instance (useful for configuration updates)
 */
export function resetPlatformApi(): void {
  platformApiInstance = null;
}

// Export the singleton instance for backward compatibility
export const platformApi = getPlatformApi();
export default PlatformApiClient;
