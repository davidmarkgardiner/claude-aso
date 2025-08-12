/**
 * Environment configuration for Platform UI
 * This file handles runtime configuration injection and environment-specific settings
 */

export interface AppConfig {
  apiUrl: string;
  authEnabled: boolean;
  environment: string;
  features: {
    darkMode: boolean;
    analytics: boolean;
    costTracking: boolean;
    debugMode: boolean;
  };
  oauth: {
    clientId: string;
    authority: string;
    redirectUri: string;
    scopes: string[];
  };
  monitoring: {
    enableMetrics: boolean;
    enableTracing: boolean;
  };
}

// Default configuration for development
const defaultConfig: AppConfig = {
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:3000",
  authEnabled: import.meta.env.VITE_AUTH_ENABLED === "true" || false,
  environment: import.meta.env.VITE_ENVIRONMENT || "development",
  features: {
    darkMode: import.meta.env.VITE_FEATURE_DARK_MODE === "true" || true,
    analytics: import.meta.env.VITE_FEATURE_ANALYTICS === "true" || false,
    costTracking:
      import.meta.env.VITE_FEATURE_COST_TRACKING === "true" || false,
    debugMode: import.meta.env.VITE_DEBUG_MODE === "true" || false,
  },
  oauth: {
    clientId: import.meta.env.VITE_OAUTH_CLIENT_ID || "",
    authority: import.meta.env.VITE_OAUTH_AUTHORITY || "",
    redirectUri:
      import.meta.env.VITE_OAUTH_REDIRECT_URI || window.location.origin,
    scopes: ["User.Read", "Directory.Read.All"],
  },
  monitoring: {
    enableMetrics: import.meta.env.VITE_ENABLE_METRICS === "true" || false,
    enableTracing: import.meta.env.VITE_ENABLE_TRACING === "true" || false,
  },
};

// Runtime configuration that can be injected via config.json
let runtimeConfig: Partial<AppConfig> = {};

/**
 * Load runtime configuration from /config/config.json
 * This allows configuration injection without rebuilding the application
 */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch("/config/config.json");
    if (response.ok) {
      const config = await response.json();
      runtimeConfig = config;
      console.log("Runtime configuration loaded successfully");
    } else {
      console.warn("Runtime configuration not found, using default values");
    }
  } catch (error) {
    console.warn("Failed to load runtime configuration:", error);
  }
}

/**
 * Get the merged configuration (runtime overrides default)
 */
export function getConfig(): AppConfig {
  return {
    ...defaultConfig,
    ...runtimeConfig,
    features: {
      ...defaultConfig.features,
      ...(runtimeConfig.features || {}),
    },
    oauth: {
      ...defaultConfig.oauth,
      ...(runtimeConfig.oauth || {}),
    },
    monitoring: {
      ...defaultConfig.monitoring,
      ...(runtimeConfig.monitoring || {}),
    },
  };
}

/**
 * Validate that required configuration is present
 */
export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  if (!config.apiUrl) {
    errors.push("API URL is required");
  }

  if (config.authEnabled && !config.oauth.clientId) {
    errors.push("OAuth client ID is required when authentication is enabled");
  }

  if (config.authEnabled && !config.oauth.authority) {
    errors.push("OAuth authority is required when authentication is enabled");
  }

  // Validate URLs
  if (config.apiUrl && !isValidUrl(config.apiUrl)) {
    errors.push("API URL must be a valid URL");
  }

  if (config.oauth.authority && !isValidUrl(config.oauth.authority)) {
    errors.push("OAuth authority must be a valid URL");
  }

  return errors;
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentInfo() {
  const config = getConfig();
  return {
    environment: config.environment,
    isDevelopment: config.environment === "development",
    isProduction: config.environment === "production",
    isStaging: config.environment === "staging",
    debugMode: config.features.debugMode,
  };
}
