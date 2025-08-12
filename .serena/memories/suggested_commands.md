# Suggested Commands

## Environment Setup

```bash
# Initialize development environment
devbox shell

# Setup complete infrastructure (interactive provider selection)
nu dot.nu setup

# Load environment variables after setup
source .env

# Destroy infrastructure for specific provider
nu dot.nu destroy [aws|azure|google|kind]
```

## Kubernetes & Infrastructure Management

```bash
# Create cluster for specific provider
nu scripts/kubernetes.nu create kubernetes [aws|azure|google|kind] --name cluster-name

# Access cluster after setup
export KUBECONFIG=kubeconfig-dot.yaml
kubectl get nodes

# Apply ASO manifests
kubectl apply -f aso-production-stack/
kubectl apply -f apps/

# Check ASO operator status
kubectl get pods -n azureserviceoperator-system

# Monitor Azure resource provisioning
kubectl get resourcegroup,userassignedidentity,managedcluster -n aso

# Check Flux GitOps status
flux get kustomizations
flux get sources git
```

## Platform API Development

```bash
# Development server with hot reload
cd platform-api
npm run dev

# Build TypeScript
npm run build

# Production server
npm start

# Testing
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:demo          # Demo/E2E tests

# Linting
npm run lint

# Docker operations
npm run docker:build
npm run docker:run
```

## Platform UI Development

```bash
# Development server with HMR
cd platform-ui
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Linting
npm run lint
```

## ASO Development Workflow

```bash
# Query available ASO CRDs
kubectl get crd | grep azure
kubectl api-resources --api-group=resources.azure.com

# Explain specific ASO resource schema
kubectl explain resourcegroup
kubectl explain managedcluster

# Monitor resource provisioning status
kubectl get <resource-name> -o yaml
kubectl describe <resource-name>
```

## Istio Service Mesh

```bash
# Check Istio installation
kubectl get pods -n istio-system

# Apply Istio configurations
kubectl apply -f istio-apps/

# Check service mesh status
istioctl proxy-status
istioctl analyze
```

## Useful Kubernetes Commands

```bash
# Check cluster connectivity
kubectl cluster-info

# Monitor namespace resources
kubectl get all -n <namespace>

# View logs for troubleshooting
kubectl logs -f deployment/<name> -n <namespace>

# Port forwarding for local development
kubectl port-forward service/<name> <local-port>:<service-port> -n <namespace>
```

## Secret Scanning & Security

```bash
# Scan for secrets in codebase
./scripts/scan-secrets.sh
```
