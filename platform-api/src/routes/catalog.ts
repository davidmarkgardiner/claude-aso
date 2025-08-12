import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireRole } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();

// Service catalog data - in production this would come from a database or config service
const serviceTemplates = [
  {
    id: "basic-web-app",
    name: "Basic Web Application",
    description: "Simple web application with basic monitoring and networking",
    category: "Web Applications",
    resourceTier: "small",
    features: ["istio-injection", "monitoring-enhanced"],
    estimatedCost: "$100/month",
    complexity: "low",
    supportedEnvironments: ["development", "staging", "production"],
    metadata: {
      documentation: "https://docs.platform.com/templates/basic-web-app",
      supportContact: "platform-team@company.com",
      lastUpdated: "2024-01-15T10:00:00Z",
    },
    parameters: [
      {
        name: "appName",
        type: "string",
        required: true,
        description: "Application name (will be used as namespace name)",
        validation: "^[a-z0-9-]+$",
      },
      {
        name: "team",
        type: "string",
        required: true,
        description: "Team owning this application",
      },
      {
        name: "environment",
        type: "select",
        required: true,
        description: "Target environment",
        options: ["development", "staging", "production"],
      },
    ],
  },
  {
    id: "microservice-api",
    name: "Microservice API",
    description:
      "RESTful API microservice with service mesh, monitoring, and database access",
    category: "Microservices",
    resourceTier: "medium",
    features: [
      "istio-injection",
      "monitoring-enhanced",
      "database-access",
      "external-ingress",
    ],
    estimatedCost: "$200/month",
    complexity: "medium",
    supportedEnvironments: ["staging", "production"],
    metadata: {
      documentation: "https://docs.platform.com/templates/microservice-api",
      supportContact: "platform-team@company.com",
      lastUpdated: "2024-01-10T14:30:00Z",
    },
    parameters: [
      {
        name: "serviceName",
        type: "string",
        required: true,
        description: "Service name (will be used as namespace name)",
        validation: "^[a-z0-9-]+$",
      },
      {
        name: "team",
        type: "string",
        required: true,
        description: "Team owning this service",
      },
      {
        name: "environment",
        type: "select",
        required: true,
        description: "Target environment",
        options: ["staging", "production"],
      },
      {
        name: "databaseType",
        type: "select",
        required: true,
        description: "Database type to connect to",
        options: ["postgresql", "mysql", "mongodb", "redis"],
      },
      {
        name: "externalDomain",
        type: "string",
        required: false,
        description: "Custom domain for external access (optional)",
        validation: "^[a-z0-9.-]+$",
      },
    ],
  },
  {
    id: "ml-workspace",
    name: "ML Development Workspace",
    description:
      "Machine learning development environment with GPU access and data tools",
    category: "Machine Learning",
    resourceTier: "large",
    features: ["gpu-access", "monitoring-enhanced", "backup-enabled"],
    estimatedCost: "$800/month",
    complexity: "high",
    supportedEnvironments: ["development", "staging"],
    metadata: {
      documentation: "https://docs.platform.com/templates/ml-workspace",
      supportContact: "ml-platform@company.com",
      lastUpdated: "2024-01-20T09:15:00Z",
    },
    parameters: [
      {
        name: "workspaceName",
        type: "string",
        required: true,
        description: "ML workspace name (will be used as namespace name)",
        validation: "^[a-z0-9-]+$",
      },
      {
        name: "team",
        type: "string",
        required: true,
        description: "Data science team name",
      },
      {
        name: "environment",
        type: "select",
        required: true,
        description: "Target environment",
        options: ["development", "staging"],
      },
      {
        name: "gpuCount",
        type: "number",
        required: true,
        description: "Number of GPUs required",
        min: 1,
        max: 4,
      },
      {
        name: "frameworkPreference",
        type: "multiselect",
        required: false,
        description: "ML frameworks to pre-install",
        options: [
          "tensorflow",
          "pytorch",
          "scikit-learn",
          "xgboost",
          "huggingface",
        ],
      },
    ],
  },
  {
    id: "data-pipeline",
    name: "Data Processing Pipeline",
    description: "Batch data processing pipeline with storage and monitoring",
    category: "Data Engineering",
    resourceTier: "medium",
    features: ["monitoring-enhanced", "backup-enabled", "database-access"],
    estimatedCost: "$250/month",
    complexity: "medium",
    supportedEnvironments: ["staging", "production"],
    metadata: {
      documentation: "https://docs.platform.com/templates/data-pipeline",
      supportContact: "data-platform@company.com",
      lastUpdated: "2024-01-12T16:45:00Z",
    },
    parameters: [
      {
        name: "pipelineName",
        type: "string",
        required: true,
        description: "Data pipeline name (will be used as namespace name)",
        validation: "^[a-z0-9-]+$",
      },
      {
        name: "team",
        type: "string",
        required: true,
        description: "Data engineering team name",
      },
      {
        name: "environment",
        type: "select",
        required: true,
        description: "Target environment",
        options: ["staging", "production"],
      },
      {
        name: "scheduleCron",
        type: "string",
        required: true,
        description: "Cron expression for pipeline schedule",
        validation: "^[0-9*,-/ ]+$",
      },
      {
        name: "dataSource",
        type: "select",
        required: true,
        description: "Primary data source",
        options: ["s3", "azure-blob", "postgresql", "kafka", "api"],
      },
    ],
  },
];

const categories = [
  "Web Applications",
  "Microservices",
  "Machine Learning",
  "Data Engineering",
  "Development Tools",
  "Security & Compliance",
];

// GET /api/platform/catalog/templates - List all service templates
router.get(
  "/templates",
  requireRole(["namespace:admin", "namespace:developer"]),
  asyncHandler(async (req, res) => {
    const { category, complexity, environment } = req.query;

    let filteredTemplates = [...serviceTemplates];

    // Apply filters
    if (category) {
      filteredTemplates = filteredTemplates.filter(
        (t) => t.category.toLowerCase() === (category as string).toLowerCase(),
      );
    }

    if (complexity) {
      filteredTemplates = filteredTemplates.filter(
        (t) => t.complexity === complexity,
      );
    }

    if (environment) {
      filteredTemplates = filteredTemplates.filter((t) =>
        t.supportedEnvironments.includes(environment as string),
      );
    }

    // Remove parameters from list view for performance
    const templateList = filteredTemplates.map((template) => ({
      ...template,
      parameters: undefined,
    }));

    res.json({
      success: true,
      data: {
        templates: templateList,
        totalCount: filteredTemplates.length,
        categories: categories,
        filters: {
          category: category || null,
          complexity: complexity || null,
          environment: environment || null,
        },
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

// GET /api/platform/catalog/templates/:templateId - Get specific template details
router.get(
  "/templates/:templateId",
  requireRole(["namespace:admin", "namespace:developer"]),
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;

    const template = serviceTemplates.find((t) => t.id === templateId);

    if (!template) {
      return res.status(404).json({
        error: "NotFoundError",
        message: `Template ${templateId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      data: template,
      timestamp: new Date().toISOString(),
    });
  }),
);

// GET /api/platform/catalog/categories - List template categories
router.get(
  "/categories",
  requireRole(["namespace:admin", "namespace:developer"]),
  asyncHandler(async (_req, res) => {
    const categoryCounts = categories.map((category) => ({
      name: category,
      count: serviceTemplates.filter((t) => t.category === category).length,
      templates: serviceTemplates
        .filter((t) => t.category === category)
        .map((t) => ({ id: t.id, name: t.name, complexity: t.complexity })),
    }));

    return res.json({
      success: true,
      data: {
        categories: categoryCounts,
        totalTemplates: serviceTemplates.length,
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

// POST /api/platform/catalog/templates/:templateId/deploy - Deploy from template
router.post(
  "/templates/:templateId/deploy",
  requireRole(["namespace:admin", "namespace:developer"]),
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const templateParameters = req.body;

    const template = serviceTemplates.find((t) => t.id === templateId);

    if (!template) {
      return res.status(404).json({
        error: "NotFoundError",
        message: `Template ${templateId} not found`,
        timestamp: new Date().toISOString(),
      });
    }

    // Validate required parameters
    const missingParams = template.parameters
      .filter((param) => param.required && !templateParameters[param.name])
      .map((param) => param.name);

    if (missingParams.length > 0) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Missing required parameters",
        details: { missingParameters: missingParams },
        timestamp: new Date().toISOString(),
      });
    }

    // Validate parameter formats
    const validationErrors = [];
    for (const param of template.parameters) {
      const value = templateParameters[param.name];
      if (value !== undefined) {
        if (param.validation && typeof value === "string") {
          const regex = new RegExp(param.validation);
          if (!regex.test(value)) {
            validationErrors.push({
              parameter: param.name,
              message: `Invalid format for ${param.name}`,
            });
          }
        }

        if (param.type === "number") {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            validationErrors.push({
              parameter: param.name,
              message: `${param.name} must be a number`,
            });
          } else {
            if (param.min !== undefined && numValue < param.min) {
              validationErrors.push({
                parameter: param.name,
                message: `${param.name} must be at least ${param.min}`,
              });
            }
            if (param.max !== undefined && numValue > param.max) {
              validationErrors.push({
                parameter: param.name,
                message: `${param.name} must be at most ${param.max}`,
              });
            }
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "ValidationError",
        message: "Parameter validation failed",
        details: { validationErrors },
        timestamp: new Date().toISOString(),
      });
    }

    // Create namespace request from template
    const namespaceRequest = {
      namespaceName:
        templateParameters.appName ||
        templateParameters.serviceName ||
        templateParameters.workspaceName ||
        templateParameters.pipelineName,
      team: templateParameters.team,
      environment: templateParameters.environment,
      resourceTier: template.resourceTier as
        | "micro"
        | "small"
        | "medium"
        | "large",
      networkPolicy: (template.complexity === "high"
        ? "isolated"
        : "team-shared") as "isolated" | "team-shared" | "open",
      features: template.features,
      description: `Deployed from template: ${template.name}`,
      costCenter: templateParameters.team,
    };

    // Use the provisioning service to create the namespace
    const { getProvisioningService } = await import(
      "../services/namespaceProvisioning"
    );
    const provisioningService = getProvisioningService();

    try {
      const result = await provisioningService.provisionNamespace({
        ...namespaceRequest,
        requestedBy: req.user!.email,
      });

      logger.info("Template deployment initiated", {
        templateId,
        requestId: result.requestId,
        namespaceName: namespaceRequest.namespaceName,
        team: namespaceRequest.team,
        requestedBy: req.user!.email,
      });

      return res.status(202).json({
        success: true,
        data: {
          ...result,
          template: {
            id: template.id,
            name: template.name,
          },
          parameters: templateParameters,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Template deployment failed", {
        templateId,
        error: error instanceof Error ? error.message : "Unknown error",
        namespaceName: namespaceRequest.namespaceName,
        requestedBy: req.user!.email,
      });
      throw error;
    }
  }),
);

// GET /api/platform/catalog/favorites - Get user's favorite templates (mock for now)
router.get(
  "/favorites",
  requireRole(["namespace:admin", "namespace:developer"]),
  asyncHandler(async (_req, res) => {
    // In production, this would come from user preferences database
    const favoriteTemplateIds = ["basic-web-app", "microservice-api"];

    const favoriteTemplates = serviceTemplates
      .filter((t) => favoriteTemplateIds.includes(t.id))
      .map((template) => ({
        ...template,
        parameters: undefined, // Remove parameters from list view
      }));

    res.json({
      success: true,
      data: {
        favorites: favoriteTemplates,
        count: favoriteTemplates.length,
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

// GET /api/platform/catalog/recent - Get recently used templates (mock for now)
router.get(
  "/recent",
  requireRole(["namespace:admin", "namespace:developer"]),
  asyncHandler(async (_req, res) => {
    // In production, this would come from user activity database
    const recentTemplateIds = [
      "microservice-api",
      "data-pipeline",
      "basic-web-app",
    ];

    const recentTemplates = serviceTemplates
      .filter((t) => recentTemplateIds.includes(t.id))
      .map((template) => ({
        ...template,
        parameters: undefined,
        lastUsed: new Date(
          Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }));

    res.json({
      success: true,
      data: {
        recent: recentTemplates,
        count: recentTemplates.length,
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

export { router as catalogRouter };
