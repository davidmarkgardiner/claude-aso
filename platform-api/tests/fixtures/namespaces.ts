import { NamespaceInfo, ProvisioningRequest } from '../../src/types/namespace';

export const mockNamespaces: NamespaceInfo[] = [
  {
    name: 'frontend-app-dev',
    team: 'frontend',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'team-shared',
    status: 'active',
    createdAt: '2023-01-01T12:00:00Z',
    features: ['istio-injection', 'monitoring-basic'],
    description: 'Development environment for frontend applications',
    owner: {
      id: 'user-123',
      email: 'dev@company.com',
      name: 'Developer User'
    },
    resources: {
      pods: 12,
      services: 4,
      deployments: 6,
      configMaps: 8,
      secrets: 3
    },
    quota: {
      cpu: { used: '1200m', limit: '2000m', percentage: 60 },
      memory: { used: '2.5Gi', limit: '4Gi', percentage: 62.5 },
      storage: { used: '15Gi', limit: '20Gi', percentage: 75 }
    },
    labels: {
      'platform.company.com/team': 'frontend',
      'platform.company.com/environment': 'development',
      'platform.company.com/tier': 'small',
      'istio-injection': 'enabled'
    },
    annotations: {
      'platform.company.com/created-by': 'platform-api',
      'platform.company.com/created-at': '2023-01-01T12:00:00Z',
      'platform.company.com/description': 'Development environment for frontend applications'
    }
  },
  {
    name: 'frontend-app-staging',
    team: 'frontend',
    environment: 'staging',
    resourceTier: 'medium',
    networkPolicy: 'isolated',
    status: 'active',
    createdAt: '2023-01-05T14:30:00Z',
    features: ['istio-injection', 'monitoring-enhanced', 'logging-enhanced'],
    description: 'Staging environment for frontend applications',
    owner: {
      id: 'user-456',
      email: 'staging@company.com',
      name: 'Staging Manager'
    },
    resources: {
      pods: 18,
      services: 6,
      deployments: 8,
      configMaps: 12,
      secrets: 5
    },
    quota: {
      cpu: { used: '2800m', limit: '4000m', percentage: 70 },
      memory: { used: '6Gi', limit: '8Gi', percentage: 75 },
      storage: { used: '35Gi', limit: '50Gi', percentage: 70 }
    },
    labels: {
      'platform.company.com/team': 'frontend',
      'platform.company.com/environment': 'staging',
      'platform.company.com/tier': 'medium',
      'istio-injection': 'enabled'
    },
    annotations: {
      'platform.company.com/created-by': 'platform-api',
      'platform.company.com/created-at': '2023-01-05T14:30:00Z',
      'platform.company.com/description': 'Staging environment for frontend applications'
    }
  },
  {
    name: 'backend-api-prod',
    team: 'backend',
    environment: 'production',
    resourceTier: 'large',
    networkPolicy: 'isolated',
    status: 'active',
    createdAt: '2023-01-10T09:15:00Z',
    features: ['istio-injection', 'monitoring-enhanced', 'logging-enhanced', 'security-scanning'],
    description: 'Production environment for backend API services',
    owner: {
      id: 'user-789',
      email: 'backend-lead@company.com',
      name: 'Backend Lead'
    },
    resources: {
      pods: 45,
      services: 15,
      deployments: 20,
      configMaps: 25,
      secrets: 12
    },
    quota: {
      cpu: { used: '6500m', limit: '8000m', percentage: 81.25 },
      memory: { used: '12Gi', limit: '16Gi', percentage: 75 },
      storage: { used: '85Gi', limit: '100Gi', percentage: 85 }
    },
    labels: {
      'platform.company.com/team': 'backend',
      'platform.company.com/environment': 'production',
      'platform.company.com/tier': 'large',
      'istio-injection': 'enabled',
      'security.company.com/scanning': 'enabled'
    },
    annotations: {
      'platform.company.com/created-by': 'platform-api',
      'platform.company.com/created-at': '2023-01-10T09:15:00Z',
      'platform.company.com/description': 'Production environment for backend API services',
      'security.company.com/compliance': 'soc2-type2'
    }
  },
  {
    name: 'data-processing-dev',
    team: 'data',
    environment: 'development',
    resourceTier: 'medium',
    networkPolicy: 'team-shared',
    status: 'active',
    createdAt: '2023-01-15T16:45:00Z',
    features: ['monitoring-basic', 'logging-basic'],
    description: 'Development environment for data processing workloads',
    owner: {
      id: 'user-101',
      email: 'data-engineer@company.com',
      name: 'Data Engineer'
    },
    resources: {
      pods: 8,
      services: 3,
      deployments: 4,
      configMaps: 6,
      secrets: 2
    },
    quota: {
      cpu: { used: '1500m', limit: '4000m', percentage: 37.5 },
      memory: { used: '4Gi', limit: '8Gi', percentage: 50 },
      storage: { used: '20Gi', limit: '50Gi', percentage: 40 }
    },
    labels: {
      'platform.company.com/team': 'data',
      'platform.company.com/environment': 'development',
      'platform.company.com/tier': 'medium'
    },
    annotations: {
      'platform.company.com/created-by': 'platform-api',
      'platform.company.com/created-at': '2023-01-15T16:45:00Z',
      'platform.company.com/description': 'Development environment for data processing workloads'
    }
  },
  {
    name: 'ml-training-staging',
    team: 'ml',
    environment: 'staging',
    resourceTier: 'large',
    networkPolicy: 'isolated',
    status: 'provisioning',
    createdAt: '2023-01-20T11:20:00Z',
    features: ['monitoring-enhanced', 'gpu-support'],
    description: 'Staging environment for ML model training',
    owner: {
      id: 'user-202',
      email: 'ml-engineer@company.com',
      name: 'ML Engineer'
    },
    resources: {
      pods: 0,
      services: 0,
      deployments: 0,
      configMaps: 0,
      secrets: 0
    },
    quota: {
      cpu: { used: '0m', limit: '8000m', percentage: 0 },
      memory: { used: '0Gi', limit: '16Gi', percentage: 0 },
      storage: { used: '0Gi', limit: '100Gi', percentage: 0 }
    },
    labels: {
      'platform.company.com/team': 'ml',
      'platform.company.com/environment': 'staging',
      'platform.company.com/tier': 'large',
      'accelerator.company.com/gpu': 'enabled'
    },
    annotations: {
      'platform.company.com/created-by': 'platform-api',
      'platform.company.com/created-at': '2023-01-20T11:20:00Z',
      'platform.company.com/description': 'Staging environment for ML model training'
    }
  }
];

export const mockProvisioningRequests: ProvisioningRequest[] = [
  {
    requestId: 'req-123',
    namespaceName: 'frontend-mobile-dev',
    team: 'frontend',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'team-shared',
    features: ['istio-injection', 'monitoring-basic'],
    description: 'Development environment for mobile applications',
    status: 'completed',
    workflowName: 'provision-namespace-req-123-20230101120000',
    createdAt: '2023-01-01T12:00:00Z',
    completedAt: '2023-01-01T12:15:00Z',
    owner: {
      id: 'user-123',
      email: 'mobile-dev@company.com',
      name: 'Mobile Developer'
    },
    workflowStatus: {
      phase: 'Succeeded',
      message: 'Namespace provisioned successfully',
      finishedAt: '2023-01-01T12:15:00Z'
    }
  },
  {
    requestId: 'req-456',
    namespaceName: 'backend-auth-staging',
    team: 'backend',
    environment: 'staging',
    resourceTier: 'medium',
    networkPolicy: 'isolated',
    features: ['istio-injection', 'monitoring-enhanced', 'security-scanning'],
    description: 'Staging environment for authentication services',
    status: 'provisioning',
    workflowName: 'provision-namespace-req-456-20230105143000',
    createdAt: '2023-01-05T14:30:00Z',
    owner: {
      id: 'user-456',
      email: 'auth-dev@company.com',
      name: 'Auth Developer'
    },
    workflowStatus: {
      phase: 'Running',
      message: 'Setting up RBAC policies',
      startedAt: '2023-01-05T14:30:00Z'
    }
  },
  {
    requestId: 'req-789',
    namespaceName: 'data-pipeline-prod',
    team: 'data',
    environment: 'production',
    resourceTier: 'large',
    networkPolicy: 'isolated',
    features: ['monitoring-enhanced', 'logging-enhanced', 'backup-enabled'],
    description: 'Production environment for data processing pipeline',
    status: 'failed',
    workflowName: 'provision-namespace-req-789-20230110091500',
    createdAt: '2023-01-10T09:15:00Z',
    errorMessage: 'Failed to allocate sufficient storage resources',
    owner: {
      id: 'user-789',
      email: 'data-lead@company.com',
      name: 'Data Lead'
    },
    workflowStatus: {
      phase: 'Failed',
      message: 'Storage allocation failed: insufficient cluster capacity',
      startedAt: '2023-01-10T09:15:00Z',
      finishedAt: '2023-01-10T09:45:00Z'
    }
  },
  {
    requestId: 'req-101',
    namespaceName: 'frontend-analytics-dev',
    team: 'frontend',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'team-shared',
    features: ['monitoring-basic'],
    description: 'Development environment for analytics dashboard',
    status: 'pending',
    workflowName: 'provision-namespace-req-101-20230115164500',
    createdAt: '2023-01-15T16:45:00Z',
    owner: {
      id: 'user-101',
      email: 'analytics-dev@company.com',
      name: 'Analytics Developer'
    }
  },
  {
    requestId: 'req-202',
    namespaceName: 'ml-inference-staging',
    team: 'ml',
    environment: 'staging',
    resourceTier: 'medium',
    networkPolicy: 'isolated',
    features: ['istio-injection', 'monitoring-enhanced', 'gpu-support'],
    description: 'Staging environment for ML model inference',
    status: 'provisioning',
    workflowName: 'provision-namespace-req-202-20230120112000',
    createdAt: '2023-01-20T11:20:00Z',
    owner: {
      id: 'user-202',
      email: 'ml-ops@company.com',
      name: 'ML Ops Engineer'
    },
    workflowStatus: {
      phase: 'Running',
      message: 'Installing GPU operators',
      startedAt: '2023-01-20T11:20:00Z'
    }
  }
];

export const mockUsers = {
  developer: {
    id: 'user-123',
    email: 'developer@company.com',
    name: 'Developer User',
    groups: ['frontend-team-developers'],
    roles: ['namespace:developer', 'team:frontend:developer'],
    tenant: 'frontend'
  },
  admin: {
    id: 'admin-123',
    email: 'admin@company.com',
    name: 'Platform Admin',
    groups: ['platform-admins'],
    roles: ['platform:admin', 'namespace:admin'],
    tenant: 'platform'
  },
  backendDeveloper: {
    id: 'user-456',
    email: 'backend@company.com',
    name: 'Backend Developer',
    groups: ['backend-team-developers'],
    roles: ['namespace:developer', 'team:backend:developer'],
    tenant: 'backend'
  },
  teamLead: {
    id: 'lead-789',
    email: 'team-lead@company.com',
    name: 'Team Lead',
    groups: ['frontend-team-leads'],
    roles: ['namespace:admin', 'team:frontend:lead'],
    tenant: 'frontend'
  }
};