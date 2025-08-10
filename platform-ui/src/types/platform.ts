export interface Template {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  author?: string;
  parameters: Parameter[];
  examples: TemplateExample[];
}

export interface Parameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required: boolean;
  description: string;
  defaultValue?: any;
  options?: string[];
}

export interface TemplateExample {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

export interface NamespaceRequest {
  namespaceName: string;
  team: string;
  environment: 'development' | 'staging' | 'production';
  resourceTier: 'micro' | 'small' | 'medium' | 'large';
  networkPolicy: 'isolated' | 'team-shared' | 'open';
  features: string[];
  description?: string;
  costCenter?: string;
}

export interface ProvisioningRequest {
  requestId: string;
  namespaceName: string;
  team: string;
  environment: string;
  resourceTier: string;
  networkPolicy: string;
  status: 'pending' | 'provisioning' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  features: string[];
  workflowStatus?: {
    phase: string;
    message: string;
  };
}

export interface Namespace {
  name: string;
  team: string;
  environment: string;
  resourceTier: string;
  networkPolicy: string;
  status: string;
  createdAt: string;
  features: string[];
  description?: string;
  owner: {
    name: string;
    email: string;
  };
  resources?: {
    pods: number;
    services: number;
    deployments: number;
    configMaps?: number;
    secrets?: number;
  };
  quota?: {
    cpu: ResourceQuota;
    memory: ResourceQuota;
    storage: ResourceQuota;
  };
}

export interface ResourceQuota {
  used: string;
  limit: string;
  percentage: number;
}

export interface Deployment {
  deploymentId: string;
  templateId: string;
  serviceName: string;
  team: string;
  namespace: string;
  environment: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  parameters: Record<string, any>;
}

export interface User {
  name: string;
  email: string;
  tenant: string;
  roles: string[];
  groups: string[];
}

export interface PlatformAnalytics {
  totalNamespaces: number;
  activeNamespaces: number;
  totalTeams: number;
  totalUsers: number;
  activeDeployments: number;
  resourceUtilization: {
    avgCpuUsage: number;
    avgMemoryUsage: number;
  };
  featureAdoption: Record<string, number>;
  tierDistribution: Record<string, number>;
  successMetrics: {
    provisioningSuccessRate: number;
    deploymentSuccessRate: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
  error?: string;
  message?: string;
}