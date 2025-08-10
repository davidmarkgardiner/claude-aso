import type { Template, NamespaceRequest, ProvisioningRequest } from '../types/simple';

const API_BASE_URL = 'http://localhost:3001/api/platform';

class PlatformApiClient {
  async getTemplates(): Promise<Template[]> {
    const response = await fetch(`${API_BASE_URL}/catalog/templates`);
    if (!response.ok) {
      throw new Error('Failed to fetch templates');
    }
    return response.json();
  }

  async requestNamespace(request: NamespaceRequest): Promise<ProvisioningRequest> {
    const response = await fetch(`${API_BASE_URL}/namespaces/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to request namespace');
    }
    
    return response.json();
  }

  async getProvisioningStatus(requestId: string): Promise<ProvisioningRequest> {
    const response = await fetch(`${API_BASE_URL}/namespaces/request/${requestId}/status`);
    if (!response.ok) {
      throw new Error('Failed to get provisioning status');
    }
    return response.json();
  }

  async getTeamNamespaces(team: string): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/namespaces/team/${team}`);
    if (!response.ok) {
      throw new Error('Failed to get team namespaces');
    }
    return response.json();
  }

  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch('http://localhost:3001/health');
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    return response.json();
  }
}

export const platformApi = new PlatformApiClient();