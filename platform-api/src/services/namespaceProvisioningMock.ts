import { v4 as uuidv4 } from 'uuid';
import { NamespaceRequest, ProvisioningResult, ProvisioningRequest, NamespaceInfo, ResourceTier } from '../types/namespace';
// Mock data for testing
const mockNamespaces: NamespaceInfo[] = [
  {
    name: 'test-namespace',
    team: 'test-team',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'team-shared',
    status: 'active',
    createdAt: new Date().toISOString(),
    features: [],
    description: 'Test namespace',
    owner: {
      id: 'test-owner-id',
      email: 'test-owner@company.com',
      name: 'Test Owner'
    },
    resources: {
      pods: 0,
      services: 0,
      deployments: 0,
      configMaps: 0,
      secrets: 0
    },
    quota: {
      cpu: { used: '0', limit: '2', percentage: 0 },
      memory: { used: '0Gi', limit: '4Gi', percentage: 0 },
      storage: { used: '0Gi', limit: '20Gi', percentage: 0 }
    }
  }
];

const mockProvisioningRequests: ProvisioningRequest[] = [
  {
    requestId: 'test-req-1',
    namespaceName: 'test-namespace',
    team: 'test-team',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'team-shared',
    features: [],
    description: 'Test request',
    status: 'completed',
    workflowName: 'test-workflow',
    createdAt: new Date().toISOString(),
    owner: {
      id: 'test-owner-id',
      email: 'test-owner@company.com',
      name: 'Test Owner'
    }
  }
];

export class NamespaceProvisioningService {
  private activeRequests: Map<string, ProvisioningRequest> = new Map();

  constructor() {
    // Initialize with mock data
    mockProvisioningRequests.forEach((req: any) => {
      this.activeRequests.set(req.requestId, req);
    });
  }

  async provisionNamespace(request: NamespaceRequest): Promise<ProvisioningResult> {
    // Validate request
    await this.validateRequest(request);
    
    const requestId = `req-${Date.now()}-${uuidv4().substr(0, 8)}`;
    const workflowName = `provision-namespace-${requestId}-${Date.now()}`;
    
    // Create provisioning record
    const provisioningRequest: ProvisioningRequest = {
      requestId,
      namespaceName: request.namespaceName,
      team: request.team,
      environment: request.environment,
      resourceTier: request.resourceTier,
      networkPolicy: request.networkPolicy,
      features: request.features,
      description: request.description,
      status: 'pending',
      workflowName,
      createdAt: new Date().toISOString(),
      owner: request.owner
    };

    this.activeRequests.set(requestId, provisioningRequest);

    // Simulate workflow submission
    setTimeout(() => {
      const req = this.activeRequests.get(requestId);
      if (req) {
        req.status = 'provisioning';
        req.workflowStatus = {
          phase: 'Running',
          message: 'Creating namespace resources',
          startedAt: new Date().toISOString()
        };
      }
    }, 1000);

    return {
      requestId,
      namespaceName: request.namespaceName,
      status: 'pending',
      workflowName,
      createdAt: new Date().toISOString()
    };
  }

  async getProvisioningStatus(requestId: string): Promise<ProvisioningRequest | null> {
    return this.activeRequests.get(requestId) || null;
  }

  async listTeamNamespaces(team: string): Promise<NamespaceInfo[]> {
    return mockNamespaces.filter(ns => ns.team === team);
  }

  async getNamespaceDetails(namespaceName: string): Promise<NamespaceInfo | null> {
    return mockNamespaces.find((ns: NamespaceInfo) => ns.name === namespaceName) || null;
  }

  private async validateRequest(request: NamespaceRequest): Promise<void> {
    // Validate namespace name format
    const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!namePattern.test(request.namespaceName)) {
      throw new Error('Invalid namespace name format');
    }

    if (request.namespaceName.length > 63) {
      throw new Error('Namespace name too long');
    }

    if (request.namespaceName.length < 1) {
      throw new Error('Namespace name is required');
    }

    // Check if namespace already exists
    const exists = mockNamespaces.some((ns: NamespaceInfo) => ns.name === request.namespaceName);
    if (exists) {
      throw new Error(`Namespace ${request.namespaceName} already exists`);
    }

    // Validate resource tier
    const validTiers: ResourceTier[] = ['micro', 'small', 'medium', 'large'];
    if (!validTiers.includes(request.resourceTier)) {
      throw new Error(`Invalid resource tier: ${request.resourceTier}`);
    }

    // Validate network policy
    const validPolicies = ['isolated', 'team-shared', 'open'];
    if (!validPolicies.includes(request.networkPolicy)) {
      throw new Error(`Invalid network policy: ${request.networkPolicy}`);
    }
  }


}