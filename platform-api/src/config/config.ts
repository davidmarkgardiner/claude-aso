import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const configSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.number().default(3000),
  corsOrigins: z
    .string()
    .transform((str) => str.split(",").map((s) => s.trim())),

  // JWT Configuration
  jwt: z.object({
    secret: z.string(),
    expiresIn: z.string().default("24h"),
    issuer: z.string().default("platform-api"),
    audience: z.string().default("platform-users"),
  }),

  // Azure AD Configuration
  azureAd: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    tenantId: z.string(),
    scope: z.string().default("https://graph.microsoft.com/.default"),
  }),

  // Kubernetes Configuration
  kubernetes: z.object({
    context: z.string().optional(),
    namespace: z.string().default("default"),
    configPath: z.string().optional(),
  }),

  // Redis Configuration
  redis: z.object({
    url: z.string(),
    password: z.string().optional(),
    db: z.number().default(0),
    keyPrefix: z.string().default("platform:"),
  }),

  // PostgreSQL Configuration
  database: z.object({
    host: z.string(),
    port: z.number().default(5432),
    database: z.string(),
    username: z.string(),
    password: z.string(),
    ssl: z.boolean().default(true),
    maxConnections: z.number().default(10),
  }),

  // Argo Workflows Configuration
  argo: z.object({
    baseUrl: z.string(),
    namespace: z.string().default("argo"),
    token: z.string().optional(),
    timeout: z.number().default(30000),
  }),

  // Platform Configuration
  platform: z.object({
    defaultResourceTier: z.string().default("small"),
    maxNamespacesPerTeam: z.number().default(10),
    allowedFeatures: z
      .array(z.string())
      .default([
        "istio-injection",
        "monitoring-enhanced",
        "backup-enabled",
        "gpu-access",
        "database-access",
        "external-ingress",
      ]),
    costTrackingEnabled: z.boolean().default(true),
    auditLogRetentionDays: z.number().default(90),
  }),

  // Monitoring Configuration
  monitoring: z.object({
    prometheusUrl: z.string().optional(),
    grafanaUrl: z.string().optional(),
    alertmanagerUrl: z.string().optional(),
    kubecostUrl: z.string().optional(),
  }),

  // Rate Limiting
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    maxRequests: z.number().default(100),
    skipSuccessfulRequests: z.boolean().default(false),
  }),

  // Logging Configuration
  logging: z.object({
    level: z.enum(["error", "warn", "info", "debug"]).default("info"),
    format: z.enum(["json", "simple"]).default("json"),
  }),
});

const rawConfig = {
  nodeEnv: process.env.NODE_ENV as "development" | "production" | "test",
  port: parseInt(process.env.PORT || "3000", 10),
  corsOrigins:
    process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:7007",

  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    issuer: process.env.JWT_ISSUER || "platform-api",
    audience: process.env.JWT_AUDIENCE || "platform-users",
  },

  azureAd: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    tenantId: process.env.AZURE_TENANT_ID!,
    scope: process.env.AZURE_SCOPE || "https://graph.microsoft.com/.default",
  },

  kubernetes: {
    context: process.env.KUBE_CONTEXT,
    namespace: process.env.KUBE_NAMESPACE || "default",
    configPath: process.env.KUBECONFIG,
  },

  redis: {
    url: process.env.REDIS_URL!,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || "0", 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || "platform:",
  },

  database: {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT!, 10),
    database: process.env.DB_NAME!,
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    ssl: process.env.DB_SSL === "true",
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10", 10),
  },

  argo: {
    baseUrl: process.env.ARGO_WORKFLOWS_URL || "http://localhost:2746",
    namespace: process.env.ARGO_NAMESPACE || "argo",
    token: process.env.ARGO_TOKEN,
    timeout: parseInt(process.env.ARGO_TIMEOUT || "30000", 10),
  },

  platform: {
    defaultResourceTier: process.env.PLATFORM_DEFAULT_TIER || "small",
    maxNamespacesPerTeam: parseInt(
      process.env.PLATFORM_MAX_NAMESPACES_PER_TEAM || "10",
      10,
    ),
    allowedFeatures: (
      process.env.PLATFORM_ALLOWED_FEATURES ||
      "istio-injection,monitoring-enhanced,backup-enabled,gpu-access,database-access,external-ingress"
    )
      .split(",")
      .map((f) => f.trim()),
    costTrackingEnabled: process.env.PLATFORM_COST_TRACKING !== "false",
    auditLogRetentionDays: parseInt(
      process.env.PLATFORM_AUDIT_RETENTION_DAYS || "90",
      10,
    ),
  },

  monitoring: {
    prometheusUrl: process.env.PROMETHEUS_URL,
    grafanaUrl: process.env.GRAFANA_URL,
    alertmanagerUrl: process.env.ALERTMANAGER_URL,
    kubecostUrl: process.env.KUBECOST_URL,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === "true",
  },

  logging: {
    level:
      (process.env.LOG_LEVEL as "error" | "warn" | "info" | "debug") || "info",
    format: (process.env.LOG_FORMAT as "json" | "simple") || "json",
  },
};

export const config = configSchema.parse(rawConfig);

// Validate required environment variables
function validateRequiredEnvVars() {
  const requiredEnvVars = [
    "JWT_SECRET",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_TENANT_ID",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "REDIS_URL",
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}. Please ensure all secrets are properly synced from Azure Key Vault via External Secrets.`,
    );
  }
}

// Always validate required environment variables on startup
validateRequiredEnvVars();
