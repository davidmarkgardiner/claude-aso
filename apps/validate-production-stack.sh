#!/bin/bash
set -euo pipefail

# Production Stack Validation Script for AKS
# Validates all manifests in the /apps directory for production readiness

echo "🔍 Platform Engineering Stack - Production Validation"
echo "=================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATION_ERRORS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((VALIDATION_ERRORS++))
}

validate_manifest_syntax() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component manifest syntax..."
    
    if [[ ! -d "$dir" ]]; then
        log_error "$component directory not found: $dir"
        return 1
    fi
    
    # Validate YAML syntax
    find "$dir" -name "*.yaml" -o -name "*.yml" | while read -r file; do
        if ! yaml_content=$(yq eval '.' "$file" 2>/dev/null); then
            log_error "Invalid YAML syntax in $file"
            return 1
        fi
    done
    
    # Check for kustomization.yaml
    if [[ ! -f "$dir/kustomization.yaml" ]]; then
        log_warning "$component missing kustomization.yaml (may not be GitOps compatible)"
    else
        log_success "$component has valid kustomization.yaml"
    fi
    
    log_success "$component manifest syntax validation passed"
}

validate_production_configs() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component production configurations..."
    
    # Check for resource limits
    if find "$dir" -name "*.yaml" -exec grep -l "resources:" {} \; | head -1 > /dev/null; then
        if find "$dir" -name "*.yaml" -exec grep -l "limits:" {} \; | head -1 > /dev/null; then
            log_success "$component has resource limits configured"
        else
            log_error "$component missing resource limits"
        fi
    else
        log_warning "$component has no resource configurations"
    fi
    
    # Check for security contexts
    if find "$dir" -name "*.yaml" -exec grep -l "securityContext:" {} \; | head -1 > /dev/null; then
        log_success "$component has security contexts"
    else
        log_error "$component missing security contexts"
    fi
    
    # Check for health checks
    if find "$dir" -name "*.yaml" -exec grep -l "livenessProbe:\|readinessProbe:" {} \; | head -1 > /dev/null; then
        log_success "$component has health checks"
    else
        log_error "$component missing health checks"
    fi
    
    # Check for production images (no :latest tags)
    if find "$dir" -name "*.yaml" -exec grep -l ":latest" {} \; | head -1 > /dev/null; then
        log_error "$component using :latest image tags (not production-ready)"
    else
        log_success "$component using versioned image tags"
    fi
}

validate_security_configs() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component security configurations..."
    
    # Check for non-root containers
    if find "$dir" -name "*.yaml" -exec grep -l "runAsNonRoot.*true\|runAsUser.*[1-9]" {} \; | head -1 > /dev/null; then
        log_success "$component configured for non-root execution"
    else
        log_error "$component may be running as root (security risk)"
    fi
    
    # Check for network policies
    if find "$dir" -name "*networkpolicy*.yaml" | head -1 > /dev/null; then
        log_success "$component has network policies"
    else
        log_warning "$component missing network policies"
    fi
    
    # Check for RBAC
    if find "$dir" -name "*rbac*.yaml" -o -name "*role*.yaml" | head -1 > /dev/null; then
        log_success "$component has RBAC configured"
    else
        log_warning "$component missing RBAC (may use default permissions)"
    fi
}

validate_external_secrets_integration() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component External Secrets integration..."
    
    if find "$dir" -name "*.yaml" -exec grep -l "ExternalSecret\|SecretStore" {} \; | head -1 > /dev/null; then
        log_success "$component integrated with External Secrets"
        
        # Check for Azure Key Vault integration
        if find "$dir" -name "*.yaml" -exec grep -l "azure.*keyvault\|keyvault.*azure" {} \; | head -1 > /dev/null; then
            log_success "$component configured for Azure Key Vault"
        else
            log_warning "$component External Secrets not configured for Azure Key Vault"
        fi
    else
        log_warning "$component not using External Secrets (secrets may be embedded)"
    fi
}

validate_monitoring_configs() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component monitoring configurations..."
    
    # Check for ServiceMonitor
    if find "$dir" -name "*monitor*.yaml" -exec grep -l "ServiceMonitor" {} \; | head -1 > /dev/null; then
        log_success "$component has Prometheus monitoring"
    else
        log_warning "$component missing ServiceMonitor for Prometheus"
    fi
    
    # Check for PrometheusRule (alerts)
    if find "$dir" -name "*.yaml" -exec grep -l "PrometheusRule" {} \; | head -1 > /dev/null; then
        log_success "$component has alerting rules"
    else
        log_warning "$component missing PrometheusRule for alerting"
    fi
    
    # Check for metrics endpoints
    if find "$dir" -name "*.yaml" -exec grep -l "/metrics\|:9090\|prometheus" {} \; | head -1 > /dev/null; then
        log_success "$component has metrics endpoint configured"
    else
        log_warning "$component may not expose metrics"
    fi
}

validate_istio_integration() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component Istio integration..."
    
    if find "$dir" -name "*istio*.yaml" | head -1 > /dev/null; then
        log_success "$component has Istio configurations"
        
        # Check for mTLS
        if find "$dir" -name "*.yaml" -exec grep -l "PeerAuthentication\|STRICT\|mTLS" {} \; | head -1 > /dev/null; then
            log_success "$component configured for mTLS"
        else
            log_warning "$component Istio config missing mTLS enforcement"
        fi
        
        # Check for authorization policies
        if find "$dir" -name "*.yaml" -exec grep -l "AuthorizationPolicy" {} \; | head -1 > /dev/null; then
            log_success "$component has authorization policies"
        else
            log_warning "$component missing Istio authorization policies"
        fi
    else
        log_warning "$component not configured for Istio service mesh"
    fi
}

validate_high_availability() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component high availability configurations..."
    
    # Check for multiple replicas
    if find "$dir" -name "*.yaml" -exec grep -l "replicas.*[2-9]" {} \; | head -1 > /dev/null; then
        log_success "$component configured for multiple replicas"
    else
        log_warning "$component may be single-replica (no HA)"
    fi
    
    # Check for PodDisruptionBudget
    if find "$dir" -name "*pdb*.yaml" -o -name "*disruption*.yaml" | head -1 > /dev/null; then
        log_success "$component has PodDisruptionBudget"
    else
        log_warning "$component missing PodDisruptionBudget"
    fi
    
    # Check for anti-affinity
    if find "$dir" -name "*.yaml" -exec grep -l "podAntiAffinity\|topologySpreadConstraints" {} \; | head -1 > /dev/null; then
        log_success "$component configured for pod distribution"
    else
        log_warning "$component missing pod anti-affinity rules"
    fi
    
    # Check for HPA
    if find "$dir" -name "*hpa*.yaml" -o -name "*autoscal*.yaml" | head -1 > /dev/null; then
        log_success "$component has HorizontalPodAutoscaler"
    else
        log_warning "$component missing HPA (no auto-scaling)"
    fi
}

validate_gitops_readiness() {
    local component=$1
    local dir="$SCRIPT_DIR/$component"
    
    log_info "Validating $component GitOps readiness..."
    
    # Check for Flux annotations
    if find "$dir" -name "*.yaml" -exec grep -l "flux\|kustomize.*k8s\.io\|metadata.*annotations" {} \; | head -1 > /dev/null; then
        log_success "$component has GitOps annotations"
    else
        log_warning "$component missing GitOps metadata"
    fi
    
    # Check for proper resource organization
    if [[ -f "$dir/kustomization.yaml" ]]; then
        if grep -q "resources:" "$dir/kustomization.yaml"; then
            log_success "$component properly organized for GitOps"
        else
            log_warning "$component kustomization.yaml missing resources"
        fi
    fi
}

# Main validation function
validate_component() {
    local component=$1
    
    echo ""
    echo "🔎 Validating Component: $component"
    echo "----------------------------------------"
    
    validate_manifest_syntax "$component"
    validate_production_configs "$component"
    validate_security_configs "$component"
    validate_external_secrets_integration "$component"
    validate_monitoring_configs "$component"
    validate_istio_integration "$component"
    validate_high_availability "$component"
    validate_gitops_readiness "$component"
    
    echo ""
}

# Check prerequisites
command -v yq >/dev/null 2>&1 || {
    log_error "yq is required but not installed. Install with: brew install yq"
    exit 1
}

log_info "Starting production readiness validation..."
log_info "Validation target: $SCRIPT_DIR"

# Validate main kustomization
log_info "Validating main kustomization.yaml..."
if [[ -f "$SCRIPT_DIR/kustomization.yaml" ]]; then
    if yq eval '.' "$SCRIPT_DIR/kustomization.yaml" > /dev/null 2>&1; then
        log_success "Main kustomization.yaml syntax is valid"
        
        # Check for proper resource ordering
        if grep -q "external-secrets" "$SCRIPT_DIR/kustomization.yaml" && 
           grep -q "argo" "$SCRIPT_DIR/kustomization.yaml" && 
           grep -q "platform-api" "$SCRIPT_DIR/kustomization.yaml"; then
            log_success "Main kustomization has proper resource ordering"
        else
            log_error "Main kustomization missing required components"
        fi
    else
        log_error "Main kustomization.yaml has invalid syntax"
    fi
else
    log_error "Main kustomization.yaml not found"
fi

# Validate each component
COMPONENTS=("external-secrets" "argo" "platform-api" "platform-ui")

for component in "${COMPONENTS[@]}"; do
    if [[ -d "$SCRIPT_DIR/$component" ]]; then
        validate_component "$component"
    else
        log_error "Component directory not found: $component"
    fi
done

# Final summary
echo ""
echo "📊 Validation Summary"
echo "==================="
echo ""

if [[ $VALIDATION_ERRORS -eq 0 ]]; then
    log_success "✅ All validations passed! Stack is production-ready for AKS deployment."
    echo ""
    echo "🚀 Ready for deployment:"
    echo "   kubectl apply -k $SCRIPT_DIR"
    echo ""
    echo "📚 Next steps:"
    echo "   1. Configure Azure Key Vault with required secrets"
    echo "   2. Update DNS entries for ingress"
    echo "   3. Deploy with GitOps (Flux) or kubectl"
    echo "   4. Run component-specific validation scripts"
    exit 0
else
    log_error "❌ $VALIDATION_ERRORS validation errors found"
    echo ""
    echo "🔧 Please fix the issues above before deploying to production"
    echo ""
    exit 1
fi