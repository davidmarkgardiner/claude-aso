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