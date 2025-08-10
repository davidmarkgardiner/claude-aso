export interface CatalogTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  parameters: TemplateParameter[];
  manifest: any; // Argo Workflow template
  examples: TemplateExample[];
}

export interface TemplateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required: boolean;
  description: string;
  defaultValue?: any;
  options?: string[]; // For select type
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
}

export interface TemplateExample {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface DeploymentRequest {
  serviceName: string;
  team: string;
  namespace: string;
  environment: string;
  parameters: Record<string, any>;
}

export interface DeploymentResult {
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