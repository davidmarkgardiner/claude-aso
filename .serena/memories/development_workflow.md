# Development Workflow

## Task Completion Checklist

### After Code Changes

1. **Run tests** to ensure functionality
   - Platform API: `npm test` in `platform-api/`
   - Platform UI: `npm run lint` in `platform-ui/`
2. **Run linting** to ensure code quality
   - Platform API: `npm run lint` in `platform-api/`
   - Platform UI: `npm run lint` in `platform-ui/`
3. **Validate Kubernetes manifests** if infrastructure changed
   - `kubectl apply --dry-run=client -f <manifest-file>`
4. **Check ASO resource status** if Azure resources involved
   - `kubectl get <resource-type> -o yaml`

### Infrastructure Changes

1. **Test on Kind cluster first** before cloud deployment
2. **Validate with dry-run** before applying to production
3. **Check Flux reconciliation** after GitOps changes
   - `flux get kustomizations`
4. **Monitor resource provisioning** for ASO resources
   - `kubectl describe <resource-name>`

## Code Conventions

### Nushell Scripts

- Use descriptive function names with namespace prefixes (`main setup`, `main get provider`)
- Include comprehensive help documentation
- Handle errors gracefully with proper cleanup
- Use consistent parameter naming and types

### TypeScript/Node.js (Platform API)

- Follow TypeScript strict mode
- Use ESLint configuration for consistency
- Implement proper error handling and logging
- Use dependency injection patterns
- Write comprehensive tests (unit, integration, demo)

### React/TypeScript (Platform UI)

- Use functional components with hooks
- Follow ESLint and TypeScript strict rules
- Use TailwindCSS utility classes for styling
- Implement proper error boundaries
- Use TanStack Query for server state management

### Kubernetes Manifests

- Always include proper labels and annotations
- Use consistent naming conventions
- Include resource limits and requests
- Follow security best practices (non-root users, read-only filesystems)
- Use Kustomize for configuration management

### ASO Resources

- Always specify `location`, `azureName`, and `owner` references
- Use consistent naming with environment prefixes
- Include proper dependency chains through owner references
- Monitor provisioning status after applying

## Security Practices

- Never commit secrets or credentials
- Use Workload Identity for Azure integration
- Implement proper RBAC policies
- Scan for secrets using `./scripts/scan-secrets.sh`
- Use network policies for traffic segmentation
- Enable mTLS in Istio service mesh

## Testing Strategy

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and database interactions
- **Demo Tests**: End-to-end workflow validation
- **Infrastructure Tests**: Validate resource provisioning
- **Security Tests**: Validate RBAC and network policies
