import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  Template,
  NamespaceRequest,
  ProvisioningRequest,
  Namespace,
  Deployment,
  PlatformAnalytics,
  ApiResponse
} from '../types';

class PlatformApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = 'http://localhost:3000') {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth token (if needed)
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Health check
  async getHealth(): Promise<any> {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Service Catalog
  async getTemplates(): Promise<Template[]> {
    const response: AxiosResponse<ApiResponse<Template[]>> = await this.client.get('/api/platform/catalog');
    return response.data.data;
  }

  async getTemplate(id: string): Promise<Template> {
    const response: AxiosResponse<ApiResponse<Template>> = await this.client.get(`/api/platform/catalog/${id}`);
    return response.data.data;
  }

  // Namespace Provisioning
  async requestNamespace(request: NamespaceRequest): Promise<ProvisioningRequest> {
    const response: AxiosResponse<ApiResponse<ProvisioningRequest>> = await this.client.post(
      '/api/platform/namespaces/request',
      request
    );
    return response.data.data;
  }

  async getProvisioningStatus(requestId: string): Promise<ProvisioningRequest> {
    const response: AxiosResponse<ApiResponse<ProvisioningRequest>> = await this.client.get(
      `/api/platform/namespaces/request/${requestId}/status`
    );
    return response.data.data;
  }

  async cancelProvisioning(requestId: string): Promise<void> {
    await this.client.delete(`/api/platform/namespaces/request/${requestId}`);
  }

  // Namespace Management
  async getTeamNamespaces(team: string): Promise<{ team: string; count: number; namespaces: any[] }> {
    const response: AxiosResponse<ApiResponse<{ team: string; count: number; namespaces: any[] }>> = 
      await this.client.get(`/api/platform/namespaces/team/${team}`);
    return response.data.data;
  }

  async getNamespaceDetails(namespaceName: string): Promise<any> {
    const response: AxiosResponse<ApiResponse<any>> = await this.client.get(
      `/api/platform/namespaces/${namespaceName}`
    );
    return response.data.data;
  }

  async getNamespaceCost(namespaceName: string, timeRange: string = '7d'): Promise<any> {
    const response: AxiosResponse<ApiResponse<any>> = await this.client.get(
      `/api/platform/namespaces/${namespaceName}/cost?timeRange=${timeRange}`
    );
    return response.data.data;
  }

  async getAllNamespaces(filters?: { team?: string; environment?: string; limit?: number; offset?: number }): Promise<{
    namespaces: any[];
    pagination: any;
  }> {
    const params = new URLSearchParams();
    if (filters?.team) params.append('team', filters.team);
    if (filters?.environment) params.append('environment', filters.environment);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response: AxiosResponse<ApiResponse<{ namespaces: any[]; pagination: any }>> = 
      await this.client.get(`/api/platform/namespaces?${params.toString()}`);
    return response.data.data;
  }

  // Analytics
  async getAnalytics(): Promise<any> {
    const response: AxiosResponse<ApiResponse<any>> = await this.client.get('/api/platform/analytics');
    return response.data.data;
  }

  async getTeamAnalytics(team: string): Promise<any> {
    const response: AxiosResponse<ApiResponse<any>> = await this.client.get(`/api/platform/analytics/team/${team}`);
    return response.data.data;
  }
}

// Create singleton instance
export const platformApi = new PlatformApiClient();
export default PlatformApiClient;