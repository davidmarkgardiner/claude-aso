import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config/config';

// Default rate limit configuration
export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
  
  // Key generator - use user ID if authenticated, otherwise IP
  keyGenerator: (req: Request): string => {
    return req.user?.id || req.ip;
  },
  
  // Custom handler for rate limit exceeded
  handler: (req: Request, res: Response) => {
    const identifier = req.user?.id || req.ip;
    
    logger.warn('Rate limit exceeded', {
      identifier,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      error: 'RateLimitExceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      timestamp: new Date().toISOString()
    });
  },
  
  // Skip function for certain conditions
  skip: (req: Request): boolean => {
    // Skip rate limiting for health checks
    if (req.path === '/health') {
      return true;
    }
    
    // Skip for platform admins
    if (req.user?.roles?.includes('platform:admin')) {
      return true;
    }
    
    return false;
  },
  
  // Add rate limit info to response headers
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limit for resource-intensive operations
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 requests per window
  
  keyGenerator: (req: Request): string => {
    return req.user?.id || req.ip;
  },
  
  handler: (req: Request, res: Response) => {
    const identifier = req.user?.id || req.ip;
    
    logger.warn('Strict rate limit exceeded', {
      identifier,
      path: req.path,
      method: req.method
    });
    
    res.status(429).json({
      error: 'RateLimitExceeded',
      message: 'Too many resource-intensive requests. Please wait before trying again.',
      retryAfter: Math.ceil(15 * 60), // 15 minutes
      timestamp: new Date().toISOString()
    });
  },
  
  skip: (req: Request): boolean => {
    return req.user?.roles?.includes('platform:admin') || false;
  },
  
  standardHeaders: true,
  legacyHeaders: false
});

// Team-specific rate limiting
export const teamRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Max 50 requests per team per minute
  
  keyGenerator: (req: Request): string => {
    const team = req.params.team || req.body.team || req.user?.tenant;
    return `team:${team || 'unknown'}`;
  },
  
  handler: (req: Request, res: Response) => {
    const team = req.params.team || req.body.team || req.user?.tenant;
    
    logger.warn('Team rate limit exceeded', {
      team,
      userId: req.user?.id,
      path: req.path
    });
    
    res.status(429).json({
      error: 'TeamRateLimitExceeded',
      message: `Team ${team} has exceeded the rate limit. Please slow down requests.`,
      retryAfter: 60,
      timestamp: new Date().toISOString()
    });
  },
  
  standardHeaders: true,
  legacyHeaders: false
});