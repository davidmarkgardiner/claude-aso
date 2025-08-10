import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique request ID
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('x-request-id', req.requestId);

  // Skip logging for health checks in production
  const shouldSkipLogging = process.env.NODE_ENV === 'production' && req.path === '/health';

  if (!shouldSkipLogging) {
    // Log incoming request
    logger.info('Incoming request', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id,
      userEmail: req.user?.email,
      contentLength: req.get('Content-Length'),
      referer: req.get('Referer')
    });
  }

  // Capture response details
  const originalSend = res.send;
  res.send = function(body: any) {
    const duration = Date.now() - req.startTime;
    
    if (!shouldSkipLogging) {
      logger.info('Request completed', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length'),
        userId: req.user?.id
      });

      // Log slow requests
      if (duration > 5000) { // 5 seconds
        logger.warn('Slow request detected', {
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          duration,
          userId: req.user?.id
        });
      }

      // Log client errors (4xx)
      if (res.statusCode >= 400 && res.statusCode < 500) {
        logger.warn('Client error', {
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          userId: req.user?.id,
          responseBody: process.env.NODE_ENV === 'development' ? body : undefined
        });
      }

      // Log server errors (5xx)
      if (res.statusCode >= 500) {
        logger.error('Server error', {
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userId: req.user?.id,
          responseBody: process.env.NODE_ENV === 'development' ? body : undefined
        });
      }
    }

    return originalSend.call(this, body);
  };

  next();
};