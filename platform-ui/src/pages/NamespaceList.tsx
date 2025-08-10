import React, { useState } from 'react';
import {
  CubeIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  Cog6ToothIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

// Mock namespace data
const mockNamespaces = [
  {
    name: 'frontend-app-dev',
    team: 'frontend',
    environment: 'development',
    resourceTier: 'small',
    status: 'active',
    createdAt: '2023-01-01T12:00:00Z',
    owner: { name: 'Dev User', email: 'dev@company.com' },
    resources: { pods: 12, services: 4, deployments: 6 },
    quota: {
      cpu: { used: '1200m', limit: '2000m', percentage: 60 },
      memory: { used: '2.5Gi', limit: '4Gi', percentage: 62.5 }
    }
  },
  {
    name: 'frontend-app-staging',
    team: 'frontend',
    environment: 'staging',
    resourceTier: 'medium',
    status: 'active',
    createdAt: '2023-01-05T14:30:00Z',
    owner: { name: 'Staging Manager', email: 'staging@company.com' },
    resources: { pods: 18, services: 6, deployments: 8 },
    quota: {
      cpu: { used: '2800m', limit: '4000m', percentage: 70 },
      memory: { used: '6Gi', limit: '8Gi', percentage: 75 }
    }
  },
  {
    name: 'backend-api-prod',
    team: 'backend',
    environment: 'production',
    resourceTier: 'large',
    status: 'active',
    createdAt: '2023-01-10T09:15:00Z',
    owner: { name: 'Backend Lead', email: 'backend-lead@company.com' },
    resources: { pods: 45, services: 15, deployments: 20 },
    quota: {
      cpu: { used: '6500m', limit: '8000m', percentage: 81.25 },
      memory: { used: '12Gi', limit: '16Gi', percentage: 75 }
    }
  },
  {
    name: 'ml-training-staging',
    team: 'ml',
    environment: 'staging',
    resourceTier: 'large',
    status: 'provisioning',
    createdAt: '2023-01-20T11:20:00Z',
    owner: { name: 'ML Engineer', email: 'ml-engineer@company.com' },
    resources: { pods: 0, services: 0, deployments: 0 },
    quota: {
      cpu: { used: '0m', limit: '8000m', percentage: 0 },
      memory: { used: '0Gi', limit: '16Gi', percentage: 0 }
    }
  }
];

const NamespaceList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState<any>(null);

  const teams = [...new Set(mockNamespaces.map(ns => ns.team))];
  const environments = [...new Set(mockNamespaces.map(ns => ns.environment))];
  const statuses = [...new Set(mockNamespaces.map(ns => ns.status))];

  const filteredNamespaces = mockNamespaces.filter(ns => {
    const matchesSearch = ns.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ns.team.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTeam = !teamFilter || ns.team === teamFilter;
    const matchesEnvironment = !environmentFilter || ns.environment === environmentFilter;
    const matchesStatus = !statusFilter || ns.status === statusFilter;
    
    return matchesSearch && matchesTeam && matchesEnvironment && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'status-badge-active';
      case 'provisioning':
        return 'status-badge-provisioning';
      case 'error':
        return 'status-badge-failed';
      default:
        return 'status-badge-provisioning';
    }
  };

  const getResourceTierColor = (tier: string) => {
    switch (tier) {
      case 'micro':
        return 'text-gray-600 bg-gray-50';
      case 'small':
        return 'text-blue-600 bg-blue-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'large':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getUtilizationColor = (percentage: number) => {
    if (percentage > 80) return 'text-red-600';
    if (percentage > 60) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Namespaces</h1>
        <p className="mt-2 text-gray-600">
          Monitor and manage all namespaces across your platform
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search namespaces..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        
        <div className="flex gap-2">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
          
          <select
            value={environmentFilter}
            onChange={(e) => setEnvironmentFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Environments</option>
            {environments.map(env => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Status</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {filteredNamespaces.length} of {mockNamespaces.length} namespaces
      </div>

      {/* Namespace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredNamespaces.map((namespace) => (
          <div key={namespace.name} className="card hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <CubeIcon className="h-8 w-8 text-primary-600" />
                <div className="ml-3">
                  <h3 className="font-semibold text-gray-900">{namespace.name}</h3>
                  <p className="text-sm text-gray-500">{namespace.team} team</p>
                </div>
              </div>
              <span className={getStatusBadge(namespace.status)}>
                {namespace.status}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Environment</span>
                <span className="text-sm font-medium text-gray-900 capitalize">
                  {namespace.environment}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Resource Tier</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getResourceTierColor(namespace.resourceTier)}`}>
                  {namespace.resourceTier}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Created</span>
                <span className="text-sm text-gray-900">
                  {new Date(namespace.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Resource Usage */}
            {namespace.status === 'active' && (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">CPU Usage</span>
                  <span className={`text-xs font-medium ${getUtilizationColor(namespace.quota.cpu.percentage)}`}>
                    {namespace.quota.cpu.percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      namespace.quota.cpu.percentage > 80
                        ? 'bg-red-500'
                        : namespace.quota.cpu.percentage > 60
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${namespace.quota.cpu.percentage}%` }}
                  />
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Memory Usage</span>
                  <span className={`text-xs font-medium ${getUtilizationColor(namespace.quota.memory.percentage)}`}>
                    {namespace.quota.memory.percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      namespace.quota.memory.percentage > 80
                        ? 'bg-red-500'
                        : namespace.quota.memory.percentage > 60
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${namespace.quota.memory.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Resource Counts */}
            {namespace.status === 'active' && (
              <div className="flex justify-between text-xs text-gray-500 mb-4">
                <span>{namespace.resources.pods} pods</span>
                <span>{namespace.resources.services} services</span>
                <span>{namespace.resources.deployments} deployments</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between">
              <button
                onClick={() => setSelectedNamespace(namespace)}
                className="flex items-center text-sm text-primary-600 hover:text-primary-500"
              >
                <EyeIcon className="h-4 w-4 mr-1" />
                View Details
              </button>
              
              <div className="flex space-x-2">
                <button className="flex items-center text-sm text-gray-500 hover:text-gray-700">
                  <ChartBarIcon className="h-4 w-4 mr-1" />
                  Metrics
                </button>
                <button className="flex items-center text-sm text-gray-500 hover:text-gray-700">
                  <Cog6ToothIcon className="h-4 w-4 mr-1" />
                  Configure
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredNamespaces.length === 0 && (
        <div className="text-center py-12">
          <CubeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No namespaces found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your search criteria or create a new namespace.
          </p>
        </div>
      )}

      {/* Namespace Detail Modal */}
      {selectedNamespace && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedNamespace.name}</h2>
                  <p className="text-sm text-gray-500">
                    {selectedNamespace.team} team • {selectedNamespace.environment}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedNamespace(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Basic Information</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status:</span>
                      <span className={getStatusBadge(selectedNamespace.status)}>
                        {selectedNamespace.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Resource Tier:</span>
                      <span>{selectedNamespace.resourceTier}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Owner:</span>
                      <span>{selectedNamespace.owner.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created:</span>
                      <span>{new Date(selectedNamespace.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Resource Usage</h3>
                  {selectedNamespace.status === 'active' ? (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>CPU</span>
                          <span>{selectedNamespace.quota.cpu.used}/{selectedNamespace.quota.cpu.limit}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 bg-primary-500 rounded-full"
                            style={{ width: `${selectedNamespace.quota.cpu.percentage}%` }}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Memory</span>
                          <span>{selectedNamespace.quota.memory.used}/{selectedNamespace.quota.memory.limit}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 bg-primary-500 rounded-full"
                            style={{ width: `${selectedNamespace.quota.memory.percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Resource information not available</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedNamespace(null)}
                  className="btn-secondary"
                >
                  Close
                </button>
                <button className="btn-primary">
                  View in Kubernetes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NamespaceList;