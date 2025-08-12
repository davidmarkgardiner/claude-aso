import type {
  Template,
  NamespaceRequest,
  ProvisioningRequest,
} from "../types/simple";
import { getConfig, getEnvironmentInfo } from "../config/environment";

// Get API URL from configuration instead of hardcoding
const getApiBaseUrl = (): string => {
  const config = getConfig();
  const envInfo = getEnvironmentInfo();

  // Validate API URL in production
  if (envInfo.isProduction && config.apiUrl.includes("localhost")) {
    throw new Error("Production environment cannot use localhost API URL");
  }

  return `${config.apiUrl}/api/platform`;
};

class PlatformApiClient {
  private config = getConfig();
  private envInfo = getEnvironmentInfo();

  /**
   * Get request headers with authentication and security
   */
  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Platform-Version": "1.0.0",
      "X-Environment": this.config.environment,
      "X-Correlation-ID": this.generateCorrelationId(),
    };

    // Add auth token if authentication is enabled
    if (this.config.authEnabled) {
      const token = this.getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /**
   * Get authentication token from secure storage
   */
  private getAuthToken(): string | null {
    try {
      const storage = this.envInfo.isProduction ? sessionStorage : localStorage;
      return storage.getItem("auth_token");
    } catch (error) {
      console.warn("Failed to get auth token:", error);
      return null;
    }
  }

  /**
   * Generate correlation ID for request tracing
   */
  private generateCorrelationId(): string {
    return `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle API errors with proper logging and auth handling
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        this.handleAuthError();
      }

      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // If we can't parse the error response, use the default message
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(): void {
    if (this.config.authEnabled) {
      localStorage.removeItem("auth_token");
      sessionStorage.removeItem("auth_token");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
  }

  async getTemplates(): Promise<Template[]> {
    const response = await fetch(`${getApiBaseUrl()}/catalog/templates`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Template[]>(response);
  }

  async requestNamespace(
    request: NamespaceRequest,
  ): Promise<ProvisioningRequest> {
    const response = await fetch(`${getApiBaseUrl()}/namespaces/request`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    return this.handleResponse<ProvisioningRequest>(response);
  }

  async getProvisioningStatus(requestId: string): Promise<ProvisioningRequest> {
    const response = await fetch(
      `${getApiBaseUrl()}/namespaces/request/${requestId}/status`,
      {
        headers: this.getHeaders(),
      },
    );
    return this.handleResponse<ProvisioningRequest>(response);
  }

  async getTeamNamespaces(
    team: string,
  ): Promise<Array<Record<string, unknown>>> {
    const response = await fetch(`${getApiBaseUrl()}/namespaces/team/${team}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Array<Record<string, unknown>>>(response);
  }

  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    const config = getConfig();
    const response = await fetch(`${config.apiUrl}/health`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<{ status: string; timestamp: string }>(response);
  }
}

export const platformApi = new PlatformApiClient();
