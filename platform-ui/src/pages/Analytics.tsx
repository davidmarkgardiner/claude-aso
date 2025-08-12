import React from "react";
import {
  ChartBarIcon,
  CubeIcon,
  UsersIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";

// Mock analytics data
const analyticsData = {
  overview: {
    totalNamespaces: 12,
    activeNamespaces: 10,
    totalTeams: 4,
    totalUsers: 28,
    monthlyGrowth: 15.2,
    resourceUtilization: 73.5,
  },
  utilization: {
    avgCpuUsage: 68,
    avgMemoryUsage: 72,
    avgStorageUsage: 45,
  },
  trends: [
    { month: "Jan", namespaces: 8, deployments: 15 },
    { month: "Feb", namespaces: 10, deployments: 22 },
    { month: "Mar", namespaces: 12, deployments: 28 },
  ],
  teamStats: [
    { team: "frontend", namespaces: 5, utilization: 72, cost: 850 },
    { team: "backend", namespaces: 4, utilization: 85, cost: 1200 },
    { team: "data", namespaces: 2, utilization: 45, cost: 600 },
    { team: "ml", namespaces: 1, utilization: 90, cost: 1500 },
  ],
  featureAdoption: [
    { feature: "istio-injection", count: 10, percentage: 83 },
    { feature: "monitoring-enhanced", count: 7, percentage: 58 },
    { feature: "backup-enabled", count: 5, percentage: 42 },
    { feature: "gpu-access", count: 2, percentage: 17 },
  ],
  successMetrics: {
    provisioningSuccessRate: 96,
    deploymentSuccessRate: 92,
    avgProvisioningTime: 8.5,
    platformUptime: 99.9,
  },
};

const Analytics: React.FC = () => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Platform Analytics</h1>
        <p className="mt-2 text-gray-600">
          Comprehensive insights into platform usage, performance, and trends
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CubeIcon className="h-8 w-8 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">
                Total Namespaces
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {analyticsData.overview.totalNamespaces}
              </p>
              <div className="flex items-center mt-1">
                <ArrowTrendingUpIcon className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500 ml-1">
                  +{analyticsData.overview.monthlyGrowth}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UsersIcon className="h-8 w-8 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Teams</p>
              <p className="text-2xl font-bold text-gray-900">
                {analyticsData.overview.totalTeams}
              </p>
              <p className="text-sm text-gray-500">
                {analyticsData.overview.totalUsers} users
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">
                Resource Utilization
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {analyticsData.overview.resourceUtilization}%
              </p>
              <p className="text-sm text-gray-500">Across all namespaces</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ClockIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">
                Avg Provision Time
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {analyticsData.successMetrics.avgProvisioningTime}m
              </p>
              <div className="flex items-center mt-1">
                <ArrowTrendingDownIcon className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500 ml-1">-12%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resource Utilization */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-6">
          Resource Utilization Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                CPU Usage
              </span>
              <span className="text-sm font-bold text-gray-900">
                {analyticsData.utilization.avgCpuUsage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  analyticsData.utilization.avgCpuUsage > 80
                    ? "bg-red-500"
                    : analyticsData.utilization.avgCpuUsage > 60
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${analyticsData.utilization.avgCpuUsage}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                Memory Usage
              </span>
              <span className="text-sm font-bold text-gray-900">
                {analyticsData.utilization.avgMemoryUsage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  analyticsData.utilization.avgMemoryUsage > 80
                    ? "bg-red-500"
                    : analyticsData.utilization.avgMemoryUsage > 60
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
                style={{
                  width: `${analyticsData.utilization.avgMemoryUsage}%`,
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                Storage Usage
              </span>
              <span className="text-sm font-bold text-gray-900">
                {analyticsData.utilization.avgStorageUsage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  analyticsData.utilization.avgStorageUsage > 80
                    ? "bg-red-500"
                    : analyticsData.utilization.avgStorageUsage > 60
                      ? "bg-yellow-500"
                      : "bg-green-500"
                }`}
                style={{
                  width: `${analyticsData.utilization.avgStorageUsage}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Team Statistics */}
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Team Resource Usage
          </h2>
          <div className="space-y-4">
            {analyticsData.teamStats.map((team) => (
              <div
                key={team.team}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-gray-900 capitalize">
                    {team.team}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {team.namespaces} namespaces
                  </p>
                </div>

                <div className="text-right">
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className="text-sm text-gray-500">Utilization</p>
                      <p className="font-medium text-gray-900">
                        {team.utilization}%
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Monthly Cost</p>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(team.cost)}
                      </p>
                    </div>
                  </div>

                  <div className="w-24 bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className={`h-2 rounded-full ${
                        team.utilization > 80
                          ? "bg-red-500"
                          : team.utilization > 60
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${team.utilization}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-900">
                Total Monthly Cost
              </span>
              <span className="text-lg font-bold text-gray-900">
                {formatCurrency(
                  analyticsData.teamStats.reduce(
                    (sum, team) => sum + team.cost,
                    0,
                  ),
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Feature Adoption */}
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Feature Adoption
          </h2>
          <div className="space-y-4">
            {analyticsData.featureAdoption.map((feature) => (
              <div key={feature.feature}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {feature.feature.replace("-", " ")}
                  </span>
                  <div className="text-right">
                    <span className="text-sm text-gray-500">
                      {feature.count} namespaces
                    </span>
                    <span className="text-sm font-medium text-gray-900 ml-2">
                      {feature.percentage}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 bg-primary-500 rounded-full"
                    style={{ width: `${feature.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Success Metrics */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-6">
          Success Metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {analyticsData.successMetrics.provisioningSuccessRate}%
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Provisioning Success Rate
            </p>
          </div>

          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">
              {analyticsData.successMetrics.deploymentSuccessRate}%
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Deployment Success Rate
            </p>
          </div>

          <div className="text-center">
            <p className="text-3xl font-bold text-purple-600">
              {analyticsData.successMetrics.avgProvisioningTime}m
            </p>
            <p className="text-sm text-gray-500 mt-1">Avg Provision Time</p>
          </div>

          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {analyticsData.successMetrics.platformUptime}%
            </p>
            <p className="text-sm text-gray-500 mt-1">Platform Uptime</p>
          </div>
        </div>
      </div>

      {/* Growth Trends */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-6">
          Growth Trends
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              This represents a visual chart in a real implementation
            </span>
            <span className="text-sm text-gray-400">Chart placeholder</span>
          </div>

          {analyticsData.trends.map((trend) => (
            <div
              key={trend.month}
              className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            >
              <span className="text-sm font-medium text-gray-900">
                {trend.month} 2023
              </span>
              <div className="flex space-x-4">
                <span className="text-sm text-gray-600">
                  {trend.namespaces} namespaces
                </span>
                <span className="text-sm text-gray-600">
                  {trend.deployments} deployments
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
