import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import type { NamespaceRequest, ProvisioningRequest } from '../types/simple';
import { platformApi } from '../services/api';

const ProvisionNamespace: React.FC = () => {
  const [formData, setFormData] = useState<NamespaceRequest>({
    namespaceName: '',
    team: '',
    environment: 'development',
    resourceTier: 'small',
    networkPolicy: 'team-shared',
    features: [],
    description: '',
    costCenter: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [provisioningResult, setProvisioningResult] = useState<ProvisioningRequest | null>(null);

  // Available features
  const availableFeatures = [
    { id: 'istio-injection', name: 'Istio Service Mesh', description: 'Enable service mesh with traffic management and security' },
    { id: 'monitoring-enhanced', name: 'Enhanced Monitoring', description: 'Advanced metrics, alerting, and dashboards' },
    { id: 'backup-enabled', name: 'Automated Backups', description: 'Regular backup of stateful workloads' },
    { id: 'gpu-access', name: 'GPU Access', description: 'Access to GPU resources for ML workloads' },
    { id: 'database-access', name: 'Database Access', description: 'Access to managed database services' },
    { id: 'external-ingress', name: 'External Ingress', description: 'Public internet access with load balancing' }
  ];

  // Real provisioning mutation using the API
  const provisionMutation = useMutation({
    mutationFn: async (request: NamespaceRequest): Promise<ProvisioningRequest> => {
      return await platformApi.requestNamespace(request);
    },
    onSuccess: (result) => {
      setProvisioningResult(result);
      setCurrentStep(3);
    },
    onError: (error: any) => {
      console.error('Provisioning failed:', error);
    }
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.namespaceName) {
      newErrors.namespaceName = 'Namespace name is required';
    } else if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(formData.namespaceName)) {
      newErrors.namespaceName = 'Namespace name must be lowercase alphanumeric with hyphens';
    } else if (formData.namespaceName.length < 1 || formData.namespaceName.length > 63) {
      newErrors.namespaceName = 'Namespace name must be 1-63 characters';
    }

    if (!formData.team) {
      newErrors.team = 'Team is required';
    } else if (!/^[a-z0-9-]+$/.test(formData.team)) {
      newErrors.team = 'Team name must be lowercase alphanumeric with hyphens';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setCurrentStep(2);
      provisionMutation.mutate(formData);
    }
  };

  const resetForm = () => {
    setFormData({
      namespaceName: '',
      team: '',
      environment: 'development',
      resourceTier: 'small',
      networkPolicy: 'team-shared',
      features: [],
      description: '',
      costCenter: ''
    });
    setErrors({});
    setCurrentStep(1);
    setProvisioningResult(null);
  };

  const toggleFeature = (featureId: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.includes(featureId)
        ? prev.features.filter(f => f !== featureId)
        : [...prev.features, featureId]
    }));
  };

  // Step indicators
  const steps = [
    { id: 1, name: 'Configuration', status: currentStep === 1 ? 'current' : currentStep > 1 ? 'complete' : 'upcoming' },
    { id: 2, name: 'Provisioning', status: currentStep === 2 ? 'current' : currentStep > 2 ? 'complete' : 'upcoming' },
    { id: 3, name: 'Complete', status: currentStep === 3 ? 'current' : 'upcoming' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Provision Namespace</h1>
        <p className="mt-2 text-gray-600">
          Create a new namespace for your team with the resources and features you need
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, stepIdx) => (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  step.status === 'complete'
                    ? 'bg-primary-600 border-primary-600'
                    : step.status === 'current'
                    ? 'border-primary-600 bg-white'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {step.status === 'complete' ? (
                  <CheckCircleIcon className="w-6 h-6 text-white" />
                ) : (
                  <span
                    className={`text-sm font-medium ${
                      step.status === 'current' ? 'text-primary-600' : 'text-gray-500'
                    }`}
                  >
                    {step.id}
                  </span>
                )}
              </div>
              <span
                className={`ml-3 text-sm font-medium ${
                  step.status === 'current' ? 'text-primary-600' : 'text-gray-500'
                }`}
              >
                {step.name}
              </span>
            </div>
            {stepIdx < steps.length - 1 && (
              <div className="ml-6 w-16 border-t-2 border-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Configuration Form */}
      {currentStep === 1 && (
        <form onSubmit={handleSubmit} className="card space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Namespace Name */}
            <div>
              <label className="form-label">
                Namespace Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.namespaceName}
                onChange={(e) => setFormData(prev => ({ ...prev, namespaceName: e.target.value }))}
                className={`form-input ${errors.namespaceName ? 'border-red-500' : ''}`}
                placeholder="my-app-dev"
              />
              {errors.namespaceName && (
                <p className="mt-1 text-sm text-red-600">{errors.namespaceName}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Lowercase alphanumeric with hyphens, 1-63 characters
              </p>
            </div>

            {/* Team */}
            <div>
              <label className="form-label">
                Team <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.team}
                onChange={(e) => setFormData(prev => ({ ...prev, team: e.target.value }))}
                className={`form-input ${errors.team ? 'border-red-500' : ''}`}
                placeholder="frontend"
              />
              {errors.team && (
                <p className="mt-1 text-sm text-red-600">{errors.team}</p>
              )}
            </div>

            {/* Environment */}
            <div>
              <label className="form-label">Environment</label>
              <select
                value={formData.environment}
                onChange={(e) => setFormData(prev => ({ ...prev, environment: e.target.value as any }))}
                className="form-input"
              >
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>

            {/* Resource Tier */}
            <div>
              <label className="form-label">Resource Tier</label>
              <select
                value={formData.resourceTier}
                onChange={(e) => setFormData(prev => ({ ...prev, resourceTier: e.target.value as any }))}
                className="form-input"
              >
                <option value="micro">Micro (1 CPU, 2GB RAM)</option>
                <option value="small">Small (2 CPU, 4GB RAM)</option>
                <option value="medium">Medium (4 CPU, 8GB RAM)</option>
                <option value="large">Large (8 CPU, 16GB RAM)</option>
              </select>
            </div>

            {/* Network Policy */}
            <div>
              <label className="form-label">Network Policy</label>
              <select
                value={formData.networkPolicy}
                onChange={(e) => setFormData(prev => ({ ...prev, networkPolicy: e.target.value as any }))}
                className="form-input"
              >
                <option value="isolated">Isolated - No external traffic</option>
                <option value="team-shared">Team Shared - Team members only</option>
                <option value="open">Open - Cross-team communication</option>
              </select>
            </div>

            {/* Cost Center */}
            <div>
              <label className="form-label">Cost Center</label>
              <input
                type="text"
                value={formData.costCenter}
                onChange={(e) => setFormData(prev => ({ ...prev, costCenter: e.target.value }))}
                className="form-input"
                placeholder="CC-12345"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className={`form-input ${errors.description ? 'border-red-500' : ''}`}
              rows={3}
              placeholder="Brief description of this namespace's purpose..."
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Features */}
          <div>
            <label className="form-label">Optional Features</label>
            <div className="mt-2 space-y-3">
              {availableFeatures.map((feature) => (
                <div key={feature.id} className="flex items-start">
                  <input
                    type="checkbox"
                    id={feature.id}
                    checked={formData.features.includes(feature.id)}
                    onChange={() => toggleFeature(feature.id)}
                    className="mt-0.5 h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="ml-3">
                    <label htmlFor={feature.id} className="text-sm font-medium text-gray-900 cursor-pointer">
                      {feature.name}
                    </label>
                    <p className="text-sm text-gray-500">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary"
            >
              Provision Namespace
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Provisioning */}
      {currentStep === 2 && (
        <div className="card text-center">
          <div className="animate-spin mx-auto h-12 w-12 text-primary-600">
            <ClockIcon />
          </div>
          <h2 className="mt-4 text-lg font-medium text-gray-900">Provisioning Namespace</h2>
          <p className="mt-2 text-gray-600">
            Creating your namespace and configuring resources. This may take a few minutes...
          </p>
          
          {provisionMutation.isError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <XCircleIcon className="h-5 w-5 text-red-400" />
                <h3 className="ml-2 text-sm font-medium text-red-800">
                  Provisioning Failed
                </h3>
              </div>
              <p className="mt-2 text-sm text-red-700">
                {(provisionMutation.error as any)?.message || 'An error occurred during provisioning'}
              </p>
              <button
                onClick={() => setCurrentStep(1)}
                className="mt-3 btn-secondary"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Complete */}
      {currentStep === 3 && provisioningResult && (
        <div className="card">
          <div className="text-center">
            <CheckCircleIcon className="mx-auto h-12 w-12 text-success-600" />
            <h2 className="mt-4 text-lg font-medium text-gray-900">Namespace Provisioning Started</h2>
            <p className="mt-2 text-gray-600">
              Your namespace provisioning request has been submitted successfully
            </p>
          </div>

          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Provisioning Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Request ID:</span>
                <span className="text-gray-900 font-medium">{provisioningResult.requestId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Namespace:</span>
                <span className="text-gray-900 font-medium">{provisioningResult.namespaceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Team:</span>
                <span className="text-gray-900 font-medium">{provisioningResult.team}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Environment:</span>
                <span className="text-gray-900 font-medium">{provisioningResult.environment}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span className="status-badge-provisioning">{provisioningResult.status}</span>
              </div>
            </div>
          </div>

          {provisioningResult.workflowStatus && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center">
                <InformationCircleIcon className="h-5 w-5 text-blue-400" />
                <h4 className="ml-2 text-sm font-medium text-blue-800">Current Status</h4>
              </div>
              <p className="mt-1 text-sm text-blue-700">
                {provisioningResult.workflowStatus.phase}: {provisioningResult.workflowStatus.message}
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-center space-x-3">
            <button
              onClick={() => window.location.href = '/namespaces'}
              className="btn-primary"
            >
              View All Namespaces
            </button>
            <button
              onClick={resetForm}
              className="btn-secondary"
            >
              Provision Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProvisionNamespace;