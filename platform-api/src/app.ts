import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/config";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimit } from "./middleware/rateLimit";

// Import routes
import { healthRouter } from "./routes/health";
import { namespaceRouter } from "./routes/namespaces";
import { catalogRouter } from "./routes/catalog";
import { analyticsRouter } from "./routes/analytics";

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );

  // Basic middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Rate limiting
  app.use(rateLimit);

  // Routes
  app.use("/health", healthRouter);
  app.use("/api/platform/namespaces", namespaceRouter);
  app.use("/api/platform/catalog", catalogRouter);
  app.use("/api/platform/analytics", analyticsRouter);

  // Root endpoint
  app.get("/", (_req, res) => {
    res.json({
      name: "Platform API",
      version: "1.0.0",
      description: "Namespace-as-a-Service Platform API",
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  });

  // 404 handler
  app.use("*", (req, res) => {
    res.status(404).json({
      error: "Endpoint not found",
      path: req.originalUrl,
      method: req.method,
    });
  });

  // Error handling middleware
  app.use(errorHandler);

  return app;
}
