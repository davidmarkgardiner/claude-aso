import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock external services by default
jest.mock('../src/services/kubernetesClient');
jest.mock('../src/services/argoWorkflowsClient');

// Global test timeout
jest.setTimeout(30000);

// Suppress console logs during tests unless specifically needed
const originalConsole = console;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Restore console for specific tests that need it
global.restoreConsole = () => {
  global.console = originalConsole;
};

// Mock logger to prevent log output during tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Global test utilities
global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  mockUser: {
    id: 'test-user-123',
    email: 'test@company.com',
    name: 'Test User',
    groups: ['frontend-team-developers'],
    roles: ['namespace:developer', 'team:frontend:developer'],
    tenant: 'frontend'
  },
  mockAdminUser: {
    id: 'admin-user-123',
    email: 'admin@company.com', 
    name: 'Admin User',
    groups: ['platform-admins'],
    roles: ['platform:admin', 'namespace:admin'],
    tenant: 'platform'
  }
};

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidISO8601(): R;
    }
  }
  
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    mockUser: any;
    mockAdminUser: any;
  };
  
  var restoreConsole: () => void;
}

expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    return {
      message: () => `expected ${received} to be a valid UUID`,
      pass
    };
  },
  
  toBeValidISO8601(received) {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    const pass = iso8601Regex.test(received) && !isNaN(Date.parse(received));
    
    return {
      message: () => `expected ${received} to be a valid ISO 8601 date string`,
      pass
    };
  }
});