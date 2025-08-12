#!/bin/bash

# Validation script for Platform API configuration
# This script checks that all required environment variables are available
# from External Secrets and ConfigMaps

set -euo pipefail

NAMESPACE=${NAMESPACE:-"platform-system"}
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${BOLD}[$(date +'%Y-%m-%dT%H:%M:%S%z')]${NC} $*"
}

error() {
    echo -e "${RED}ERROR:${NC} $*" >&2
}

success() {
    echo -e "${GREEN}✓${NC} $*"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

check_secret_key() {
    local secret_name="$1"
    local key="$2"
    local namespace="$3"
    
    if kubectl get secret "$secret_name" -n "$namespace" -o jsonpath="{.data.$key}" >/dev/null 2>&1; then
        success "Secret key $secret_name/$key exists"
        return 0
    else
        error "Secret key $secret_name/$key missing"
        return 1
    fi
}

check_configmap_key() {
    local configmap_name="$1"
    local key="$2"
    local namespace="$3"
    
    if kubectl get configmap "$configmap_name" -n "$namespace" -o jsonpath="{.data.$key}" >/dev/null 2>&1; then
        local value=$(kubectl get configmap "$configmap_name" -n "$namespace" -o jsonpath="{.data.$key}")
        success "ConfigMap key $configmap_name/$key: $value"
        return 0
    else
        error "ConfigMap key $configmap_name/$key missing"
        return 1
    fi
}

main() {
    log "🔍 Validating Platform API Configuration"
    log "Namespace: $NAMESPACE"
    
    # Check if kubectl can connect to cluster
    if ! kubectl cluster-info >/dev/null 2>&1; then
        error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        error "Namespace $NAMESPACE does not exist"
        exit 1
    fi
    
    success "Connected to Kubernetes cluster"
    success "Namespace $NAMESPACE exists"
    
    echo
    log "📋 Checking ConfigMap Values"
    
    local configmap_checks=(
        "platform-api-config:NODE_ENV"
        "platform-api-config:PORT"
        "platform-api-config:CORS_ORIGINS"
        "platform-api-config:KUBE_NAMESPACE"
        "platform-api-config:LOG_LEVEL"
        "platform-api-config:LOG_FORMAT"
        "platform-api-config:PLATFORM_COST_TRACKING"
        "platform-api-config:DB_SSL"
        "platform-api-config:RATE_LIMIT_MAX_REQUESTS"
        "platform-api-config:RATE_LIMIT_WINDOW_MS"
        "platform-api-config:ARGO_WORKFLOWS_URL"
        "platform-api-config:ARGO_NAMESPACE"
        "platform-api-config:ARGO_TIMEOUT"
    )
    
    local configmap_failed=0
    for check in "${configmap_checks[@]}"; do
        IFS=':' read -r configmap_name key <<< "$check"
        if ! check_configmap_key "$configmap_name" "$key" "$NAMESPACE"; then
            ((configmap_failed++))
        fi
    done
    
    echo
    log "🔐 Checking External Secrets"
    
    # Check External Secrets sync status
    if kubectl get externalsecret platform-api-secrets -n "$NAMESPACE" >/dev/null 2>&1; then
        local es_status=$(kubectl get externalsecret platform-api-secrets -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' || echo "Unknown")
        if [[ "$es_status" == "True" ]]; then
            success "ExternalSecret platform-api-secrets is ready"
        else
            warning "ExternalSecret platform-api-secrets status: $es_status"
        fi
    else
        error "ExternalSecret platform-api-secrets not found"
    fi
    
    if kubectl get externalsecret platform-db-connection -n "$NAMESPACE" >/dev/null 2>&1; then
        local db_es_status=$(kubectl get externalsecret platform-db-connection -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' || echo "Unknown")
        if [[ "$db_es_status" == "True" ]]; then
            success "ExternalSecret platform-db-connection is ready"
        else
            warning "ExternalSecret platform-db-connection status: $db_es_status"
        fi
    else
        error "ExternalSecret platform-db-connection not found"
    fi
    
    echo
    log "🔑 Checking Secret Keys"
    
    local secret_checks=(
        "platform-api-secrets:JWT_SECRET"
        "platform-api-secrets:AZURE_CLIENT_ID"
        "platform-api-secrets:AZURE_CLIENT_SECRET"
        "platform-api-secrets:AZURE_TENANT_ID"
        "platform-api-secrets:DB_HOST"
        "platform-api-secrets:DB_PORT"
        "platform-api-secrets:DB_NAME"
        "platform-api-secrets:DB_USER"
        "platform-api-secrets:DB_PASSWORD"
        "platform-api-secrets:ENCRYPTION_KEY"
        "platform-api-secrets:API_KEY"
        "platform-db-connection:DATABASE_URL"
    )
    
    local secret_failed=0
    for check in "${secret_checks[@]}"; do
        IFS=':' read -r secret_name key <<< "$check"
        if ! check_secret_key "$secret_name" "$key" "$NAMESPACE"; then
            ((secret_failed++))
        fi
    done
    
    echo
    log "🧪 Testing Database Connection String"
    
    if kubectl get secret platform-db-connection -n "$NAMESPACE" >/dev/null 2>&1; then
        local db_url=$(kubectl get secret platform-db-connection -n "$NAMESPACE" -o jsonpath='{.data.DATABASE_URL}' | base64 -d)
        # Mask password in output
        local masked_url=$(echo "$db_url" | sed 's/:.*@/:***@/')
        success "DATABASE_URL format: $masked_url"
        
        # Basic URL validation
        if [[ "$db_url" =~ ^postgresql://.*@.*/.* ]]; then
            success "DATABASE_URL has valid PostgreSQL format"
        else
            warning "DATABASE_URL may not be in correct PostgreSQL format"
        fi
    else
        error "Cannot retrieve DATABASE_URL from platform-db-connection secret"
    fi
    
    echo
    log "📊 Validation Summary"
    
    local total_failed=$((configmap_failed + secret_failed))
    
    if [[ $total_failed -eq 0 ]]; then
        success "All configuration checks passed! ✨"
        echo
        log "🚀 Platform API should start successfully with current configuration"
        exit 0
    else
        error "$total_failed configuration issues found"
        echo
        log "❌ Platform API may fail to start. Please fix the issues above."
        exit 1
    fi
}

# Show usage if help is requested
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: $0 [NAMESPACE]"
    echo ""
    echo "Validates Platform API configuration including:"
    echo "  - ConfigMap values"
    echo "  - External Secrets synchronization"
    echo "  - Required secret keys"
    echo "  - Database connection string format"
    echo ""
    echo "Environment variables:"
    echo "  NAMESPACE - Kubernetes namespace (default: platform-system)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Use default namespace"
    echo "  $0 my-namespace       # Use specific namespace"
    echo "  NAMESPACE=prod $0     # Use environment variable"
    exit 0
fi

# Allow namespace to be passed as argument
if [[ $# -gt 0 ]]; then
    NAMESPACE="$1"
fi

main "$@"