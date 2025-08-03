# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

This repository uses **Devbox** for environment management and **Nushell** for scripting. The development environment includes cloud CLI tools (Azure CLI, AWS CLI, Google Cloud SDK) and Kubernetes tools.

### Setup Commands

```bash
# Initialize development environment
devbox shell

# Setup complete infrastructure (interactive)
nu dot.nu setup

# Destroy infrastructure 
nu dot.nu destroy [provider]
```

## Architecture

This is an **Azure Service Operator (ASO) demonstration repository** focused on managing Azure infrastructure through Kubernetes. The architecture consists of:

### Core Components

1. **ASO Manifests** (`aso-manifests/`, `aso-manifests-dry-run/`, `aso-production-stack/`)
   - Azure Service Operator YAML definitions
   - Resource Groups, Managed Identities, AKS clusters
   - Uses ASO CRDs to provision Azure resources via Kubernetes

2. **Nushell Scripts** (`scripts/`)
   - `common.nu` - Cloud provider credential management and utilities
   - `kubernetes.nu` - Multi-cloud Kubernetes cluster management (AWS EKS, Azure AKS, GCP GKE, Kind)  
   - `crossplane.nu` - Crossplane installation and configuration
   - `atlas.nu` - Atlas Operator for database schema migrations
   - `ingress.nu` - Ingress controller management

3. **Prompt Templates** (`prompts/`)
   - ASO management workflows
   - Resource observation and deletion procedures
   - Database and application management templates

### Key Patterns

- **Multi-cloud support**: AWS, Azure, Google Cloud, Kind clusters
- **Infrastructure as Code**: Kubernetes manifests for Azure resources via ASO
- **Memory-driven workflows**: Uses MCP memory services for storing operational patterns
- **Environment isolation**: Separate namespaces (`a-team`, `b-team`) and validation modes

## Common Commands

### Infrastructure Management
```bash
# Setup environment and choose provider
nu dot.nu setup

# Create specific cloud cluster
nu scripts/kubernetes.nu create kubernetes [aws|azure|google|kind] --name cluster-name

# Apply ASO manifests
kubectl apply -f aso-manifests/

# Check ASO operator status  
kubectl get pods -n azureserviceoperator-system
```

### Development Workflow
```bash
# Load environment variables
source .env

# Access cluster (after setup)
export KUBECONFIG=kubeconfig-dot.yaml
kubectl get nodes

# Monitor Azure resource provisioning
kubectl get resourcegroup,userassignedidentity,managedcluster -n aso
```

### ASO Development

- Always query ASO CRDs with `kubectl explain` before creating manifests
- Use discovery commands: `kubectl get crd | grep azure` and `kubectl api-resources --api-group=resources.azure.com`
- ASO resources require `location`, `azureName`, and proper `owner` references
- Monitor provisioning status with `kubectl get <resource> -o yaml`

## Environment Variables

Set automatically by setup scripts:
- `KUBECONFIG` - Path to cluster kubeconfig
- `PROVIDER` - Selected cloud provider
- Provider-specific credentials (AWS_*, AZURE_*, PROJECT_ID)

## Dependencies

Managed via Devbox (`devbox.json`):
- Azure CLI, AWS CLI, Google Cloud SDK
- kubectl, kind, helm, eksctl
- Nushell for scripting
- PostgreSQL client tools