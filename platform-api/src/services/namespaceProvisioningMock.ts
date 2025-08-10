import { v4 as uuidv4 } from 'uuid';
import { NamespaceRequest, ProvisioningResult, ProvisioningRequest, NamespaceInfo, ResourceTier } from '../types/namespace';
import { mockNamespaces, mockProvisioningRequests } from '../../tests/fixtures/namespaces';

export class NamespaceProvisioningService {
  private activeRequests: Map<string, ProvisioningRequest> = new Map();

  constructor() {
    // Initialize with mock data
    mockProvisioningRequests.forEach(req => {
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
    return mockNamespaces.find(ns => ns.name === namespaceName) || null;
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
    const exists = mockNamespaces.some(ns => ns.name === request.namespaceName);
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

  private generateWorkflowSpec(request: NamespaceRequest, requestId: string): any {
    const resourceConfig = this.getResourceConfig(request.resourceTier);
    
    return {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: `provision-namespace-${requestId}-${Date.now()}`,
        labels: {
          'platform.company.com/request-id': requestId,
          'platform.company.com/team': request.team
        }
      },
      spec: {
        entrypoint: 'main',
        templates: [
          {
            name: 'main',
            steps: [
              [{ name: 'create-namespace', template: 'create-namespace' }],
              [{ name: 'setup-rbac', template: 'setup-rbac' }],
              [{ name: 'apply-policies', template: 'apply-policies' }],
              [{ name: 'notify', template: 'notify' }]
            ]
          },
          {
            name: 'create-namespace',
            script: {
              image: 'bitnami/kubectl:latest',
              command: ['bash'],
              source: `
                kubectl create namespace ${request.namespaceName} --dry-run=client -o yaml | \\
                kubectl label --local -f - platform.company.com/team=${request.team} ${request.features.includes('istio-injection') ? 'istio-injection=enabled' : ''} -o yaml | \\
                kubectl apply -f -
              `
            }
          },
          {
            name: 'setup-rbac',
            script: {
              image: 'bitnami/kubectl:latest',
              command: ['bash'],
              source: `
                cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ResourceQuota
metadata:
  name: ${request.namespaceName}-quota
  namespace: ${request.namespaceName}
spec:
  hard:
    requests.cpu: "${resourceConfig.cpu}"
    requests.memory: "${resourceConfig.memory}"
    persistentvolumeclaims: "10"
EOF
              `
            }
          },
          {
            name: 'apply-policies',
            script: {
              image: 'bitnami/kubectl:latest',
              command: ['bash'],
              source: `echo "Applying network policies for ${request.networkPolicy}"`
            }
          },
          {
            name: 'notify',
            script: {
              image: 'curlimages/curl:latest',
              command: ['sh'],
              source: `echo "Namespace ${request.namespaceName} provisioned successfully"`
            }
          }
        ]
      }
    };
  }

  private getResourceConfig(tier: ResourceTier): { cpu: string; memory: string } {
    const configs = {
      micro: { cpu: '1', memory: '2Gi' },
      small: { cpu: '2', memory: '4Gi' },
      medium: { cpu: '4', memory: '8Gi' },
      large: { cpu: '8', memory: '16Gi' }
    };
    return configs[tier];
  }
}