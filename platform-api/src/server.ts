import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { namespaceRouter } from './routes/namespaces';
import { catalogRouter } from './routes/catalog';
import { analyticsRouter } from './routes/analytics';
import { healthRouter } from './routes/health';
import { config } from './config/configSimple';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(requestLogger);

// Rate limiting
app.use(rateLimitMiddleware);

// Authentication (skip for health checks)
app.use('/api', authMiddleware);

// API Routes
app.use('/health', healthRouter);
app.use('/api/platform/namespaces', namespaceRouter);
app.use('/api/platform/catalog', catalogRouter);
app.use('/api/platform/analytics', analyticsRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'Namespace-as-a-Service Platform API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

const PORT = config.port;

server.listen(PORT, () => {
  logger.info(`Platform API server started on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Kubernetes context: ${process.env.KUBE_CONTEXT || 'default'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;