# Platform API Testing Guide

This guide provides comprehensive information about testing the Namespace-as-a-Service Platform API, including how to run tests, understand the test structure, and demonstrate platform capabilities.

## 🚀 Quick Start

### Run All Tests

```bash
# Run complete test suite
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode during development
npm run test:watch

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:demo
```

### Run the Platform Demo

The platform demo showcases all major features in a single comprehensive test:

```bash
# Run the complete platform demonstration
npm run test -- tests/demo/platform-demo.test.ts --verbose

# Or run with detailed output
npm run test:demo
```

## 📁 Test Structure

```
tests/
├── demo/                    # Platform demonstration tests
│   └── platform-demo.test.ts
├── fixtures/                # Test data and mocks
│   ├── namespaces.ts
│   └── templates.ts
├── integration/             # API endpoint integration tests
│   ├── namespaces.test.ts
│   └── catalog.test.ts
├── unit/                    # Unit tests for services and middleware
│   ├── middleware/
│   │   └── auth.test.ts
│   └── services/
│       └── namespaceProvisioning.test.ts
├── globalSetup.ts          # Global test environment setup
├── globalTeardown.ts       # Global test cleanup
├── setup.ts               # Test configuration and utilities
└── README.md              # This documentation
```

## 🎭 Test Categories

### 1. Demo Tests (`tests/demo/`)

**Purpose**: Showcase the complete platform capabilities in real-world scenarios.

**Features Demonstrated**:

- 📋 Service catalog discovery and template browsing
- 🏗️ End-to-end namespace provisioning workflow
- 🚀 Service deployment from templates
- 🔒 Team-based access control enforcement
- 📊 Analytics, monitoring, and cost tracking
- 🏥 Health checks and system status
- ⚡ Performance metrics and rate limiting

**Run Command**:

```bash
npm run test -- tests/demo/platform-demo.test.ts --verbose
```

**Example Output**:

```
🎭 Platform Demo Starting...

✅ Application initialized with test tokens

📋 1. Service Catalog Discovery
   ✨ Found 4 available templates:
      1. Microservice API (microservice)
         📝 A production-ready REST API microservice...
         🏷️ Tags: nodejs, api, postgresql, redis, monitoring
         📦 Parameters: 6 configurable options

📊 Platform Usage Statistics:
   Total Namespaces: 12
   Active Deployments: 8
   Total Teams: 4
   Resource Utilization: 67% CPU, 72% Memory

🎉 Platform API Demo Complete!
```

### 2. Unit Tests (`tests/unit/`)

**Purpose**: Test individual components in isolation with mocked dependencies.

**Coverage**:

- `services/namespaceProvisioning.test.ts` - Core provisioning logic
- `middleware/auth.test.ts` - Authentication and authorization
- Service validation and error handling
- Business logic and edge cases

**Features Tested**:

- ✅ Namespace provisioning workflow
- ✅ Request validation and sanitization
- ✅ JWT token authentication
- ✅ Role-based access control (RBAC)
- ✅ Team-based authorization
- ✅ Error handling and edge cases
- ✅ Workflow generation and status tracking

**Example Test**:

```typescript
it("should successfully provision a namespace", async () => {
  mockKubernetesClient.namespaceExists.mockResolvedValue(false);
  mockArgoClient.submitWorkflow.mockResolvedValue({
    metadata: { name: "workflow-123" },
    status: { phase: "Running" },
  });

  const result = await service.provisionNamespace(validRequest);

  expect(result.requestId).toBeValidUUID();
  expect(result.status).toBe("pending");
  expect(mockKubernetesClient.namespaceExists).toHaveBeenCalled();
});
```

### 3. Integration Tests (`tests/integration/`)

**Purpose**: Test complete API endpoints with realistic request/response cycles.

**Coverage**:

- `namespaces.test.ts` - Namespace management endpoints
- `catalog.test.ts` - Service catalog and deployment endpoints
- Full HTTP request/response validation
- Authentication flow testing
- Error response handling

**Features Tested**:

- 🌐 Complete HTTP API endpoints
- 🔐 Authentication and authorization flows
- 📝 Request validation and error responses
- 📊 Pagination and filtering
- ⏱️ Rate limiting enforcement
- 🚫 Access control validation
- 📈 Response format consistency

**Example Test**:

```typescript
it("should successfully create namespace request", async () => {
  const response = await request(app)
    .post("/api/platform/namespaces/request")
    .set("Authorization", `Bearer ${validToken}`)
    .send(namespaceRequest)
    .expect(201);

  expect(response.body.success).toBe(true);
  expect(response.body.data.requestId).toBeValidUUID();
});
```

## 🧪 Test Fixtures and Mock Data

### Namespace Fixtures (`tests/fixtures/namespaces.ts`)

Provides realistic test data including:

- **Mock Namespaces**: Complete namespace objects with quotas, resources, and metadata
- **Provisioning Requests**: Sample requests in various states (pending, completed, failed)
- **User Profiles**: Different user types (developer, admin, team lead) with proper roles

### Template Fixtures (`tests/fixtures/templates.ts`)

Comprehensive service catalog data:

- **Service Templates**: Microservices, static websites, workers, databases
- **Template Parameters**: Validation rules, default values, and examples
- **Deployment Examples**: Real-world configuration scenarios
- **Workflow Manifests**: Complete Argo Workflow specifications

### Example Mock Template:

```typescript
{
  id: 'microservice-api',
  name: 'Microservice API',
  description: 'Production-ready REST API with monitoring',
  category: 'microservice',
  tags: ['nodejs', 'api', 'postgresql'],
  parameters: [
    {
      name: 'serviceName',
      type: 'string',
      required: true,
      validation: { pattern: '^[a-z][a-z0-9-]*[a-z0-9]$' }
    }
  ],
  examples: [
    {
      name: 'Basic Payment API',
      parameters: {
        serviceName: 'payment-api',
        databaseType: 'postgresql',
        replicas: 2
      }
    }
  ]
}
```

## 🛠️ Test Configuration

### Jest Configuration (`jest.config.js`)

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  globalSetup: "<rootDir>/tests/globalSetup.ts",
  globalTeardown: "<rootDir>/tests/globalTeardown.ts",
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/server.ts"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Test Environment Setup (`tests/setup.ts`)

- **Environment Variables**: Test-specific configuration
- **Mock Services**: External service mocking (Kubernetes, Argo)
- **Global Utilities**: Helper functions and test utilities
- **Custom Matchers**: UUID and ISO8601 date validation
- **Console Management**: Reduce test noise while preserving error logs

### Custom Jest Matchers

```typescript
expect("123e4567-e89b-12d3-a456-426614174000").toBeValidUUID();
expect("2023-01-01T12:00:00Z").toBeValidISO8601();
```

## 🔍 Coverage Reports

### Generate Coverage Report

```bash
npm run test:coverage
```

### Coverage Targets

The project maintains high test coverage standards:

- **Lines**: 80%+ coverage
- **Functions**: 80%+ coverage
- **Branches**: 80%+ coverage
- **Statements**: 80%+ coverage

### Coverage Output

```
----------------------------|---------|----------|---------|---------|
File                       | % Stmts | % Branch | % Funcs | % Lines |
----------------------------|---------|----------|---------|---------|
All files                  |   85.23  |   82.45  |   87.12  |   84.67 |
 src/services              |   89.34  |   86.21  |   91.45  |   88.92 |
  namespaceProvisioning.ts |   92.11  |   88.76  |   94.23  |   91.34 |
 src/middleware            |   83.45  |   79.23  |   85.67  |   82.11 |
  auth.ts                  |   86.23  |   82.45  |   88.91  |   85.34 |
----------------------------|---------|----------|---------|---------|
```

## 🚦 Running Specific Tests

### By Test Type

```bash
# Unit tests only
npm test -- tests/unit/

# Integration tests only
npm test -- tests/integration/

# Demo tests only
npm test -- tests/demo/
```

### By Component

```bash
# Authentication tests
npm test -- tests/unit/middleware/auth.test.ts

# Namespace provisioning tests
npm test -- tests/unit/services/namespaceProvisioning.test.ts

# API endpoint tests
npm test -- tests/integration/namespaces.test.ts
```

### By Pattern

```bash
# All namespace-related tests
npm test -- --testNamePattern="namespace"

# All authentication tests
npm test -- --testNamePattern="auth"

# All error handling tests
npm test -- --testNamePattern="error"
```

## 🎯 Test Best Practices

### 1. Test Structure (AAA Pattern)

```typescript
it("should do something specific", async () => {
  // Arrange - Set up test data and mocks
  mockService.method.mockResolvedValue(expectedResult);

  // Act - Execute the functionality being tested
  const result = await serviceUnderTest.performAction(input);

  // Assert - Verify the expected outcomes
  expect(result).toEqual(expectedResult);
  expect(mockService.method).toHaveBeenCalledWith(input);
});
```

### 2. Descriptive Test Names

```typescript
// ✅ Good - Specific and descriptive
it("should reject namespace request when user lacks team access");

// ❌ Bad - Vague and unclear
it("should handle error case");
```

### 3. Mock External Dependencies

```typescript
// Mock Kubernetes client
jest.mock("../../src/services/kubernetesClient");

// Mock specific methods with expected behavior
mockKubernetesClient.namespaceExists.mockResolvedValue(false);
```

### 4. Use Test Fixtures

```typescript
import { mockUsers, mockNamespaces } from "../fixtures/namespaces";

// Use realistic test data
const testRequest = mockNamespaces[0];
const testUser = mockUsers.developer;
```

## 🐛 Debugging Tests

### Enable Debug Logging

```bash
# Run tests with debug logging
LOG_LEVEL=debug npm test

# Run specific test with verbose output
npm test -- tests/demo/platform-demo.test.ts --verbose --no-coverage
```

### Debug Individual Tests

```typescript
// Add debug logging in tests
it("should debug specific behavior", async () => {
  console.log("Test data:", testInput);

  const result = await service.method(testInput);

  console.log("Result:", result);
  expect(result).toBeDefined();
});
```

### VSCode Debugging

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--testNamePattern=your test name"],
  "cwd": "${workspaceFolder}",
  "console": "integratedTerminal"
}
```

## 📈 Performance Testing

### Load Testing Example

```typescript
it("should handle concurrent requests", async () => {
  const requests = Array(10)
    .fill(null)
    .map(() =>
      request(app)
        .post("/api/platform/namespaces/request")
        .set("Authorization", `Bearer ${token}`)
        .send(requestData),
    );

  const responses = await Promise.all(requests);

  responses.forEach((response) => {
    expect(response.status).toBeLessThan(500);
  });
});
```

### Memory Usage Monitoring

```typescript
it("should not leak memory during batch operations", async () => {
  const initialMemory = process.memoryUsage();

  // Perform many operations
  for (let i = 0; i < 1000; i++) {
    await service.performOperation();
  }

  // Force garbage collection (in test environment)
  global.gc && global.gc();

  const finalMemory = process.memoryUsage();
  const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

  expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB threshold
});
```

## 🔗 Continuous Integration

### GitHub Actions Example

```yaml
name: Test Platform API

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run platform demo
        run: npm run test:demo

      - name: Generate coverage report
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
```

## 🎉 Getting Started

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Set Environment Variables**:

   ```bash
   cp .env.sample .env.test
   # Edit .env.test with test configuration
   ```

3. **Run Quick Test**:

   ```bash
   npm test -- tests/demo/platform-demo.test.ts
   ```

4. **Explore Test Results**:
   - Check console output for demo results
   - Review coverage reports in `coverage/` directory
   - Examine test files for implementation details

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest API Testing](https://github.com/visionmedia/supertest)
- [TypeScript Testing Guide](https://kulshekhar.github.io/ts-jest/)
- [Platform API Documentation](../README.md)

## 🤝 Contributing

When adding new tests:

1. **Follow Naming Conventions**: Use descriptive test names
2. **Add Coverage**: Ensure new code has corresponding tests
3. **Update Fixtures**: Add relevant mock data for new features
4. **Document Changes**: Update this README for significant changes
5. **Verify Demo**: Ensure the platform demo still showcases new features

---

Happy Testing! 🚀
