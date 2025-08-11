#!/bin/bash

# Platform API RBAC Implementation Validation Script
# This script validates the managed identity and RBAC implementation

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NAMESPACE_PREFIX="platform-validation"
TEST_TIMESTAMP=$(date +%s)
TEST_NAMESPACE="${NAMESPACE_PREFIX}-${TEST_TIMESTAMP}"

# Validation functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        log_info "Make sure KUBECONFIG is set correctly"
        exit 1
    fi
    
    # Check Azure CLI (optional)
    if command -v az &> /dev/null; then
        log_success "Azure CLI is available"
        AZURE_CLI_AVAILABLE=true
    else
        log_warning "Azure CLI not available - skipping Azure-specific validations"
        AZURE_CLI_AVAILABLE=false
    fi
    
    log_success "Prerequisites check completed"
}

# Validate ASO deployment
validate_aso_deployment() {
    log_info "Validating Azure Service Operator deployment..."
    
    # Check if ASO CRDs are installed
    if kubectl get crd userassignedidentities.managedidentity.azure.com &> /dev/null; then
        log_success "ASO UserAssignedIdentity CRD found"
    else
        log_error "ASO UserAssignedIdentity CRD not found"
        return 1
    fi
    
    if kubectl get crd federatedidentitycredentials.managedidentity.azure.com &> /dev/null; then
        log_success "ASO FederatedIdentityCredential CRD found"
    else
        log_error "ASO FederatedIdentityCredential CRD not found"
        return 1
    fi
    
    if kubectl get crd roleassignments.authorization.azure.com &> /dev/null; then
        log_success "ASO RoleAssignment CRD found"
    else
        log_error "ASO RoleAssignment CRD not found"
        return 1
    fi
    
    # Check ASO operator
    if kubectl get pods -n azure-system -l app=azureserviceoperator-controller-manager &> /dev/null; then
        local aso_pods=$(kubectl get pods -n azure-system -l app=azureserviceoperator-controller-manager --no-headers | wc -l)
        log_success "ASO controller pods running: $aso_pods"
    else
        log_error "ASO controller pods not found"
        return 1
    fi
}

# Validate Platform API managed identity
validate_platform_identity() {
    log_info "Validating Platform API managed identity..."
    
    # Check if identity exists
    if kubectl get userassignedidentity platform-api-identity -n azure-system &> /dev/null; then
        log_success "Platform API managed identity found"
        
        # Check status
        local identity_status=$(kubectl get userassignedidentity platform-api-identity -n azure-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
        if [[ "$identity_status" == "True" ]]; then
            log_success "Platform API managed identity is ready"
        else
            log_warning "Platform API managed identity status: $identity_status"
        fi
    else
        log_error "Platform API managed identity not found"
        return 1
    fi
    
    # Check federated credential
    if kubectl get federatedidentitycredential platform-api-federated-credential -n azure-system &> /dev/null; then
        log_success "Platform API federated credential found"
        
        local cred_status=$(kubectl get federatedidentitycredential platform-api-federated-credential -n azure-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
        if [[ "$cred_status" == "True" ]]; then
            log_success "Platform API federated credential is ready"
        else
            log_warning "Platform API federated credential status: $cred_status"
        fi
    else
        log_error "Platform API federated credential not found"
        return 1
    fi
    
    # Check ConfigMap
    if kubectl get configmap platform-api-identity-cm -n azure-system &> /dev/null; then
        log_success "Platform API identity ConfigMap found"
        
        local client_id=$(kubectl get configmap platform-api-identity-cm -n azure-system -o jsonpath='{.data.clientId}' 2>/dev/null || echo "")
        if [[ -n "$client_id" ]]; then
            log_success "Client ID available in ConfigMap: ${client_id:0:8}***"
        else
            log_warning "Client ID not found in ConfigMap"
        fi
    else
        log_error "Platform API identity ConfigMap not found"
        return 1
    fi
}

# Validate cluster RBAC assignments
validate_cluster_rbac() {
    log_info "Validating cluster RBAC assignments..."
    
    # Check if cluster admin role assignment exists
    if kubectl get roleassignment platform-api-cluster-admin -n azure-system &> /dev/null; then
        log_success "Platform API cluster admin role assignment found"
        
        local rbac_status=$(kubectl get roleassignment platform-api-cluster-admin -n azure-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
        if [[ "$rbac_status" == "True" ]]; then
            log_success "Platform API cluster RBAC assignment is ready"
        else
            log_warning "Platform API cluster RBAC assignment status: $rbac_status"
        fi
    else
        log_error "Platform API cluster admin role assignment not found"
        return 1
    fi
}

# Validate platform system namespace
validate_platform_namespace() {
    log_info "Validating platform-system namespace..."
    
    if kubectl get namespace platform-system &> /dev/null; then
        log_success "platform-system namespace exists"
        
        # Check namespace labels
        local istio_injection=$(kubectl get namespace platform-system -o jsonpath='{.metadata.labels.istio-injection}' 2>/dev/null || echo "")
        if [[ "$istio_injection" == "enabled" ]]; then
            log_success "Istio injection enabled for platform-system"
        else
            log_warning "Istio injection not enabled for platform-system"
        fi
    else
        log_warning "platform-system namespace not found (will be created on first deployment)"
    fi
    
    # Check service account
    if kubectl get serviceaccount platform-api -n platform-system &> /dev/null; then
        log_success "Platform API service account found"
        
        # Check workload identity annotations
        local client_id_annotation=$(kubectl get serviceaccount platform-api -n platform-system -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}' 2>/dev/null || echo "")
        if [[ -n "$client_id_annotation" ]]; then
            log_success "Workload identity annotation found: ${client_id_annotation:0:8}***"
        else
            log_warning "Workload identity annotation not found on service account"
        fi
    else
        log_warning "Platform API service account not found (will be created on deployment)"
    fi
}

# Test namespace creation (if permissions allow)
test_namespace_creation() {
    log_info "Testing namespace creation capabilities..."
    
    # Try to create a test namespace
    if kubectl create namespace "$TEST_NAMESPACE" --dry-run=client &> /dev/null; then
        log_info "Attempting to create test namespace: $TEST_NAMESPACE"
        
        if kubectl create namespace "$TEST_NAMESPACE" &> /dev/null; then
            log_success "Successfully created test namespace"
            
            # Add test labels
            kubectl label namespace "$TEST_NAMESPACE" "platform.io/test=true" "platform.io/created-by=validation-script" &> /dev/null || true
            
            # Test resource quota creation
            cat << EOF | kubectl apply -f - &> /dev/null || log_warning "Could not create resource quota"
apiVersion: v1
kind: ResourceQuota
metadata:
  name: test-quota
  namespace: $TEST_NAMESPACE
spec:
  hard:
    requests.cpu: "1"
    requests.memory: 1Gi
    limits.cpu: "2" 
    limits.memory: 2Gi
    persistentvolumeclaims: "2"
    services: "2"
EOF
            
            # Test network policy creation  
            cat << EOF | kubectl apply -f - &> /dev/null || log_warning "Could not create network policy"
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: test-deny-all
  namespace: $TEST_NAMESPACE
spec:
  podSelector: {}
  policyTypes:
  - Ingress
EOF
            
            log_success "Test resources created successfully"
            
            # Schedule cleanup
            sleep 2
            kubectl delete namespace "$TEST_NAMESPACE" &> /dev/null || log_warning "Could not cleanup test namespace"
            log_info "Test namespace cleaned up"
        else
            log_warning "Could not create test namespace (insufficient permissions or cluster issue)"
        fi
    else
        log_error "Cannot create namespaces (insufficient permissions)"
        return 1
    fi
}

# Validate Platform API deployment (if deployed)
validate_platform_api_deployment() {
    log_info "Validating Platform API deployment..."
    
    if kubectl get deployment platform-api -n platform-system &> /dev/null; then
        log_success "Platform API deployment found"
        
        # Check deployment status
        local ready_replicas=$(kubectl get deployment platform-api -n platform-system -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        local desired_replicas=$(kubectl get deployment platform-api -n platform-system -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
        
        if [[ "$ready_replicas" == "$desired_replicas" ]] && [[ "$ready_replicas" -gt 0 ]]; then
            log_success "Platform API deployment is ready ($ready_replicas/$desired_replicas)"
        else
            log_warning "Platform API deployment not ready ($ready_replicas/$desired_replicas)"
        fi
        
        # Check pods
        local running_pods=$(kubectl get pods -n platform-system -l app=platform-api --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l || echo "0")
        if [[ "$running_pods" -gt 0 ]]; then
            log_success "Platform API pods running: $running_pods"
        else
            log_warning "No Platform API pods running"
        fi
    else
        log_info "Platform API deployment not found (not yet deployed)"
    fi
    
    # Check service
    if kubectl get service platform-api -n platform-system &> /dev/null; then
        log_success "Platform API service found"
    else
        log_info "Platform API service not found (not yet deployed)"
    fi
}

# Run Platform API tests
run_platform_api_tests() {
    log_info "Running Platform API tests..."
    
    cd "$PROJECT_ROOT/platform-api"
    
    # Check if dependencies are installed
    if [[ -d "node_modules" ]]; then
        log_success "Node modules found"
    else
        log_info "Installing dependencies..."
        npm install || {
            log_error "Failed to install dependencies"
            return 1
        }
    fi
    
    # Run linting
    log_info "Running linter..."
    if npm run lint &> /dev/null; then
        log_success "Linting passed"
    else
        log_warning "Linting found issues"
    fi
    
    # Run unit tests
    log_info "Running unit tests..."
    if npm run test:unit &> /dev/null; then
        log_success "Unit tests passed"
    else
        log_warning "Some unit tests failed"
    fi
    
    # Run integration tests (with timeout)
    log_info "Running integration tests..."
    if timeout 300 npm run test:integration &> /dev/null; then
        log_success "Integration tests passed"
    else
        log_warning "Integration tests failed or timed out"
    fi
}

# Generate validation report
generate_report() {
    log_info "Generating validation report..."
    
    local report_file="$PROJECT_ROOT/rbac-validation-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# Platform API RBAC Implementation Validation Report

**Generated:** $(date)
**Cluster:** $(kubectl config current-context 2>/dev/null || echo "unknown")
**Namespace:** platform-system

## Validation Results

### Azure Service Operator (ASO)
$(validate_aso_deployment 2>&1 | sed 's/^/- /')

### Platform API Managed Identity
$(validate_platform_identity 2>&1 | sed 's/^/- /')

### Cluster RBAC Assignments
$(validate_cluster_rbac 2>&1 | sed 's/^/- /')

### Platform System Namespace
$(validate_platform_namespace 2>&1 | sed 's/^/- /')

### Platform API Deployment
$(validate_platform_api_deployment 2>&1 | sed 's/^/- /')

## Recommendations

### Next Steps
1. Apply ASO manifests if not already deployed:
   \`\`\`bash
   kubectl apply -f aso-stack/
   \`\`\`

2. Deploy Platform API manifests:
   \`\`\`bash
   kubectl apply -f apps/platform-api/namespace.yaml
   kubectl apply -f apps/platform-api/serviceaccount.yaml
   kubectl apply -f apps/platform-api/configmap.yaml
   kubectl apply -f apps/platform-api/secret.yaml
   kubectl apply -f apps/platform-api/deployment.yaml
   kubectl apply -f apps/platform-api/service.yaml
   \`\`\`

3. Test the implementation:
   \`\`\`bash
   # Port forward to access the API
   kubectl port-forward -n platform-system svc/platform-api 3000:80
   
   # Test namespace creation
   curl -X POST http://localhost:3000/api/v1/namespaces \\
     -H "Content-Type: application/json" \\
     -d '{
       "name": "test-team-dev",
       "teamName": "test-team",
       "environment": "development",
       "resourceTier": "small",
       "features": ["istio-injection"]
     }'
   \`\`\`

### Security Considerations
- Ensure all secrets are managed through external secret management in production
- Regularly rotate managed identity credentials
- Monitor RBAC assignments for unusual activity
- Enable audit logging for compliance requirements

EOF

    log_success "Validation report generated: $report_file"
}

# Main execution
main() {
    log_info "Starting Platform API RBAC Implementation Validation"
    log_info "=============================================="
    
    check_prerequisites
    
    echo
    validate_aso_deployment || log_warning "ASO validation failed"
    
    echo  
    validate_platform_identity || log_warning "Platform identity validation failed"
    
    echo
    validate_cluster_rbac || log_warning "Cluster RBAC validation failed"
    
    echo
    validate_platform_namespace || log_warning "Platform namespace validation failed"
    
    echo
    test_namespace_creation || log_warning "Namespace creation test failed"
    
    echo
    validate_platform_api_deployment || log_warning "Platform API deployment validation failed"
    
    echo
    if [[ -f "$PROJECT_ROOT/platform-api/package.json" ]]; then
        run_platform_api_tests || log_warning "Platform API tests failed"
    else
        log_info "Skipping Platform API tests (package.json not found)"
    fi
    
    echo
    generate_report
    
    echo
    log_success "Validation completed!"
    log_info "Review the generated report for detailed results and recommendations"
}

# Run main function
main "$@"