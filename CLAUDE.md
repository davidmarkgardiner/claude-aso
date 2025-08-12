# CLAUDE.md

## Architecture

This is an **Azure Service Operator (ASO) demonstration repository** focused on managing Azure infrastructure through Kubernetes and platform engineering patterns. The architecture consists of:

### Core Components

1. **Specialized Agents** (`.claude/agents/`)
   - Pre-configured Claude Code agents for specific tasks
   - `aso-deployment.json` - Azure Service Operator deployment automation
   - `istio-deployment.json` - Istio service mesh deployment and configuration
   - `build-aks` - AKS cluster building and management
   - `sre-debugger.json` - Site reliability engineering and debugging
   - `chaos-engineer.json` - Chaos engineering and resilience testing
   - Additional agents in specialized categories (design, engineering, testing, etc.)

2. **ASO Manifests** (`aso-stack/`)
   - Azure Service Operator YAML definitions
   - Resource Groups, Managed Identities, AKS clusters
   - Uses ASO CRDs to provision Azure resources via Kubernetes
   - `.claude/agents/build-aks/aks/aso-deployment-agent.md` - Azure Service Operator deployment agent

3. **APP Manifests** (`apps/`)
   - apps deployed to aks cluster using gitops/ fluxconfiguration
   - currentl deploys external-dns and cert-manager
   - `.claude/agents/build-aks/apps/external-dns-specialist.md` - External DNS configuration agent
   - `.claude/agents/build-aks/apps/cert-manager-specialist.md` - Cert-Manager deployment agent

4. **Service Mesh Integration** (`istio-apps/`)
   - Istio configurations for traffic management and security
   - mTLS enforcement and network policies
   - Observability and monitoring integration
   - `.claude/agents/build-aks/istio/istio-deployment-specialist.md` - Istio deployment agent
   - `.claude/agents/build-aks/istio/istio-test-specialist.md` - Istio testing agent
   - `.claude/agents/build-aks/istio/istio-documentation-agent.md` - Istio documentation agent

5. **Platform Engineering Stack**
   - `platform-api/` - Node.js/TypeScript backend for namespace-as-a-service
   - `platform-ui/` - React/TypeScript frontend with TailwindCSS
   - `platform-rbac/` - Role-based access control configurations
   - Self-service multi-tenancy with Kubernetes integration
   - `.claude/agents/build-aks/backstage/platform-api-specialist.md` - Platform API development agent
   - `.claude/agents/build-aks/backstage/platform-ui-specialist.md` - Platform UI development agent
   - `.claude/agents/build-aks/backstage/platform-rbac-specialist.md` - Platform RBAC configuration agent

### Key Patterns

- **Infrastructure as Code**: Kubernetes manifests for Azure resources via ASO, Backstage
- **Memory-driven workflows**: Uses MCP memory services for storing operational patterns
- **Agent-driven automation**: Specialized Claude Code agents for complex operational tasks

## Common Commands

### Platform API Development

```bash
# Development server (in platform-api/)
npm run dev

# Build and test
npm run build
npm test
npm run lint

# Run specific tests
npm run test:unit
npm run test:integration
npm run test:demo
```

### Platform UI Development

```bash
# Development server (in platform-ui/)
npm run dev

# Build and lint
npm run build
npm run lint
```

### ASO Development

- Always query ASO CRDs with `kubectl explain` before creating manifests
- Use discovery commands: `kubectl get crd | grep azure` and `kubectl api-resources --api-group=resources.azure.com`
- ASO resources require `location`, `azureName`, and proper `owner` references
- Monitor provisioning status with `kubectl get <resource> -o yaml`

## Environment Variables

Set automatically by setup scripts:

- `KUBECONFIG` - Path to cluster kubeconfig
- `PROVIDER` - Azure

## Development Practices

### Feature Development Workflow

- **Always create a new branch** for each feature: `git checkout -b feature/feature-name`
- **Create a GitHub issue** at https://github.com/davidmarkgardiner/claude-aso for every feature
- **Link the branch to the issue** in the issue description or PR
- **Hand off issues to specialized agents** using the appropriate agent from `.claude/agents/build-aks/`
- **Use descriptive branch names** that reflect the feature being developed

### Code Quality

- Run `npm run lint` in platform-api/ and platform-ui/ before committing
- Execute `npm test` in platform-api/ to ensure all tests pass
- Use `./scripts/scan-secrets.sh` to scan for secrets before commits

### Platform Backstage Testing Strategy

- **Unit tests**: `npm run test:unit` - Test individual functions
- **Integration tests**: `npm run test:integration` - Test API endpoints
- **Demo tests**: `npm run test:demo` - End-to-end workflows

### Infrastructure Validation

- Test on Kind cluster before cloud deployment: `nu scripts/kubernetes.nu create kubernetes kind`
- Use dry-run validation: `kubectl apply --dry-run=client -f <manifest>`
- Monitor resource status: `kubectl get <resource> -o yaml`

## Git & Version Control

- Add and commit automatically whenever an entire task is finished
- Use descriptive commit messages that capture the full scope of changes

## EXTREMELY IMPORTANT: Code Quality Checks

**ALWAYS run the following commands before completing any task:**

Automatically use the IDE's built-in diagnostics tool to check for linting and type errors:

- Run `mcp__ide__getDiagnostics` to check all files for diagnostics
- Fix any linting or type errors before considering the task complete
- Do this for any file you create or modify

This is a CRITICAL step that must NEVER be skipped when working on any code-related task.
