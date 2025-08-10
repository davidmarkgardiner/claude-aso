# Technology Stack

## Infrastructure & Cloud
- **Azure Service Operator (ASO)**: Primary tool for managing Azure resources via Kubernetes CRDs
- **Crossplane**: Multi-cloud infrastructure provisioning
- **Kubernetes**: Container orchestration (AWS EKS, Azure AKS, GCP GKE, Kind)
- **Flux**: GitOps continuous delivery
- **Istio**: Service mesh for traffic management, security, and observability
- **Cert-Manager**: Automatic TLS certificate management
- **External DNS**: Automatic DNS record management

## Development Environment
- **Devbox**: Reproducible development environments
- **Nushell**: Cross-platform shell and scripting language
- **Cloud CLIs**: Azure CLI, AWS CLI, Google Cloud SDK
- **Kubernetes Tools**: kubectl, helm, kind, eksctl
- **Secrets Management**: Teller for secret injection

## Platform API Backend (Node.js/TypeScript)
- **Runtime**: Node.js 18+
- **Framework**: Express.js with TypeScript
- **Kubernetes Integration**: @kubernetes/client-node
- **Database**: PostgreSQL with pg driver
- **Caching**: Redis
- **Authentication**: JWT with bcryptjs
- **Validation**: Zod and Joi schemas
- **Testing**: Jest with supertest
- **Security**: Helmet, CORS, rate limiting
- **Logging**: Winston
- **Build**: TypeScript compiler, nodemon for development

## Platform UI Frontend (React/TypeScript)
- **Framework**: React 19+ with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS with PostCSS
- **Icons**: Heroicons for React
- **State Management**: TanStack Query for server state
- **HTTP Client**: Axios
- **Routing**: React Router DOM
- **Linting**: ESLint with TypeScript rules
- **Development**: Hot module replacement with Vite

## Infrastructure as Code
- **Manifests**: YAML-based Kubernetes and ASO resource definitions
- **Package Management**: Helm charts for complex applications
- **Templating**: Kustomize for configuration management
- **Secret Management**: Kubernetes secrets with Workload Identity