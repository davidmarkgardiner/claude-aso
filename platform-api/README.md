# Platform API - Namespace-as-a-Service

A comprehensive API backend for the Namespace-as-a-Service platform, providing self-service namespace provisioning, multi-tenancy management, and platform analytics.

## Features

- 🚀 **Self-Service Namespace Provisioning** - Automated namespace creation with customizable resource tiers
- 🔐 **Azure AD Integration** - Enterprise authentication and RBAC
- 🏢 **Multi-Tenancy** - Team-based isolation and resource management
- 📊 **Analytics & Monitoring** - Comprehensive platform metrics and cost tracking
- 🎯 **Service Catalog** - Pre-built templates for common workload patterns
- ⚡ **Workflow Orchestration** - Argo Workflows for complex provisioning logic
- 🛡️ **Security** - Policy enforcement, audit logging, and compliance

## Quick Start

### Prerequisites

- Node.js 18+
- Kubernetes cluster with kubectl configured
- Docker (for containerized development)
- Argo Workflows (optional but recommended)

### Local Development

1. **Clone and Install Dependencies**
   ```bash
   git clone <repository>
   cd platform-api
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.sample .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:3000`

### Docker Development

```bash
# Start all services including Redis and PostgreSQL
docker-compose up -d

# View logs
docker-compose logs -f platform-api

# Stop services
docker-compose down
```

### Production Build

```bash
# Build TypeScript
npm run build

# Start production server
npm start

# Or build Docker image
docker build -t platform-api:latest .
```

## API Documentation

### Authentication

All API endpoints (except health checks) require authentication. The API supports two authentication methods:

1. **Azure AD Bearer Token** - Primary method for production
2. **Platform JWT** - For service-to-service communication

Include the token in the `Authorization` header:
```bash
Authorization: Bearer <token>
```

### Core Endpoints

#### Namespace Management
- `POST /api/platform/namespaces/request` - Request new namespace
- `GET /api/platform/namespaces/request/:id/status` - Get provisioning status
- `GET /api/platform/namespaces/team/:team` - List team namespaces
- `GET /api/platform/namespaces/:namespace` - Get namespace details

#### Service Catalog
- `GET /api/platform/catalog/templates` - List available templates
- `GET /api/platform/catalog/templates/:id` - Get template details
- `POST /api/platform/catalog/templates/:id/deploy` - Deploy from template

#### Analytics
- `GET /api/platform/analytics/usage` - Platform usage metrics
- `GET /api/platform/analytics/teams` - Team-based analytics
- `GET /api/platform/analytics/costs` - Cost analysis
- `GET /api/platform/analytics/performance` - Performance metrics

#### Health Checks
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health with dependencies
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

### Example: Request a New Namespace

```bash
curl -X POST http://localhost:3000/api/platform/namespaces/request \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "namespaceName": "my-app-dev",
    "team": "frontend",
    "environment": "development",
    "resourceTier": "small",
    "networkPolicy": "isolated",
    "features": ["istio-injection", "monitoring-enhanced"],
    "description": "Development environment for my-app"
  }'
```

### Example: Deploy from Template

```bash
curl -X POST http://localhost:3000/api/platform/catalog/templates/microservice-api/deploy \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "payment-service",
    "team": "backend",
    "environment": "staging",
    "databaseType": "postgresql",
    "externalDomain": "api.company.com"
  }'
```

## Configuration

### Environment Variables

The platform API is configured through environment variables. See `.env.sample` for all available options.

#### Required Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | `your-secret-key` |
| `AZURE_CLIENT_ID` | Azure AD app client ID | `abc123...` |
| `AZURE_CLIENT_SECRET` | Azure AD app secret | `secret123...` |
| `AZURE_TENANT_ID` | Azure AD tenant ID | `tenant123...` |

#### Optional Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level | `info` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |

### Resource Tiers

The platform supports different resource tiers for namespaces:

| Tier | CPU Limit | Memory Limit | Storage | Est. Cost/Month |
|------|-----------|--------------|---------|----------------|
| `micro` | 1 core | 2GB | 10GB | $50 |
| `small` | 2 cores | 4GB | 20GB | $100 |
| `medium` | 4 cores | 8GB | 50GB | $200 |
| `large` | 8 cores | 16GB | 100GB | $400 |

### Network Policies

| Policy | Description | Use Case |
|--------|-------------|----------|
| `isolated` | Complete isolation except shared services | Production, sensitive data |
| `team-shared` | Access within team namespaces | Development, staging |
| `open` | No network restrictions | Development only |

## Architecture

### Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Backstage     │    │   Platform API   │    │  Argo Workflows │
│   Portal        │────│                  │────│                 │
│                 │    │  - Auth          │    │  - Provisioning │
└─────────────────┘    │  - Validation    │    │  - Orchestration│
                       │  - Orchestration │    │                 │
                       └──────────────────┘    └─────────────────┘
                               │
                               │
                       ┌──────────────────┐
                       │   Kubernetes     │
                       │   - Capsule      │
                       │   - Gatekeeper   │
                       │   - Istio        │
                       └──────────────────┘
```

### Request Flow

1. User submits namespace request via Backstage portal
2. Platform API validates request and user permissions
3. API generates Argo Workflow specification
4. Argo executes provisioning workflow
5. Kubernetes resources are created (namespace, RBAC, quotas, policies)
6. Status is updated and user is notified

## Development

### Project Structure

```
src/
├── config/          # Configuration management
├── middleware/      # Express middleware (auth, logging, etc.)
├── routes/         # API route handlers
├── services/       # Business logic and external integrations
└── utils/          # Utility functions and helpers

docker/             # Docker configuration files
docs/              # Additional documentation
tests/             # Test files
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run test suite
- `npm run lint` - Run ESLint
- `docker:build` - Build Docker image
- `docker:run` - Run Docker container

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Adding New Features

1. **Create Route Handler** - Add new routes in `src/routes/`
2. **Add Business Logic** - Implement services in `src/services/`
3. **Add Middleware** - Create reusable middleware in `src/middleware/`
4. **Update Configuration** - Add config options in `src/config/`
5. **Write Tests** - Add comprehensive tests
6. **Update Documentation** - Update this README and API docs

## Monitoring & Observability

### Health Checks

The platform API provides multiple health check endpoints:

- `/health` - Basic health status
- `/health/detailed` - Comprehensive health including dependencies
- `/health/ready` - Kubernetes readiness probe
- `/health/live` - Kubernetes liveness probe
- `/health/metrics` - Prometheus metrics endpoint

### Logging

Structured JSON logging using Winston with configurable levels:

```javascript
logger.info('Namespace provisioned', {
  namespaceName: 'my-app-dev',
  team: 'frontend',
  requestId: 'req-123'
});
```

### Metrics

Prometheus metrics are exposed at `/health/metrics` including:

- Request counts and duration
- Namespace provisioning metrics
- Error rates and types
- Custom business metrics

## Security

### Authentication & Authorization

- **Azure AD Integration** - Enterprise SSO with group-based roles
- **JWT Tokens** - Secure service-to-service communication  
- **RBAC** - Role-based access control with fine-grained permissions
- **Team Isolation** - Users can only access their team's resources

### Security Features

- **Rate Limiting** - Prevent API abuse
- **Input Validation** - Joi schema validation for all inputs
- **Audit Logging** - Complete audit trail of all operations
- **Secure Headers** - Helmet.js for security headers
- **CORS Protection** - Configurable CORS policies

### Best Practices

- Secrets managed through environment variables
- Non-root container user
- Regular security updates
- Dependency vulnerability scanning

## Deployment

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: platform-api
  template:
    metadata:
      labels:
        app: platform-api
    spec:
      containers:
      - name: platform-api
        image: platform-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: platform-secrets
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
```

### Environment-Specific Configuration

- **Development** - Local development with Docker Compose
- **Staging** - Similar to production with test data
- **Production** - High availability with monitoring and alerting

## Troubleshooting

### Common Issues

1. **Kubernetes Connection Issues**
   - Verify KUBECONFIG is set correctly
   - Check cluster connectivity with `kubectl cluster-info`
   - Ensure service account has proper RBAC permissions

2. **Authentication Failures**
   - Verify Azure AD configuration
   - Check JWT secret is set correctly
   - Ensure user has proper group memberships

3. **Namespace Provisioning Failures**
   - Check Argo Workflows is running
   - Verify workflow templates are deployed
   - Check Kubernetes resource quotas

### Debug Mode

Enable detailed logging in development:

```bash
LOG_LEVEL=debug npm run dev
```

### Health Checks

Use the detailed health endpoint to diagnose issues:

```bash
curl http://localhost:3000/health/detailed
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style

- Use TypeScript strict mode
- Follow existing code style
- Add JSDoc comments for public APIs
- Use meaningful variable and function names

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:

- Create an issue in the repository
- Contact the platform team at platform-team@company.com
- Check the documentation wiki