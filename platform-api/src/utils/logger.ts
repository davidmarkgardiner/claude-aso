import winston from 'winston';
import { config } from '../config/config';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  config.logging.format === 'json' 
    ? winston.format.json()
    : winston.format.simple()
);

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { 
    service: 'platform-api',
    environment: config.nodeEnv 
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let metaStr = '';
          if (Object.keys(meta).length) {
            try {
              // Handle circular references in logged objects
              metaStr = JSON.stringify(meta, (_key, value) => {
                if (typeof value === 'object' && value !== null) {
                  // Skip circular references and complex objects like sockets
                  if (value.constructor?.name === 'Socket' || 
                      value.constructor?.name === 'ClientRequest' ||
                      value.constructor?.name === 'IncomingMessage') {
                    return '[Circular/Complex Object]';
                  }
                }
                return value;
              }, 2);
            } catch (error) {
              metaStr = '[Error serializing metadata]';
            }
          }
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
    })
  ]
});

// Add file transport for production
if (config.nodeEnv === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.json(),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.json(),
    maxsize: 5242880, // 5MB  
    maxFiles: 5
  }));
}

export default logger;