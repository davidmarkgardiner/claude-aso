// Test configuration that doesn't expose real secrets
// This configuration is used only for unit tests and integration tests

export const testConfig = {
  nodeEnv: "test",
  port: 0, // Use random port for tests

  cors: {
    origin: ["http://localhost:3000", "http://localhost:7007"],
  },

  jwt: {
    secret: "test-jwt-secret-for-automated-tests-only",
    expiresIn: "1h",
    issuer: "platform-api-test",
    audience: "test-users",
  },

  azureAd: {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    tenantId: "test-tenant-id",
    scope: "https://graph.microsoft.com/.default",
  },

  kubernetes: {
    context: "test-context",
    namespace: "test-namespace",
    configPath: undefined, // Use in-cluster config for tests
  },

  redis: {
    url: process.env.TEST_REDIS_URL || "redis://localhost:6379",
    password: undefined, // No password for test redis
    db: 15, // Use different DB for tests
    keyPrefix: "test:platform:",
  },

  database: {
    host: process.env.TEST_DB_HOST || "localhost",
    port: parseInt(process.env.TEST_DB_PORT || "5433", 10), // Different port for test DB
    database: process.env.TEST_DB_NAME || "platform_test",
    username: process.env.TEST_DB_USER || "platform_test",
    password: process.env.TEST_DB_PASSWORD || "test-password-only", // pragma: allowlist secret
    ssl: false, // Disable SSL for test database
    maxConnections: 5,
  },

  argo: {
    baseUrl: "http://localhost:2746",
    namespace: "argo-test",
    token: undefined,
    timeout: 5000, // Shorter timeout for tests
  },

  platform: {
    defaultResourceTier: "micro",
    maxNamespacesPerTeam: 3, // Lower limit for tests
    allowedFeatures: ["istio-injection", "monitoring-basic", "logging-basic"],
    costTrackingEnabled: false, // Disable for tests
    auditLogRetentionDays: 1, // Short retention for tests
  },

  monitoring: {
    prometheusUrl: undefined,
    grafanaUrl: undefined,
    alertmanagerUrl: undefined,
    kubecostUrl: undefined,
  },

  rateLimit: {
    windowMs: 60 * 1000, // 1 minute for tests
    maxRequests: 1000, // High limit for tests
    skipSuccessfulRequests: true,
  },

  logging: {
    level: "error" as const, // Minimal logging for tests
    format: "simple" as const,
  },
};

// Export a function that validates test environment
export function validateTestEnvironment(): void {
  // Check that we're actually in test environment
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test configuration can only be used when NODE_ENV=test");
  }

  // Ensure no production secrets are accidentally used
  const dangerousEnvVars = [
    "JWT_SECRET",
    "AZURE_CLIENT_SECRET",
    "DB_PASSWORD",
    "REDIS_PASSWORD",
  ];

  const foundProductionSecrets = dangerousEnvVars.filter(
    (varName) =>
      process.env[varName] &&
      !process.env[varName]!.includes("test") &&
      process.env[varName] !== "",
  );

  if (foundProductionSecrets.length > 0) {
    throw new Error(
      `Production secrets detected in test environment: ${foundProductionSecrets.join(", ")}. ` +
        "Tests should never use production secrets.",
    );
  }
}
