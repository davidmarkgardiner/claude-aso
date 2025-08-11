export const logger = {
  info: (message: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log(`[INFO] ${message}`, meta || '');
    }
  },
  warn: (message: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, meta || '');
    }
  },
  error: (message: string, error?: any) => {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, error || '');
    }
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV !== 'test' && process.env.LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }
};