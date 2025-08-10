import React from 'react';
import { Link } from 'react-router-dom';
import {
  CubeIcon,
  RectangleStackIcon,
  PlusCircleIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// Mock data
const dashboardStats = {
  totalNamespaces: 12,
  activeDeployments: 28,
  successRate: 96,
  avgProvisionTime: '8m'
};

const recentRequests = [
  {
    id: 'req-123',
    namespaceName: 'frontend-mobile-dev',
    team: 'frontend',
    status: 'completed',
    createdAt: '2 hours ago',
    duration: '12m'
  },
  {
    id: 'req-456',
    namespaceName: 'backend-auth-staging',
    team: 'backend',
    status: 'provisioning',
    createdAt: '30 minutes ago',
    progress: 65
  },
  {
    id: 'req-789',
    namespaceName: 'data-pipeline-prod',
    team: 'data',
    status: 'failed',
    createdAt: '1 hour ago',
    error: 'Insufficient storage quota'
  }
];

const teamActivity = [
  { team: 'frontend', namespaces: 5, utilization: 72 },
  { team: 'backend', namespaces: 4, utilization: 85 },
  { team: 'data', namespaces: 2, utilization: 45 },
  { team: 'ml', namespaces: 1, utilization: 90 }
];

const quickActions = [
  {
    title: 'Browse Catalog',
    description: 'Explore available service templates',
    href: '/catalog',
    icon: RectangleStackIcon,
    color: 'bg-blue-500'
  },
  {
    title: 'Provision Namespace',
    description: 'Create a new namespace for your team',
    href: '/provision',
    icon: PlusCircleIcon,
    color: 'bg-green-500'
  },
  {
    title: 'View Namespaces',
    description: 'Manage existing namespaces',
    href: '/namespaces',
    icon: CubeIcon,
    color: 'bg-purple-500'
  },
  {
    title: 'Analytics',
    description: 'View platform metrics and insights',
    href: '/analytics',
    icon: ChartBarIcon,
    color: 'bg-orange-500'
  }
];

const Dashboard: React.FC = () => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-success-500" />;
      case 'provisioning':
        return <ClockIcon className="h-5 w-5 text-warning-500" />;
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-error-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'status-badge-active';
      case 'provisioning':
        return 'status-badge-provisioning';
      case 'failed':
        return 'status-badge-failed';
      default:
        return 'status-badge-provisioning';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Platform Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome to your Namespace-as-a-Service platform. Monitor activity, manage resources, and provision new services.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CubeIcon className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Namespaces</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardStats.totalNamespaces}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <RectangleStackIcon className="h-8 w-8 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Deployments</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardStats.activeDeployments}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ArrowTrendingUpIcon className="h-8 w-8 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardStats.successRate}%</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ClockIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg Provision Time</p>
              <p className="text-2xl font-bold text-gray-900">{dashboardStats.avgProvisionTime}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.href}
              className="card hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center">
                <div className={`p-3 rounded-lg ${action.color}`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-900 group-hover:text-primary-600">
                    {action.title}
                  </h3>
                  <p className="text-xs text-gray-500">{action.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Requests */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Recent Provisioning Requests</h2>
            <Link to="/namespaces" className="text-sm text-primary-600 hover:text-primary-500">
              View all →
            </Link>
          </div>
          
          <div className="space-y-4">
            {recentRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(request.status)}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{request.namespaceName}</p>
                    <p className="text-xs text-gray-500">Team: {request.team} • {request.createdAt}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <span className={getStatusBadge(request.status)}>
                    {request.status}
                  </span>
                  {request.status === 'provisioning' && request.progress && (
                    <p className="text-xs text-gray-500 mt-1">{request.progress}% complete</p>
                  )}
                  {request.status === 'completed' && request.duration && (
                    <p className="text-xs text-gray-500 mt-1">{request.duration}</p>
                  )}
                  {request.status === 'failed' && request.error && (
                    <p className="text-xs text-error-600 mt-1">{request.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {recentRequests.length === 0 && (
            <div className="text-center py-6">
              <CubeIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No recent requests</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by provisioning your first namespace.
              </p>
              <div className="mt-4">
                <Link to="/provision" className="btn-primary">
                  Provision Namespace
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Team Activity */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Team Activity</h2>
            <Link to="/analytics" className="text-sm text-primary-600 hover:text-primary-500">
              View analytics →
            </Link>
          </div>
          
          <div className="space-y-4">
            {teamActivity.map((team) => (
              <div key={team.team} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 capitalize">{team.team}</p>
                  <p className="text-xs text-gray-500">{team.namespaces} namespaces</p>
                </div>
                
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{team.utilization}%</p>
                  <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                    <div
                      className={`h-2 rounded-full ${
                        team.utilization > 80
                          ? 'bg-error-500'
                          : team.utilization > 60
                          ? 'bg-warning-500'
                          : 'bg-success-500'
                      }`}
                      style={{ width: `${team.utilization}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Platform Utilization</span>
              <span className="font-medium text-gray-900">
                {Math.round(teamActivity.reduce((sum, team) => sum + team.utilization, 0) / teamActivity.length)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-success-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">API Services</p>
              <p className="text-xs text-gray-500">All systems operational</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-success-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">Provisioning Engine</p>
              <p className="text-xs text-gray-500">Running smoothly</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-warning-500 rounded-full"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">Resource Pool</p>
              <p className="text-xs text-gray-500">High utilization</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;