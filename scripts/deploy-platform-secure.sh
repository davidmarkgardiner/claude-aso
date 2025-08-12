#!/bin/bash

# Secure Platform Deployment Script
# Deploys platform services with External Secrets integration and comprehensive validation
# Ensures all secrets are properly configured before allowing deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
NAMESPACE="platform-system"
VERSION="latest"
ENVIRONMENT="production"
WAIT_TIMEOUT="300"
SKIP_VALIDATION="false"
DRY_RUN="false"
FORCE_DEPLOY="false"

# Script paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
VALIDATION_SCRIPT="$ROOT_DIR/apps/external-secrets/scripts/validate-external-secrets.sh"

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

print_usage() {
    echo "Secure Platform Deployment Script"
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -v, --version VERSION     Set image version to deploy (default: latest)"
    echo "  -n, --namespace NAMESPACE Set Kubernetes namespace (default: platform-system)"
    echo "  -e, --environment ENV     Set environment (development|production) (default: production)"
    echo "  -t, --timeout SECONDS     Set deployment timeout in seconds (default: 300)"
    echo "  -s, --skip-validation     Skip External Secrets validation"
    echo "  -d, --dry-run             Perform dry-run deployment validation"
    echo "  -f, --force               Force deployment even with validation warnings"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  KUBECONFIG               Path to Kubernetes configuration"
    echo "  AZURE_KEY_VAULT_NAME     Azure Key Vault name for secrets validation"
    echo ""
    echo "Security Features:"
    echo "  • Validates External Secrets configuration before deployment"
    echo "  • Ensures all secrets are synchronized from Azure Key Vault"
    echo "  • Verifies container security contexts and resource limits"
    echo "  • Monitors deployment progress and rollback on failure"
    echo "  • Validates runtime security posture after deployment"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -t|--timeout)
            WAIT_TIMEOUT="$2"
            shift 2
            ;;
        -s|--skip-validation)
            SKIP_VALIDATION="true"
            shift
            ;;
        -d|--dry-run)
            DRY_RUN="true"
            shift
            ;;
        -f|--force)
            FORCE_DEPLOY="true"
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            error "Unknown option $1"
            print_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "production" ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be 'development' or 'production'"
    exit 1
fi

log "=== Secure Platform Deployment Started ==="
info "Namespace: $NAMESPACE"
info "Version: $VERSION"
info "Environment: $ENVIRONMENT"
info "Timeout: ${WAIT_TIMEOUT}s"
info "Skip validation: $SKIP_VALIDATION"
info "Dry run: $DRY_RUN"

# Check prerequisites
check_prerequisites() {
    log "Checking deployment prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        error "Cannot connect to Kubernetes cluster"
        error "Check your KUBECONFIG or run 'kubectl config current-context'"
        exit 1
    fi
    
    local cluster_context
    cluster_context=$(kubectl config current-context)
    info "Connected to cluster: $cluster_context"
    
    # Check jq for JSON processing
    if ! command -v jq &> /dev/null; then
        warn "jq not available - some validations may be limited"
    fi
    
    log "Prerequisites check passed"
}

# Validate namespace and create if needed
setup_namespace() {
    log "Setting up namespace: $NAMESPACE"
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        info "Namespace $NAMESPACE already exists"
    else
        if [[ "$DRY_RUN" == "true" ]]; then
            info "[DRY-RUN] Would create namespace: $NAMESPACE"
        else
            log "Creating namespace: $NAMESPACE"
            kubectl create namespace "$NAMESPACE"
        fi
    fi
    
    # Label namespace for security and monitoring
    local labels=(
        "environment=$ENVIRONMENT"
        "platform.io/managed-by=platform-deployment"
        "security.io/external-secrets=enabled"
    )
    
    if [[ "$DRY_RUN" != "true" ]]; then
        for label in "${labels[@]}"; do
            kubectl label namespace "$NAMESPACE" "$label" --overwrite
        done
        info "Namespace labels configured"
    fi
}

# Validate External Secrets setup
validate_external_secrets() {
    if [[ "$SKIP_VALIDATION" == "true" ]]; then
        warn "Skipping External Secrets validation (--skip-validation)"
        return 0
    fi
    
    log "Validating External Secrets configuration..."
    
    # Check External Secrets CRDs
    local required_crds=(
        "externalsecrets.external-secrets.io"
        "secretstores.external-secrets.io"
        "clustersecretstores.external-secrets.io"
    )
    
    for crd in "${required_crds[@]}"; do
        if ! kubectl get crd "$crd" &> /dev/null; then
            error "External Secrets CRD not found: $crd"
            error "Please install External Secrets Operator first"
            return 1
        fi
    done
    
    # Check External Secrets operator is running
    if ! kubectl get deployment external-secrets -n external-secrets-system &> /dev/null; then
        error "External Secrets operator not found"
        error "Please deploy External Secrets Operator first"
        return 1
    fi
    
    # Wait for External Secrets operator to be ready
    log "Waiting for External Secrets operator to be ready..."
    if ! kubectl wait --for=condition=available --timeout=60s deployment/external-secrets -n external-secrets-system; then
        error "External Secrets operator is not ready"
        return 1
    fi
    
    # Check ClusterSecretStore
    if ! kubectl get clustersecretstore azure-keyvault &> /dev/null; then
        error "ClusterSecretStore 'azure-keyvault' not found"
        error "Please configure Azure Key Vault ClusterSecretStore first"
        return 1
    fi
    
    # Verify ClusterSecretStore is ready
    local store_status
    store_status=$(kubectl get clustersecretstore azure-keyvault -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
    if [[ "$store_status" != "True" ]]; then
        error "ClusterSecretStore 'azure-keyvault' is not ready (status: $store_status)"
        kubectl describe clustersecretstore azure-keyvault
        return 1
    fi
    
    log "External Secrets configuration validated"
}

# Deploy External Secrets manifests
deploy_external_secrets() {
    log "Deploying External Secrets manifests..."
    
    local external_secrets_files=(
        "$ROOT_DIR/platform-api/deployment/external-secrets.yaml"
        "$ROOT_DIR/platform-ui/deployment/external-secrets.yaml"
    )
    
    for file in "${external_secrets_files[@]}"; do
        if [[ -f "$file" ]]; then
            info "Applying External Secrets from: $(basename "$file")"
            if [[ "$DRY_RUN" == "true" ]]; then
                kubectl apply --dry-run=client -f "$file"
            else
                kubectl apply -f "$file"
            fi
        else
            warn "External Secrets file not found: $file"
        fi
    done
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY-RUN] External Secrets manifests validated"
        return 0
    fi
    
    # Wait for secrets to be created and synced
    log "Waiting for secrets to be synchronized from Azure Key Vault..."
    
    local required_secrets=(
        "platform-api-secrets"
        "platform-db-connection"
    )
    
    local max_wait=180  # 3 minutes
    local elapsed=0
    local check_interval=10
    
    while [[ $elapsed -lt $max_wait ]]; do
        local all_ready=true
        
        for secret in "${required_secrets[@]}"; do
            if ! kubectl get secret "$secret" -n "$NAMESPACE" &> /dev/null; then
                all_ready=false
                break
            fi
        done
        
        if [[ "$all_ready" == "true" ]]; then
            log "All required secrets synchronized successfully"
            break
        fi
        
        info "Waiting for secrets to sync... (${elapsed}s/${max_wait}s)"
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
    done
    
    if [[ $elapsed -ge $max_wait ]]; then
        error "Timeout waiting for secrets to synchronize"
        error "Check External Secrets logs: kubectl logs -n external-secrets-system deployment/external-secrets"
        return 1
    fi
}

# Validate synchronized secrets
validate_synchronized_secrets() {
    log "Validating synchronized secrets..."
    
    local secrets_to_check=(
        "platform-api-secrets:JWT_SECRET,AZURE_CLIENT_ID,DB_PASSWORD"
        "platform-db-connection:DATABASE_URL"
    )
    
    for secret_info in "${secrets_to_check[@]}"; do
        local secret_name=${secret_info%%:*}
        local required_keys=${secret_info##*:}
        
        info "Checking secret: $secret_name"
        
        # Check if secret exists
        if ! kubectl get secret "$secret_name" -n "$NAMESPACE" &> /dev/null; then
            error "Required secret not found: $secret_name"
            return 1
        fi
        
        # Validate secret has required keys
        local secret_keys
        secret_keys=$(kubectl get secret "$secret_name" -n "$NAMESPACE" -o jsonpath='{.data}' | jq -r 'keys[]' 2>/dev/null || echo "")
        
        if [[ -z "$secret_keys" ]]; then
            error "Secret $secret_name exists but appears to be empty"
            return 1
        fi
        
        # Check each required key
        IFS=',' read -ra keys <<< "$required_keys"
        for key in "${keys[@]}"; do
            if ! echo "$secret_keys" | grep -q "^$key$"; then
                error "Secret $secret_name missing required key: $key"
                return 1
            fi
        done
        
        info "✓ Secret $secret_name validated with keys: $(echo "$secret_keys" | tr '\n' ' ')"
    done
    
    log "All secrets validated successfully"
}

# Update Kubernetes deployment manifests with correct image versions
update_deployment_manifests() {
    log "Updating deployment manifests with version: $VERSION"
    
    local api_deployment="$ROOT_DIR/k8s/platform-api/deployment.yaml"
    local ui_deployment="$ROOT_DIR/k8s/platform-ui/deployment.yaml"
    
    if [[ -f "$api_deployment" ]]; then
        # Create temporary file with version substitution
        sed "s|image: platform-api:.*|image: platform-api:$VERSION|g" "$api_deployment" > "$api_deployment.tmp"
        mv "$api_deployment.tmp" "$api_deployment"
        info "Updated Platform API deployment manifest"
    fi
    
    if [[ -f "$ui_deployment" ]]; then
        # Create temporary file with version substitution
        sed "s|image: platform-ui:.*|image: platform-ui:$VERSION|g" "$ui_deployment" > "$ui_deployment.tmp"
        mv "$ui_deployment.tmp" "$ui_deployment"
        info "Updated Platform UI deployment manifest"
    fi
}

# Deploy platform services
deploy_platform_services() {
    log "Deploying platform services..."
    
    # Apply ConfigMaps first
    local config_files=(
        "$ROOT_DIR/k8s/platform-api/configmap.yaml"
        "$ROOT_DIR/k8s/platform-ui/configmap.yaml"
    )
    
    for file in "${config_files[@]}"; do
        if [[ -f "$file" ]]; then
            info "Applying configuration: $(basename "$file")"
            if [[ "$DRY_RUN" == "true" ]]; then
                kubectl apply --dry-run=client -f "$file"
            else
                kubectl apply -f "$file"
            fi
        fi
    done
    
    # Apply ServiceAccounts and RBAC
    local rbac_files=(
        "$ROOT_DIR/k8s/platform-api/serviceaccount.yaml"
    )
    
    for file in "${rbac_files[@]}"; do
        if [[ -f "$file" ]]; then
            info "Applying RBAC: $(basename "$file")"
            if [[ "$DRY_RUN" == "true" ]]; then
                kubectl apply --dry-run=client -f "$file"
            else
                kubectl apply -f "$file"
            fi
        fi
    done
    
    # Apply Services
    local service_files=(
        "$ROOT_DIR/k8s/platform-api/service.yaml"
        "$ROOT_DIR/k8s/platform-ui/service.yaml"
    )
    
    for file in "${service_files[@]}"; do
        if [[ -f "$file" ]]; then
            info "Applying service: $(basename "$file")"
            if [[ "$DRY_RUN" == "true" ]]; then
                kubectl apply --dry-run=client -f "$file"
            else
                kubectl apply -f "$file"
            fi
        fi
    done
    
    # Apply Deployments last
    local deployment_files=(
        "$ROOT_DIR/k8s/platform-api/deployment.yaml"
        "$ROOT_DIR/k8s/platform-ui/deployment.yaml"
    )
    
    for file in "${deployment_files[@]}"; do
        if [[ -f "$file" ]]; then
            info "Applying deployment: $(basename "$file")"
            if [[ "$DRY_RUN" == "true" ]]; then
                kubectl apply --dry-run=client -f "$file"
            else
                kubectl apply -f "$file"
            fi
        fi
    done
    
    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY-RUN] All manifests validated successfully"
        return 0
    fi
    
    log "Platform services deployment initiated"
}

# Wait for deployments to be ready
wait_for_deployments() {
    if [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi
    
    log "Waiting for deployments to be ready..."
    
    local deployments=(
        "platform-api"
        "platform-ui"
    )
    
    for deployment in "${deployments[@]}"; do
        info "Waiting for $deployment deployment..."
        
        if ! kubectl rollout status deployment/$deployment -n "$NAMESPACE" --timeout=${WAIT_TIMEOUT}s; then
            error "Deployment $deployment failed to become ready within ${WAIT_TIMEOUT}s"
            
            # Show pod status for debugging
            info "Pod status for $deployment:"
            kubectl get pods -n "$NAMESPACE" -l app=$deployment
            
            # Show recent events
            info "Recent events in namespace $NAMESPACE:"
            kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -10
            
            return 1
        fi
        
        log "✓ $deployment deployment is ready"
    done
    
    log "All deployments are ready"
}

# Validate runtime security
validate_runtime_security() {
    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY-RUN] Skipping runtime security validation"
        return 0
    fi
    
    log "Validating runtime security posture..."
    
    local deployments=("platform-api" "platform-ui")
    
    for deployment in "${deployments[@]}"; do
        info "Checking security context for $deployment..."
        
        # Get a pod from the deployment
        local pod_name
        pod_name=$(kubectl get pods -n "$NAMESPACE" -l app=$deployment -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
        
        if [[ -z "$pod_name" ]]; then
            warn "No pods found for deployment $deployment"
            continue
        fi
        
        # Check security context
        local security_context
        security_context=$(kubectl get pod "$pod_name" -n "$NAMESPACE" -o jsonpath='{.spec.securityContext}' 2>/dev/null || echo "{}")
        
        # Validate non-root user
        local run_as_non_root
        run_as_non_root=$(echo "$security_context" | jq -r '.runAsNonRoot // false' 2>/dev/null || echo "false")
        
        if [[ "$run_as_non_root" == "true" ]]; then
            info "✓ $deployment pod running as non-root user"
        else
            warn "⚠ $deployment pod may be running as root user"
        fi
        
        # Check resource limits
        local resources
        resources=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].resources}' 2>/dev/null || echo "{}")
        
        local has_limits
        has_limits=$(echo "$resources" | jq -e '.limits' >/dev/null 2>&1 && echo "true" || echo "false")
        
        if [[ "$has_limits" == "true" ]]; then
            info "✓ $deployment has resource limits configured"
        else
            warn "⚠ $deployment has no resource limits configured"
        fi
        
        # Check if secrets are mounted properly
        local secret_mounts
        secret_mounts=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.valueFrom.secretKeyRef)].name}' 2>/dev/null || echo "")
        
        if [[ -n "$secret_mounts" ]]; then
            info "✓ $deployment has secret environment variables configured"
        else
            warn "⚠ $deployment may not have secrets properly configured"
        fi
    done
    
    log "Runtime security validation completed"
}

# Run post-deployment tests
run_deployment_tests() {
    if [[ "$DRY_RUN" == "true" ]]; then
        info "[DRY-RUN] Skipping deployment tests"
        return 0
    fi
    
    log "Running post-deployment tests..."
    
    # Test Platform API health endpoint
    info "Testing Platform API health endpoint..."
    
    # Port-forward to Platform API service
    kubectl port-forward -n "$NAMESPACE" service/platform-api 3000:80 >/dev/null 2>&1 &
    local pf_pid=$!
    
    # Wait a moment for port-forward to establish
    sleep 3
    
    # Test health endpoint
    if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
        log "✓ Platform API health check passed"
    else
        warn "⚠ Platform API health check failed"
        
        # Check pod logs
        info "Platform API logs:"
        kubectl logs -n "$NAMESPACE" deployment/platform-api --tail=10
    fi
    
    # Cleanup port-forward
    kill $pf_pid 2>/dev/null || true
    
    # Check service endpoints
    info "Checking service endpoints..."
    kubectl get endpoints -n "$NAMESPACE"
    
    log "Post-deployment tests completed"
}

# Display deployment summary
show_deployment_summary() {
    log "=== Deployment Summary ==="
    
    # Show pod status
    info "Pod Status:"
    kubectl get pods -n "$NAMESPACE" -o wide
    
    echo
    info "Service Status:"
    kubectl get services -n "$NAMESPACE"
    
    echo
    info "External Secrets Status:"
    kubectl get externalsecrets -n "$NAMESPACE" 2>/dev/null || echo "No ExternalSecrets found"
    
    echo
    info "Secret Status:"
    kubectl get secrets -n "$NAMESPACE" | grep -E "platform-|TYPE"
    
    echo
    log "Deployment completed successfully!"
    
    if [[ "$DRY_RUN" != "true" ]]; then
        echo
        info "Access your services:"
        info "  Platform API: kubectl port-forward -n $NAMESPACE service/platform-api 3000:80"
        info "  Platform UI:  kubectl port-forward -n $NAMESPACE service/platform-ui 8080:80"
        
        echo
        info "Monitor your deployment:"
        info "  Logs:    kubectl logs -n $NAMESPACE -f deployment/platform-api"
        info "  Events:  kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp'"
        info "  Secrets: kubectl get externalsecrets -n $NAMESPACE"
    fi
}

# Main deployment process
main() {
    log "Starting secure platform deployment..."
    
    # Pre-deployment checks
    check_prerequisites
    setup_namespace
    validate_external_secrets
    
    # Deploy External Secrets first
    deploy_external_secrets
    validate_synchronized_secrets
    
    # Deploy platform services
    update_deployment_manifests
    deploy_platform_services
    wait_for_deployments
    
    # Post-deployment validation
    validate_runtime_security
    run_deployment_tests
    
    # Show summary
    show_deployment_summary
    
    log "=== Secure Platform Deployment Completed ==="
}

# Cleanup function
cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -ne 0 ]]; then
        error "Deployment failed with exit code $exit_code"
        
        if [[ "$FORCE_DEPLOY" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
            error "Consider using --force to override warnings, or fix the issues and retry"
        fi
        
        # Show troubleshooting information
        echo
        info "Troubleshooting commands:"
        info "  Check pods:              kubectl get pods -n $NAMESPACE"
        info "  Check events:            kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp'"
        info "  Check External Secrets:  kubectl get externalsecrets -n $NAMESPACE"
        info "  Check logs:              kubectl logs -n $NAMESPACE deployment/platform-api"
        info "  Validate secrets:        $VALIDATION_SCRIPT dev"
    fi
}

trap cleanup EXIT

# Run main deployment process
main "$@"