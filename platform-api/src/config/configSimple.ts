// Validate environment variables early
function validateEnvVars() {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      "JWT_SECRET environment variable is required. Please ensure secrets are properly synced from Azure Key Vault via External Secrets.",
    );
  }
}

// Validate on module load
validateEnvVars();

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),

  cors: {
    origin: process.env.CORS_ORIGINS?.split(",") || [
      "http://localhost:3000",
      "http://localhost:7007",
    ],
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: "24h",
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: "simple",
  },

  platform: {
    maxNamespacesPerTeam: 10,
    allowedFeatures: [
      "istio-injection",
      "monitoring-enhanced",
      "monitoring-basic",
      "logging-enhanced",
      "logging-basic",
      "gpu-support",
      "security-scanning",
    ],
  },

  argo: {
    namespace: "argo-workflows",
  },
};
