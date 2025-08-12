import { CatalogTemplate } from "../../src/types/catalog";

export const mockTemplates: CatalogTemplate[] = [
  {
    id: "microservice-api",
    name: "Microservice API",
    description:
      "A production-ready REST API microservice with database integration, monitoring, and security features",
    category: "microservice",
    version: "2.1.0",
    tags: ["nodejs", "api", "postgresql", "redis", "monitoring"],
    author: "Platform Team",
    createdAt: "2023-01-01T12:00:00Z",
    updatedAt: "2023-06-15T14:30:00Z",
    parameters: [
      {
        name: "serviceName",
        type: "string",
        required: true,
        description: "Name of the microservice",
        validation: {
          pattern: "^[a-z][a-z0-9-]*[a-z0-9]$",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "databaseType",
        type: "select",
        required: true,
        description: "Type of database to use",
        options: ["postgresql", "mysql", "mongodb"],
        defaultValue: "postgresql",
      },
      {
        name: "replicas",
        type: "number",
        required: false,
        description: "Number of replicas to deploy",
        defaultValue: 2,
        validation: { min: 1, max: 10 },
      },
      {
        name: "resourceTier",
        type: "select",
        required: false,
        description: "Resource allocation tier",
        options: ["micro", "small", "medium", "large"],
        defaultValue: "small",
      },
      {
        name: "externalDomain",
        type: "string",
        required: false,
        description: "External domain for API access",
        validation: { pattern: "^[a-zA-Z0-9][a-zA-Z0-9-\\.]*[a-zA-Z0-9]$" },
      },
      {
        name: "enableMetrics",
        type: "boolean",
        required: false,
        description: "Enable Prometheus metrics collection",
        defaultValue: true,
      },
    ],
    manifest: {
      apiVersion: "argoproj.io/v1alpha1",
      kind: "WorkflowTemplate",
      metadata: {
        name: "deploy-microservice-api",
        namespace: "argo-workflows",
      },
      spec: {
        templates: [
          {
            name: "main",
            steps: [
              [{ name: "create-deployment", template: "create-deployment" }],
              [{ name: "create-service", template: "create-service" }],
              [{ name: "create-database", template: "create-database" }],
              [{ name: "create-ingress", template: "create-ingress" }],
              [{ name: "verify-deployment", template: "verify-deployment" }],
            ],
          },
        ],
      },
    },
    examples: [
      {
        name: "Basic Payment API",
        description: "Simple payment processing API with PostgreSQL",
        parameters: {
          serviceName: "payment-api",
          databaseType: "postgresql",
          replicas: 2,
          resourceTier: "small",
          enableMetrics: true,
        },
      },
      {
        name: "High-Performance User API",
        description: "User management API with MongoDB and high availability",
        parameters: {
          serviceName: "user-api",
          databaseType: "mongodb",
          replicas: 5,
          resourceTier: "medium",
          externalDomain: "api.company.com",
          enableMetrics: true,
        },
      },
    ],
  },
  {
    id: "static-website",
    name: "Static Website",
    description:
      "Static website hosting with CDN, SSL, and automated deployments",
    category: "frontend",
    version: "1.3.0",
    tags: ["react", "nextjs", "static", "cdn", "ssl"],
    author: "Frontend Team",
    createdAt: "2023-02-15T09:00:00Z",
    updatedAt: "2023-07-20T16:45:00Z",
    parameters: [
      {
        name: "siteName",
        type: "string",
        required: true,
        description: "Name of the static site",
        validation: {
          pattern: "^[a-z][a-z0-9-]*[a-z0-9]$",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "framework",
        type: "select",
        required: true,
        description: "Frontend framework used",
        options: ["react", "nextjs", "vue", "angular", "vanilla"],
        defaultValue: "react",
      },
      {
        name: "domain",
        type: "string",
        required: true,
        description: "Domain name for the website",
        validation: { pattern: "^[a-zA-Z0-9][a-zA-Z0-9-\\.]*[a-zA-Z0-9]$" },
      },
      {
        name: "enableCDN",
        type: "boolean",
        required: false,
        description: "Enable CDN for global content distribution",
        defaultValue: true,
      },
      {
        name: "sslCertificate",
        type: "select",
        required: false,
        description: "SSL certificate type",
        options: ["letsencrypt", "custom", "none"],
        defaultValue: "letsencrypt",
      },
    ],
    manifest: {
      apiVersion: "argoproj.io/v1alpha1",
      kind: "WorkflowTemplate",
      metadata: {
        name: "deploy-static-website",
        namespace: "argo-workflows",
      },
      spec: {
        templates: [
          {
            name: "main",
            steps: [
              [{ name: "build-assets", template: "build-assets" }],
              [{ name: "deploy-to-storage", template: "deploy-to-storage" }],
              [{ name: "configure-cdn", template: "configure-cdn" }],
              [{ name: "setup-ssl", template: "setup-ssl" }],
              [{ name: "verify-deployment", template: "verify-deployment" }],
            ],
          },
        ],
      },
    },
    examples: [
      {
        name: "Marketing Website",
        description: "Company marketing site with React and CDN",
        parameters: {
          siteName: "marketing-site",
          framework: "react",
          domain: "www.company.com",
          enableCDN: true,
          sslCertificate: "letsencrypt",
        },
      },
      {
        name: "Documentation Portal",
        description: "Internal documentation with Next.js",
        parameters: {
          siteName: "docs-portal",
          framework: "nextjs",
          domain: "docs.company.com",
          enableCDN: false,
          sslCertificate: "custom",
        },
      },
    ],
  },
  {
    id: "worker-service",
    name: "Background Worker",
    description:
      "Scalable background job processing service with queue management",
    category: "worker",
    version: "1.5.0",
    tags: ["python", "celery", "redis", "queue", "worker"],
    author: "Backend Team",
    createdAt: "2023-03-10T11:30:00Z",
    updatedAt: "2023-08-05T13:15:00Z",
    parameters: [
      {
        name: "workerName",
        type: "string",
        required: true,
        description: "Name of the worker service",
        validation: {
          pattern: "^[a-z][a-z0-9-]*[a-z0-9]$",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "language",
        type: "select",
        required: true,
        description: "Programming language for the worker",
        options: ["python", "nodejs", "go", "java"],
        defaultValue: "python",
      },
      {
        name: "queueType",
        type: "select",
        required: true,
        description: "Message queue system to use",
        options: ["redis", "rabbitmq", "sqs", "kafka"],
        defaultValue: "redis",
      },
      {
        name: "concurrency",
        type: "number",
        required: false,
        description: "Number of concurrent workers",
        defaultValue: 4,
        validation: { min: 1, max: 20 },
      },
      {
        name: "autoscaling",
        type: "boolean",
        required: false,
        description: "Enable horizontal pod autoscaling",
        defaultValue: true,
      },
    ],
    manifest: {
      apiVersion: "argoproj.io/v1alpha1",
      kind: "WorkflowTemplate",
      metadata: {
        name: "deploy-worker-service",
        namespace: "argo-workflows",
      },
      spec: {
        templates: [
          {
            name: "main",
            steps: [
              [{ name: "create-deployment", template: "create-deployment" }],
              [{ name: "setup-queue", template: "setup-queue" }],
              [
                {
                  name: "configure-autoscaling",
                  template: "configure-autoscaling",
                },
              ],
              [{ name: "setup-monitoring", template: "setup-monitoring" }],
              [{ name: "verify-deployment", template: "verify-deployment" }],
            ],
          },
        ],
      },
    },
    examples: [
      {
        name: "Email Processing Worker",
        description: "Worker for processing email notifications",
        parameters: {
          workerName: "email-worker",
          language: "python",
          queueType: "redis",
          concurrency: 6,
          autoscaling: true,
        },
      },
      {
        name: "Image Processing Worker",
        description: "High-performance image processing with Go",
        parameters: {
          workerName: "image-processor",
          language: "go",
          queueType: "rabbitmq",
          concurrency: 8,
          autoscaling: true,
        },
      },
    ],
  },
  {
    id: "database-cluster",
    name: "Database Cluster",
    description:
      "High-availability database cluster with backup and monitoring",
    category: "database",
    version: "3.0.0",
    tags: ["postgresql", "mysql", "mongodb", "ha", "backup"],
    author: "Database Team",
    createdAt: "2023-04-20T14:20:00Z",
    updatedAt: "2023-09-10T10:30:00Z",
    parameters: [
      {
        name: "databaseName",
        type: "string",
        required: true,
        description: "Name of the database cluster",
        validation: {
          pattern: "^[a-z][a-z0-9-]*[a-z0-9]$",
          minLength: 3,
          maxLength: 50,
        },
      },
      {
        name: "engine",
        type: "select",
        required: true,
        description: "Database engine to deploy",
        options: ["postgresql", "mysql", "mongodb", "redis"],
        defaultValue: "postgresql",
      },
      {
        name: "version",
        type: "select",
        required: true,
        description: "Database version",
        options: ["14", "15", "16"], // Will be filtered based on engine
        defaultValue: "15",
      },
      {
        name: "replicas",
        type: "number",
        required: false,
        description: "Number of database replicas",
        defaultValue: 3,
        validation: { min: 1, max: 7 },
      },
      {
        name: "storageSize",
        type: "string",
        required: false,
        description: "Storage size per node (e.g., 100Gi)",
        defaultValue: "100Gi",
        validation: { pattern: "^\\d+Gi$" },
      },
      {
        name: "enableBackup",
        type: "boolean",
        required: false,
        description: "Enable automated backups",
        defaultValue: true,
      },
    ],
    manifest: {
      apiVersion: "argoproj.io/v1alpha1",
      kind: "WorkflowTemplate",
      metadata: {
        name: "deploy-database-cluster",
        namespace: "argo-workflows",
      },
      spec: {
        templates: [
          {
            name: "main",
            steps: [
              [{ name: "create-storage", template: "create-storage" }],
              [{ name: "deploy-primary", template: "deploy-primary" }],
              [{ name: "deploy-replicas", template: "deploy-replicas" }],
              [{ name: "setup-backup", template: "setup-backup" }],
              [
                {
                  name: "configure-monitoring",
                  template: "configure-monitoring",
                },
              ],
              [{ name: "verify-cluster", template: "verify-cluster" }],
            ],
          },
        ],
      },
    },
    examples: [
      {
        name: "Production PostgreSQL Cluster",
        description: "High-availability PostgreSQL for production workloads",
        parameters: {
          databaseName: "postgres-prod",
          engine: "postgresql",
          version: "15",
          replicas: 3,
          storageSize: "500Gi",
          enableBackup: true,
        },
      },
      {
        name: "Development MySQL Instance",
        description: "Single-node MySQL for development",
        parameters: {
          databaseName: "mysql-dev",
          engine: "mysql",
          version: "8",
          replicas: 1,
          storageSize: "50Gi",
          enableBackup: false,
        },
      },
    ],
  },
];

export const mockDeployments = [
  {
    deploymentId: "deploy-123",
    templateId: "microservice-api",
    serviceName: "payment-api",
    team: "frontend",
    namespace: "frontend-staging",
    environment: "staging",
    status: "completed" as const,
    progress: 100,
    createdAt: "2023-01-01T12:00:00Z",
    completedAt: "2023-01-01T12:15:00Z",
    parameters: {
      databaseType: "postgresql",
      replicas: 2,
      resourceTier: "small",
      enableMetrics: true,
    },
  },
  {
    deploymentId: "deploy-456",
    templateId: "static-website",
    serviceName: "marketing-site",
    team: "frontend",
    namespace: "frontend-prod",
    environment: "production",
    status: "running" as const,
    progress: 75,
    createdAt: "2023-01-01T13:00:00Z",
    parameters: {
      framework: "react",
      domain: "www.company.com",
      enableCDN: true,
      sslCertificate: "letsencrypt",
    },
  },
  {
    deploymentId: "deploy-789",
    templateId: "worker-service",
    serviceName: "email-worker",
    team: "backend",
    namespace: "backend-prod",
    environment: "production",
    status: "failed" as const,
    progress: 45,
    createdAt: "2023-01-01T14:00:00Z",
    errorMessage: "Failed to connect to Redis queue",
    parameters: {
      language: "python",
      queueType: "redis",
      concurrency: 6,
      autoscaling: true,
    },
  },
];
