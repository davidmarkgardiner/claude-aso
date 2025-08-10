import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  TagIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import type { Template } from '../types/simple';
import { platformApi } from '../services/api';

const ServiceCatalog: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // Fetch templates from real API
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['templates'],
    queryFn: () => platformApi.getTemplates(),
  });

  const categories = [...new Set((templates || []).map(t => t.category))];
  
  const filteredTemplates = (templates || []).filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = !selectedCategory || template.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'microservice': return CodeBracketIcon;
      case 'frontend': return SparklesIcon;
      case 'worker': return DocumentTextIcon;
      case 'database': return TagIcon;
      default: return DocumentTextIcon;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'microservice': return 'text-blue-600 bg-blue-50';
      case 'frontend': return 'text-purple-600 bg-purple-50';
      case 'worker': return 'text-green-600 bg-green-50';
      case 'database': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading templates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 text-center p-6">
        Error loading templates. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Service Catalog</h1>
        <p className="mt-2 text-gray-600">
          Discover and deploy production-ready services from our curated template collection
        </p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category} value={category}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {filteredTemplates.length} of {(templates || []).length} templates
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => {
          const CategoryIcon = getCategoryIcon(template.category);
          const categoryStyle = getCategoryColor(template.category);
          
          return (
            <div
              key={template.id}
              className="card hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedTemplate(template)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className={`p-2 rounded-md ${categoryStyle}`}>
                    <CategoryIcon className="h-5 w-5" />
                  </div>
                  <div className="ml-3">
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-500">v{template.version}</p>
                  </div>
                </div>
              </div>
              
              <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                {template.description}
              </p>
              
              <div className="flex flex-wrap gap-1 mb-4">
                {template.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                  >
                    {tag}
                  </span>
                ))}
                {template.tags.length > 3 && (
                  <span className="text-xs text-gray-500">
                    +{template.tags.length - 3} more
                  </span>
                )}
              </div>
              
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{template.parameters.length} parameters</span>
                <span>{template.examples.length} examples</span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No templates found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your search criteria or browse all templates.
          </p>
        </div>
      )}

      {/* Template Detail Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedTemplate.name}</h2>
                  <p className="text-sm text-gray-500">Version {selectedTemplate.version}</p>
                </div>
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  ✕
                </button>
              </div>
              
              <p className="text-gray-600 mb-6">{selectedTemplate.description}</p>
              
              {/* Tags */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {selectedTemplate.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Parameters */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Configuration Parameters</h3>
                <div className="space-y-3">
                  {selectedTemplate.parameters.map((param) => (
                    <div key={param.name} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{param.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            param.required ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {param.required ? 'Required' : 'Optional'}
                          </span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                            {param.type}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{param.description}</p>
                      {param.defaultValue && (
                        <p className="text-xs text-gray-500">Default: {param.defaultValue}</p>
                      )}
                      {param.options && (
                        <p className="text-xs text-gray-500">Options: {param.options.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Examples */}
              {selectedTemplate.examples.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Examples</h3>
                  <div className="space-y-2">
                    {selectedTemplate.examples.map((example, index) => (
                      <div key={index} className="border rounded-md p-3">
                        <div className="font-medium text-sm">{example.name}</div>
                        <p className="text-xs text-gray-600 mt-1">{example.description}</p>
                        {example.parameters && (
                          <pre className="text-xs bg-gray-50 rounded p-2 mt-2 overflow-x-auto">
                            {JSON.stringify(example.parameters, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedTemplate(null)}
                  className="btn-secondary"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    // Navigate to provision page with this template
                    window.location.href = `/provision?template=${selectedTemplate.id}`;
                  }}
                  className="btn-primary"
                >
                  Use Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceCatalog;