// Alternative database configuration that can parse DATABASE_URL
// This is an example of how to modify the config to support DATABASE_URL parsing

import { URL } from "url";

// Helper function to parse DATABASE_URL
function parseDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1), // Remove leading slash
      username: url.username,
      password: url.password,
      ssl: url.searchParams.get("sslmode") !== "disable",
    };
  } catch (error) {
    throw new Error(
      `Invalid DATABASE_URL format: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Database configuration with DATABASE_URL fallback
export function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  // If individual DB variables are provided, use them
  if (process.env.DB_HOST && process.env.DB_USER) {
    return {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_NAME || "platform",
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      ssl: process.env.DB_SSL === "true",
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10", 10),
    };
  }

  // Otherwise, parse DATABASE_URL
  if (databaseUrl) {
    const parsed = parseDatabaseUrl(databaseUrl);
    return {
      ...parsed,
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10", 10),
    };
  }

  throw new Error(
    "Either DATABASE_URL or individual DB_* environment variables must be provided",
  );
}

// Example of how to integrate this into the main config:
// Replace the database section in rawConfig with:
// database: getDatabaseConfig(),

// And update the Zod schema to make individual fields optional:
// database: z.object({
//   host: z.string(),
//   port: z.number(),
//   database: z.string(),
//   username: z.string(),
//   password: z.string(),
//   ssl: z.boolean().default(true),
//   maxConnections: z.number().default(10)
// }),
