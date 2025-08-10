export type ResourceTier = 'micro' | 'small' | 'medium' | 'large';

export type NetworkPolicy = 'isolated' | 'team-shared' | 'open';

export type Environment = 'development' | 'staging' | 'production';

export interface NamespaceRequest {
  namespaceName: string;
  team: string;
  environment: Environment;
  resourceTier: ResourceTier;
  networkPolicy: NetworkPolicy;
  features: string[];
  description: string;
  owner: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ProvisioningResult {
  requestId: string;
  namespaceName: string;
  status: 'pending' | 'provisioning' | 'completed' | 'failed';
  workflowName: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface ProvisioningRequest {
  requestId: string;
  namespaceName: string;
  team: string;
  environment: Environment;
  resourceTier: ResourceTier;
  networkPolicy: NetworkPolicy;
  features: string[];
  description: string;
  status: 'pending' | 'provisioning' | 'completed' | 'failed';
  workflowName: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  owner: {
    id: string;
    email: string;
    name: string;
  };
  workflowStatus?: {
    phase: string;
    message?: string;
    startedAt?: string;
    finishedAt?: string;
  };
}

export interface NamespaceInfo {
  name: string;
  team: string;
  environment: Environment;
  resourceTier: ResourceTier;
  networkPolicy: NetworkPolicy;
  status: 'active' | 'provisioning' | 'error';
  createdAt: string;
  features: string[];
  description: string;
  owner: {
    id: string;
    email: string;
    name: string;
  };
  resources: {
    pods: number;
    services: number;
    deployments: number;
    configMaps?: number;
    secrets?: number;
  };
  quota: {
    cpu: { used: string; limit: string; percentage: number };
    memory: { used: string; limit: string; percentage: number };
    storage: { used: string; limit: string; percentage: number };
  };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}