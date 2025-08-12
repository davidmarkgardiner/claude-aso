# Platform UI - Developer Portal & Self-Service Platform

A modern, Backstage-inspired developer portal providing self-service namespace provisioning, service catalog, and multi-tenant resource management for Kubernetes platforms.

## Features

- 🎨 **Modern UI/UX** - Clean, intuitive interface built with React 18 + TypeScript
- 🚀 **Self-Service Portal** - Developers can provision namespaces without operations team
- 📊 **Resource Management** - Visual resource quota tracking and utilization metrics
- 🔐 **Multi-Tenancy** - Team-based access control and resource isolation
- 📦 **Service Catalog** - Browse and deploy from standardized service templates
- 📈 **Analytics Dashboard** - Platform usage, cost tracking, and performance metrics
- 🛡️ **Security Integration** - Azure AD authentication and role-based access
- 📱 **Responsive Design** - Works seamlessly on desktop, tablet, and mobile

## Quick Start

### Prerequisites

- Node.js 18+
- Platform API running (see `../platform-api/README.md`)
- Modern web browser

### Local Development

1. **Install Dependencies**

   ```bash
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

   The UI will be available at `http://localhost:3000`

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Serve with a static server
npx serve dist
```

## Configuration

### Environment Variables

| Variable               | Description                    | Default                 | Required        |
| ---------------------- | ------------------------------ | ----------------------- | --------------- |
| `VITE_API_BASE_URL`    | Platform API base URL          | `http://localhost:3001` | Yes             |
| `VITE_AUTH_ENABLED`    | Enable Azure AD authentication | `false`                 | No              |
| `VITE_AZURE_CLIENT_ID` | Azure AD app client ID         | -                       | If auth enabled |
| `VITE_AZURE_TENANT_ID` | Azure AD tenant ID             | -                       | If auth enabled |
| `VITE_FEATURE_FLAGS`   | Comma-separated feature flags  | -                       | No              |

### Example `.env` File

```bash
# Platform API Configuration
VITE_API_BASE_URL=http://localhost:3001
VITE_WEBSOCKET_URL=ws://localhost:3001

# Authentication (optional)
VITE_AUTH_ENABLED=true
VITE_AZURE_CLIENT_ID=your-azure-app-id
VITE_AZURE_TENANT_ID=your-tenant-id
VITE_AZURE_REDIRECT_URI=http://localhost:3000/auth/callback

# Feature Flags
VITE_FEATURE_FLAGS=cost-tracking,gpu-support,advanced-analytics

# Theme Configuration
VITE_THEME_PRIMARY_COLOR=#1976d2
VITE_THEME_COMPANY_NAME="Your Company"
VITE_THEME_LOGO_URL="/logo.png"
```

## Architecture

### Component Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/         # Generic components (Button, Modal, etc.)
│   ├── forms/          # Form components and validation
│   ├── layout/         # Layout components (Header, Sidebar, etc.)
│   └── charts/         # Data visualization components
├── pages/              # Page components (routes)
│   ├── Dashboard.tsx   # Main dashboard
│   ├── Namespaces.tsx  # Namespace management
│   ├── ServiceCatalog.tsx # Service catalog
│   ├── Analytics.tsx   # Analytics dashboard
│   └── Settings.tsx    # User settings
├── services/           # API client and external services
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── types/              # TypeScript type definitions
└── styles/             # CSS and styling
```

### Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI Library**: Material-UI (MUI) v5
- **State Management**: Zustand + React Query
- **Routing**: React Router v6
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts + D3.js
- **Authentication**: Microsoft MSAL (Azure AD)
- **Testing**: Vitest + React Testing Library
- **Styling**: Emotion CSS-in-JS + MUI theming

## Features

### 🏠 Dashboard

The main dashboard provides an overview of:

- **Personal Namespaces** - Quick access to your team's namespaces
- **Recent Activity** - Latest deployments and changes
- **Resource Usage** - Current quota utilization across namespaces
- **Platform Status** - Health of platform services and clusters
- **Quick Actions** - One-click access to common tasks

```typescript
interface DashboardData {
  namespaces: Namespace[];
  recentActivity: Activity[];
  resourceUsage: ResourceMetrics;
  platformStatus: HealthStatus;
  quickActions: QuickAction[];
}
```

### 📦 Namespace Management

Self-service namespace provisioning with:

- **Resource Tiers** - Pre-configured resource allocations (small/medium/large)
- **Feature Selection** - Opt-in capabilities (Istio, monitoring, GPU access)
- **Team Isolation** - Automatic RBAC and network policy application
- **Cost Estimation** - Real-time cost calculation based on selected resources

```typescript
interface NamespaceRequest {
  name: string;
  team: string;
  environment: "development" | "staging" | "production";
  resourceTier: "small" | "medium" | "large";
  features: FeatureFlag[];
  description?: string;
}
```

### 🛍️ Service Catalog

Browse and deploy standardized services:

- **Template Gallery** - Pre-built application templates
- **Parameter Forms** - Dynamic forms based on template parameters
- **Deployment Tracking** - Real-time deployment progress
- **Custom Templates** - Upload and share your own templates

```typescript
interface ServiceTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  parameters: TemplateParameter[];
  examples: TemplateExample[];
  documentation: string;
}
```

### 📊 Analytics Dashboard

Comprehensive platform metrics:

- **Usage Analytics** - Namespace adoption, resource utilization
- **Cost Tracking** - Spend analysis by team and environment
- **Performance Metrics** - API response times, success rates
- **Trend Analysis** - Historical data and forecasting

### 🎨 Design System

#### Colors & Theme

```css
:root {
  --primary: #1976d2;
  --secondary: #dc004e;
  --success: #2e7d32;
  --warning: #ed6c02;
  --error: #d32f2f;
  --background: #f5f5f5;
  --surface: #ffffff;
  --text-primary: #212121;
  --text-secondary: #757575;
}
```

#### Typography

- **Headers**: Roboto 600 (semi-bold)
- **Body**: Roboto 400 (regular)
- **Code**: 'Fira Code', monospace

#### Component Library

All components follow Material Design principles with custom branding:

```typescript
// Button variants
<Button variant="primary">Create Namespace</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger">Delete</Button>

// Status indicators
<StatusBadge status="active" />
<StatusBadge status="provisioning" />
<StatusBadge status="error" />

// Data visualization
<ResourceUsageChart data={metrics} />
<CostTrendChart period="30d" />
```

## API Integration

### Service Layer

```typescript
class PlatformAPIClient {
  constructor(baseURL: string, authToken?: string) {
    this.baseURL = baseURL;
    this.authToken = authToken;
  }

  async createNamespace(request: NamespaceRequest): Promise<Namespace> {
    return this.post("/api/platform/namespaces", request);
  }

  async getNamespaces(team?: string): Promise<Namespace[]> {
    const params = team ? `?team=${team}` : "";
    return this.get(`/api/platform/namespaces${params}`);
  }

  async getServiceTemplates(): Promise<ServiceTemplate[]> {
    return this.get("/api/platform/catalog/templates");
  }

  async deployService(
    deployment: ServiceDeployment,
  ): Promise<DeploymentResult> {
    return this.post("/api/platform/catalog/deploy", deployment);
  }
}
```

### State Management

Using Zustand for simple, type-safe state management:

```typescript
interface PlatformStore {
  // Namespaces
  namespaces: Namespace[];
  loadNamespaces: () => Promise<void>;
  createNamespace: (request: NamespaceRequest) => Promise<void>;

  // Service Catalog
  templates: ServiceTemplate[];
  loadTemplates: () => Promise<void>;

  // User & Auth
  user: User | null;
  login: () => Promise<void>;
  logout: () => void;
}

const usePlatformStore = create<PlatformStore>((set, get) => ({
  namespaces: [],
  templates: [],
  user: null,

  loadNamespaces: async () => {
    const namespaces = await apiClient.getNamespaces();
    set({ namespaces });
  },

  // ... other actions
}));
```

## Development

### Available Scripts

- `npm run dev` - Start development server with HMR
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run test suite
- `npm run test:ui` - Run tests with UI
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript checker

### Development Workflow

1. **Component Development**

   ```bash
   # Create new component
   npm run generate:component MyComponent

   # Start Storybook for component development
   npm run storybook
   ```

2. **API Integration**

   ```bash
   # Mock API server for development
   npm run mock-api

   # Test against real API
   VITE_API_BASE_URL=http://localhost:3001 npm run dev
   ```

3. **Testing**

   ```bash
   # Run tests in watch mode
   npm run test:watch

   # Run tests with coverage
   npm run test:coverage

   # Run E2E tests
   npm run test:e2e
   ```

### Code Style & Quality

- **ESLint** - Linting with React and TypeScript rules
- **Prettier** - Code formatting
- **Husky** - Git hooks for quality checks
- **Lint Staged** - Run linters on staged files
- **TypeScript** - Strict type checking

```typescript
// Example component with proper typing
interface NamespaceCardProps {
  namespace: Namespace;
  onSelect: (namespace: Namespace) => void;
  showMetrics?: boolean;
}

export const NamespaceCard: React.FC<NamespaceCardProps> = ({
  namespace,
  onSelect,
  showMetrics = true
}) => {
  return (
    <Card onClick={() => onSelect(namespace)}>
      <CardContent>
        <Typography variant="h6">{namespace.name}</Typography>
        <Chip label={namespace.team} color="primary" />
        {showMetrics && (
          <ResourceMetrics usage={namespace.resourceUsage} />
        )}
      </CardContent>
    </Card>
  );
};
```

## Authentication

### Azure AD Integration

```typescript
const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  }
};

const msalInstance = new PublicClientApplication(msalConfig);

// Login component
export const LoginButton: React.FC = () => {
  const handleLogin = async () => {
    try {
      await msalInstance.loginPopup({
        scopes: ["User.Read", "Directory.Read.All"]
      });
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return <Button onClick={handleLogin}>Sign in with Microsoft</Button>;
};
```

### Role-Based Access Control

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  teams: string[];
}

// HOC for role-based rendering
export const withRole = (allowedRoles: string[]) =>
  <P extends object>(Component: React.ComponentType<P>) =>
    (props: P) => {
      const { user } = useAuth();

      if (!user || !user.roles.some(role => allowedRoles.includes(role))) {
        return <AccessDenied />;
      }

      return <Component {...props} />;
    };

// Usage
const AdminPanel = withRole(['admin', 'platform-admin'])(AdminPanelComponent);
```

## Deployment

### Static Hosting

```bash
# Build for production
npm run build

# Deploy to any static hosting
# - Vercel: vercel --prod
# - Netlify: netlify deploy --prod --dir=dist
# - AWS S3: aws s3 sync dist/ s3://your-bucket --delete
```

### Docker

```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform-ui
spec:
  replicas: 3
  selector:
    matchLabels:
      app: platform-ui
  template:
    metadata:
      labels:
        app: platform-ui
    spec:
      containers:
        - name: platform-ui
          image: platform-ui:latest
          ports:
            - containerPort: 80
          env:
            - name: VITE_API_BASE_URL
              value: "https://platform-api.company.com"
---
apiVersion: v1
kind: Service
metadata:
  name: platform-ui-service
spec:
  selector:
    app: platform-ui
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP
```

## Performance

### Optimization Strategies

- **Code Splitting** - Route-based and component-based splitting
- **Lazy Loading** - Defer non-critical component loading
- **Memoization** - React.memo and useMemo for expensive operations
- **Virtual Scrolling** - Handle large lists efficiently
- **Bundle Analysis** - Regular bundle size monitoring

```typescript
// Lazy loading example
const Analytics = lazy(() => import('./pages/Analytics'));
const ServiceCatalog = lazy(() => import('./pages/ServiceCatalog'));

// Memoized expensive component
const ResourceChart = React.memo(({ data }: { data: ResourceData }) => {
  const chartData = useMemo(() =>
    processResourceData(data), [data]
  );

  return <Chart data={chartData} />;
});
```

### Bundle Size Targets

- **Initial Bundle**: < 200KB gzipped
- **Route Chunks**: < 100KB each
- **Vendor Chunks**: < 300KB gzipped
- **Assets**: Optimized images and fonts

## Testing

### Unit Tests

```typescript
describe('NamespaceCard', () => {
  it('renders namespace information correctly', () => {
    const namespace = {
      name: 'test-namespace',
      team: 'frontend',
      status: 'active'
    };

    render(<NamespaceCard namespace={namespace} onSelect={jest.fn()} />);

    expect(screen.getByText('test-namespace')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
describe('Namespace Creation Flow', () => {
  it('creates namespace successfully', async () => {
    const user = userEvent.setup();

    render(<ProvisionNamespace />);

    await user.type(screen.getByLabelText('Namespace Name'), 'my-app-dev');
    await user.selectOptions(screen.getByLabelText('Team'), 'frontend');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(screen.getByText('Namespace created successfully')).toBeInTheDocument();
    });
  });
});
```

### E2E Tests

```typescript
test("complete user journey", async ({ page }) => {
  await page.goto("/");

  // Login
  await page.click("[data-testid=login-button]");
  await page.fill("[name=email]", "user@company.com");
  await page.fill("[name=password]", "password");
  await page.click("[type=submit]");

  // Create namespace
  await page.click("[data-testid=provision-namespace]");
  await page.fill("[name=namespaceName]", "test-app-dev");
  await page.selectOption("[name=team]", "frontend");
  await page.click("[type=submit]");

  // Verify creation
  await expect(page.locator("[data-testid=success-message]")).toBeVisible();
});
```

## Troubleshooting

### Common Issues

1. **API Connection Errors**

   ```bash
   # Check API URL configuration
   echo $VITE_API_BASE_URL

   # Test API connectivity
   curl $VITE_API_BASE_URL/health
   ```

2. **Authentication Issues**
   - Verify Azure AD configuration
   - Check redirect URIs in Azure AD app
   - Ensure proper scopes are requested

3. **Build Errors**

   ```bash
   # Clear cache and reinstall
   rm -rf node_modules package-lock.json
   npm install

   # Check TypeScript errors
   npm run typecheck
   ```

4. **Performance Issues**

   ```bash
   # Analyze bundle size
   npm run build
   npx vite-bundle-analyzer dist

   # Profile performance
   npm run dev -- --profile
   ```

### Debug Mode

Enable debug logging:

```bash
NODE_ENV=development VITE_DEBUG=true npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add comprehensive tests
5. Update documentation
6. Submit a pull request

### Component Guidelines

- Use TypeScript for all components
- Follow Material Design principles
- Include comprehensive prop types
- Add Storybook stories for complex components
- Write unit tests for business logic

## License

MIT License - see LICENSE file for details.

## Support

For questions and support:

- Create an issue in the repository
- Contact the platform team at platform-team@company.com
- Check the documentation wiki
