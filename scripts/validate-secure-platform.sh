#!/bin/bash

# Secure Platform Validation Script
# Comprehensive validation of secure build and deployment setup
# Validates External Secrets, container security, and deployment readiness

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="platform-system"
ENVIRONMENT="development"
VERBOSE=false

# Script paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')] INFO: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR: $1${NC}"
}

success() {
    echo -e "${CYAN}[$(date +'%H:%M:%S')] ✅ $1${NC}"
}

print_usage() {
    echo "Secure Platform Validation Script"
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --namespace NAMESPACE Set Kubernetes namespace (default: platform-system)"
    echo "  -e, --environment ENV     Set environment (development|production) (default: development)"
    echo "  -v, --verbose             Enable verbose output"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Validation Categories:"
    echo "  🔍 Source Code Security"
    echo "  🐳 Docker Security"  
    echo "  🔐 External Secrets Configuration"
    echo "  ☸️  Kubernetes Security"
    echo "  🚀 Deployment Readiness"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
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

# Validation results
VALIDATION_RESULTS=()

# Function to add validation result
add_result() {
    local category="$1"
    local test="$2"
    local status="$3"
    local details="$4"
    
    VALIDATION_RESULTS+=("$category|$test|$status|$details")
    
    if [[ "$status" == "PASS" ]]; then
        success "$category: $test"
    elif [[ "$status" == "WARN" ]]; then
        warn "$category: $test - $details"
    else
        error "$category: $test - $details"
    fi
    
    [[ "$VERBOSE" == "true" && -n "$details" ]] && echo "    Details: $details"
}

# 1. Source Code Security Validation
validate_source_security() {
    log "🔍 Validating Source Code Security..."
    
    # Check for .dockerignore files
    local api_dockerignore="$ROOT_DIR/platform-api/.dockerignore"
    local ui_dockerignore="$ROOT_DIR/platform-ui/.dockerignore"
    
    if [[ -f "$api_dockerignore" ]]; then
        if grep -q "secrets/" "$api_dockerignore" && grep -q ".env" "$api_dockerignore"; then
            add_result "Source Security" "Platform API .dockerignore" "PASS" "Secret exclusion patterns found"
        else
            add_result "Source Security" "Platform API .dockerignore" "WARN" "Missing some secret exclusion patterns"
        fi
    else
        add_result "Source Security" "Platform API .dockerignore" "FAIL" "File not found"
    fi
    
    if [[ -f "$ui_dockerignore" ]]; then
        if grep -q "secrets/" "$ui_dockerignore" && grep -q ".env" "$ui_dockerignore"; then
            add_result "Source Security" "Platform UI .dockerignore" "PASS" "Secret exclusion patterns found"
        else
            add_result "Source Security" "Platform UI .dockerignore" "WARN" "Missing some secret exclusion patterns"
        fi
    else
        add_result "Source Security" "Platform UI .dockerignore" "FAIL" "File not found"
    fi
    
    # Scan for hardcoded secrets in source code
    local secret_patterns=(\n        \"(password|secret|token|key|apikey)\\\\s*[:=]\\\\s*['\\\\\"][^'\\\\\"]{8,}\"\n        \"process\\\\.env\\\\.[A-Z_]+\\\\s*=\\\\s*['\\\\\"][^'\\\\\"]{8,}\"\n    )\n    \n    local secrets_found=false\n    for pattern in \"${secret_patterns[@]}\"; do\n        if grep -r --include=\"*.ts\" --include=\"*.js\" --include=\"*.tsx\" --include=\"*.jsx\" \\\n            -E \"$pattern\" \"$ROOT_DIR/platform-api/src/\" \"$ROOT_DIR/platform-ui/src/\" 2>/dev/null | \\\n            grep -v \"test\\|mock\\|example\\|sample\\|template\\|placeholder\"; then\n            secrets_found=true\n            break\n        fi\n    done\n    \n    if [[ \"$secrets_found\" == \"false\" ]]; then\n        add_result \"Source Security\" \"Hardcoded Secrets Scan\" \"PASS\" \"No hardcoded secrets found\"\n    else\n        add_result \"Source Security\" \"Hardcoded Secrets Scan\" \"FAIL\" \"Potential hardcoded secrets detected\"\n    fi\n    \n    # Check for detect-secrets baseline\n    if command -v detect-secrets &> /dev/null; then\n        info \"Running detect-secrets scan...\"\n        if detect-secrets scan --all-files --force-use-all-plugins \\\n            \"$ROOT_DIR/platform-api/\" \"$ROOT_DIR/platform-ui/\" > /tmp/secrets.baseline 2>/dev/null; then\n            \n            local secret_count\n            secret_count=$(jq '.results | to_entries | length' /tmp/secrets.baseline 2>/dev/null || echo \"0\")\n            \n            if [[ \"$secret_count\" -eq 0 ]]; then\n                add_result \"Source Security\" \"detect-secrets scan\" \"PASS\" \"No secrets detected\"\n            else\n                add_result \"Source Security\" \"detect-secrets scan\" \"WARN\" \"$secret_count potential secrets found\"\n            fi\n            \n            rm -f /tmp/secrets.baseline\n        else\n            add_result \"Source Security\" \"detect-secrets scan\" \"WARN\" \"Scan failed or not available\"\n        fi\n    else\n        add_result \"Source Security\" \"detect-secrets availability\" \"WARN\" \"detect-secrets not installed\"\n    fi\n}\n\n# 2. Docker Security Validation\nvalidate_docker_security() {\n    log \"🐳 Validating Docker Security...\"\n    \n    # Check Dockerfile security practices\n    local dockerfiles=(\n        \"$ROOT_DIR/platform-api/Dockerfile\"\n        \"$ROOT_DIR/platform-ui/Dockerfile\"\n    )\n    \n    for dockerfile in \"${dockerfiles[@]}\"; do\n        local service\n        service=$(basename \"$(dirname \"$dockerfile\")\")\n        \n        if [[ -f \"$dockerfile\" ]]; then\n            # Check for non-root user\n            if grep -q \"USER.*[0-9]\\|adduser\\|addgroup\" \"$dockerfile\"; then\n                add_result \"Docker Security\" \"$service non-root user\" \"PASS\" \"Non-root user configuration found\"\n            else\n                add_result \"Docker Security\" \"$service non-root user\" \"FAIL\" \"No non-root user found\"\n            fi\n            \n            # Check for security labels\n            if grep -q \"platform.security\" \"$dockerfile\"; then\n                add_result \"Docker Security\" \"$service security labels\" \"PASS\" \"Security labels found\"\n            else\n                add_result \"Docker Security\" \"$service security labels\" \"WARN\" \"Security labels missing\"\n            fi\n            \n            # Check for health check\n            if grep -q \"HEALTHCHECK\" \"$dockerfile\"; then\n                add_result \"Docker Security\" \"$service health check\" \"PASS\" \"Health check configured\"\n            else\n                add_result \"Docker Security\" \"$service health check\" \"WARN\" \"Health check missing\"\n            fi\n            \n            # Check for dumb-init or similar\n            if grep -q \"dumb-init\\|tini\" \"$dockerfile\"; then\n                add_result \"Docker Security\" \"$service init system\" \"PASS\" \"Init system configured\"\n            else\n                add_result \"Docker Security\" \"$service init system\" \"WARN\" \"Init system missing\"\n            fi\n            \n        else\n            add_result \"Docker Security\" \"$service Dockerfile\" \"FAIL\" \"Dockerfile not found\"\n        fi\n    done\n    \n    # Check if Docker is available for build validation\n    if command -v docker &> /dev/null && docker info &> /dev/null; then\n        add_result \"Docker Security\" \"Docker availability\" \"PASS\" \"Docker is available for builds\"\n        \n        # Check if BuildKit is enabled\n        if DOCKER_BUILDKIT=1 docker version --format '{{.Server.Version}}' &> /dev/null; then\n            add_result \"Docker Security\" \"Docker BuildKit\" \"PASS\" \"BuildKit is available\"\n        else\n            add_result \"Docker Security\" \"Docker BuildKit\" \"WARN\" \"BuildKit not available\"\n        fi\n    else\n        add_result \"Docker Security\" \"Docker availability\" \"WARN\" \"Docker not available for validation\"\n    fi\n}\n\n# 3. External Secrets Configuration Validation\nvalidate_external_secrets() {\n    log \"🔐 Validating External Secrets Configuration...\"\n    \n    # Check External Secrets manifests exist\n    local external_secrets_files=(\n        \"$ROOT_DIR/platform-api/deployment/external-secrets.yaml\"\n        \"$ROOT_DIR/platform-ui/deployment/external-secrets.yaml\"\n    )\n    \n    for file in \"${external_secrets_files[@]}\"; do\n        local service\n        service=$(basename \"$(dirname \"$(dirname \"$file\")\")\")\n        \n        if [[ -f \"$file\" ]]; then\n            # Check for proper ClusterSecretStore reference\n            if grep -q \"azure-keyvault\" \"$file\"; then\n                add_result \"External Secrets\" \"$service Azure KeyVault reference\" \"PASS\" \"ClusterSecretStore reference found\"\n            else\n                add_result \"External Secrets\" \"$service Azure KeyVault reference\" \"FAIL\" \"ClusterSecretStore reference missing\"\n            fi\n            \n            # Check for required secret mappings\n            if grep -q \"JWT_SECRET\\|AZURE_CLIENT_\" \"$file\"; then\n                add_result \"External Secrets\" \"$service secret mappings\" \"PASS\" \"Required secret mappings found\"\n            else\n                add_result \"External Secrets\" \"$service secret mappings\" \"FAIL\" \"Required secret mappings missing\"\n            fi\n            \n            # Validate YAML syntax\n            if command -v yq &> /dev/null; then\n                if yq eval '.' \"$file\" > /dev/null 2>&1; then\n                    add_result \"External Secrets\" \"$service YAML syntax\" \"PASS\" \"Valid YAML syntax\"\n                else\n                    add_result \"External Secrets\" \"$service YAML syntax\" \"FAIL\" \"Invalid YAML syntax\"\n                fi\n            fi\n        else\n            add_result \"External Secrets\" \"$service configuration\" \"FAIL\" \"External Secrets file not found\"\n        fi\n    done\n    \n    # Check if kubectl is available for runtime validation\n    if command -v kubectl &> /dev/null; then\n        if kubectl cluster-info &> /dev/null; then\n            # Check External Secrets CRDs\n            if kubectl get crd externalsecrets.external-secrets.io &> /dev/null; then\n                add_result \"External Secrets\" \"CRDs installed\" \"PASS\" \"External Secrets CRDs found\"\n                \n                # Check External Secrets operator\n                if kubectl get deployment external-secrets -n external-secrets-system &> /dev/null; then\n                    add_result \"External Secrets\" \"Operator status\" \"PASS\" \"External Secrets operator running\"\n                    \n                    # Check ClusterSecretStore\n                    if kubectl get clustersecretstore azure-keyvault &> /dev/null; then\n                        local store_status\n                        store_status=$(kubectl get clustersecretstore azure-keyvault -o jsonpath='{.status.conditions[?(@.type==\"Ready\")].status}' 2>/dev/null || echo \"Unknown\")\n                        \n                        if [[ \"$store_status\" == \"True\" ]]; then\n                            add_result \"External Secrets\" \"ClusterSecretStore ready\" \"PASS\" \"Azure KeyVault store is ready\"\n                        else\n                            add_result \"External Secrets\" \"ClusterSecretStore ready\" \"FAIL\" \"Store status: $store_status\"\n                        fi\n                    else\n                        add_result \"External Secrets\" \"ClusterSecretStore exists\" \"FAIL\" \"azure-keyvault ClusterSecretStore not found\"\n                    fi\n                else\n                    add_result \"External Secrets\" \"Operator status\" \"FAIL\" \"External Secrets operator not found\"\n                fi\n            else\n                add_result \"External Secrets\" \"CRDs installed\" \"FAIL\" \"External Secrets CRDs not installed\"\n            fi\n        else\n            add_result \"External Secrets\" \"Cluster connectivity\" \"WARN\" \"Cannot connect to Kubernetes cluster\"\n        fi\n    else\n        add_result \"External Secrets\" \"kubectl availability\" \"WARN\" \"kubectl not available for validation\"\n    fi\n}\n\n# 4. Kubernetes Security Validation\nvalidate_kubernetes_security() {\n    log \"☸️ Validating Kubernetes Security...\"\n    \n    # Check Kubernetes manifests\n    local k8s_manifests=(\n        \"$ROOT_DIR/k8s/platform-api/deployment.yaml\"\n        \"$ROOT_DIR/k8s/platform-ui/deployment.yaml\"\n        \"$ROOT_DIR/k8s/platform-api/serviceaccount.yaml\"\n    )\n    \n    for manifest in \"${k8s_manifests[@]}\"; do\n        local filename\n        filename=$(basename \"$manifest\")\n        local service\n        service=$(basename \"$(dirname \"$manifest\")\")\n        \n        if [[ -f \"$manifest\" ]]; then\n            # Check for security context\n            if grep -q \"securityContext\" \"$manifest\" && grep -q \"runAsNonRoot.*true\" \"$manifest\"; then\n                add_result \"K8s Security\" \"$service security context\" \"PASS\" \"Non-root security context configured\"\n            else\n                add_result \"K8s Security\" \"$service security context\" \"FAIL\" \"Security context missing or incomplete\"\n            fi\n            \n            # Check for resource limits\n            if grep -q \"resources:\" \"$manifest\" && grep -q \"limits:\" \"$manifest\"; then\n                add_result \"K8s Security\" \"$service resource limits\" \"PASS\" \"Resource limits configured\"\n            else\n                add_result \"K8s Security\" \"$service resource limits\" \"WARN\" \"Resource limits missing\"\n            fi\n            \n            # Check for External Secrets references\n            if grep -q \"platform-api-secrets\\|platform-db-connection\" \"$manifest\"; then\n                add_result \"K8s Security\" \"$service External Secrets refs\" \"PASS\" \"External Secrets references found\"\n            else\n                add_result \"K8s Security\" \"$service External Secrets refs\" \"FAIL\" \"External Secrets references missing\"\n            fi\n            \n            # Check for proper probes\n            if grep -q \"livenessProbe\\|readinessProbe\" \"$manifest\"; then\n                add_result \"K8s Security\" \"$service health probes\" \"PASS\" \"Health probes configured\"\n            else\n                add_result \"K8s Security\" \"$service health probes\" \"WARN\" \"Health probes missing\"\n            fi\n            \n        else\n            add_result \"K8s Security\" \"$service $filename\" \"FAIL\" \"Manifest file not found\"\n        fi\n    done\n    \n    # Validate YAML syntax\n    if command -v kubeval &> /dev/null; then\n        info \"Running kubeval on manifests...\"\n        local validation_passed=true\n        \n        find \"$ROOT_DIR/k8s/\" -name \"*.yaml\" -o -name \"*.yml\" | while read -r file; do\n            if ! kubeval \"$file\" > /dev/null 2>&1; then\n                validation_passed=false\n                add_result \"K8s Security\" \"$(basename \"$file\") validation\" \"FAIL\" \"kubeval validation failed\"\n            fi\n        done\n        \n        if [[ \"$validation_passed\" == \"true\" ]]; then\n            add_result \"K8s Security\" \"Manifest validation\" \"PASS\" \"All manifests passed kubeval\"\n        fi\n    else\n        add_result \"K8s Security\" \"kubeval availability\" \"WARN\" \"kubeval not available for validation\"\n    fi\n}\n\n# 5. Deployment Readiness Validation\nvalidate_deployment_readiness() {\n    log \"🚀 Validating Deployment Readiness...\"\n    \n    # Check build scripts\n    local build_script=\"$ROOT_DIR/scripts/build-platform-secure.sh\"\n    if [[ -f \"$build_script\" && -x \"$build_script\" ]]; then\n        add_result \"Deployment\" \"Secure build script\" \"PASS\" \"Secure build script available\"\n    else\n        add_result \"Deployment\" \"Secure build script\" \"FAIL\" \"Secure build script missing or not executable\"\n    fi\n    \n    # Check deployment script\n    local deploy_script=\"$ROOT_DIR/scripts/deploy-platform-secure.sh\"\n    if [[ -f \"$deploy_script\" && -x \"$deploy_script\" ]]; then\n        add_result \"Deployment\" \"Secure deploy script\" \"PASS\" \"Secure deployment script available\"\n    else\n        add_result \"Deployment\" \"Secure deploy script\" \"FAIL\" \"Secure deployment script missing or not executable\"\n    fi\n    \n    # Check CI/CD workflow\n    local workflow=\"$ROOT_DIR/.github/workflows/secure-build-deploy.yml\"\n    if [[ -f \"$workflow\" ]]; then\n        if grep -q \"trivy\" \"$workflow\" && grep -q \"external-secrets\" \"$workflow\"; then\n            add_result \"Deployment\" \"CI/CD security features\" \"PASS\" \"Security scanning and External Secrets validation configured\"\n        else\n            add_result \"Deployment\" \"CI/CD security features\" \"WARN\" \"Some security features missing from CI/CD\"\n        fi\n    else\n        add_result \"Deployment\" \"CI/CD workflow\" \"WARN\" \"GitHub Actions workflow not found\"\n    fi\n    \n    # Check validation script (this script)\n    local validation_script=\"$ROOT_DIR/scripts/validate-secure-platform.sh\"\n    if [[ -f \"$validation_script\" && -x \"$validation_script\" ]]; then\n        add_result \"Deployment\" \"Validation script\" \"PASS\" \"Platform validation script available\"\n    else\n        add_result \"Deployment\" \"Validation script\" \"WARN\" \"Platform validation script issues\"\n    fi\n    \n    # Check External Secrets validation script\n    local es_validation=\"$ROOT_DIR/apps/external-secrets/scripts/validate-external-secrets.sh\"\n    if [[ -f \"$es_validation\" && -x \"$es_validation\" ]]; then\n        add_result \"Deployment\" \"External Secrets validation\" \"PASS\" \"External Secrets validation script available\"\n    else\n        add_result \"Deployment\" \"External Secrets validation\" \"WARN\" \"External Secrets validation script missing\"\n    fi\n}\n\n# Generate comprehensive report\ngenerate_report() {\n    log \"📊 Generating Validation Report...\"\n    \n    local total_tests=0\n    local passed_tests=0\n    local warned_tests=0\n    local failed_tests=0\n    \n    echo\n    echo \"===============================================\"\n    echo \"🔒 SECURE PLATFORM VALIDATION REPORT\"\n    echo \"===============================================\"\n    echo \"Environment: $ENVIRONMENT\"\n    echo \"Namespace: $NAMESPACE\"\n    echo \"Timestamp: $(date)\"\n    echo\n    \n    # Group results by category\n    declare -A categories\n    \n    for result in \"${VALIDATION_RESULTS[@]}\"; do\n        IFS='|' read -r category test status details <<< \"$result\"\n        \n        if [[ -z \"${categories[$category]:-}\" ]]; then\n            categories[\"$category\"]=\"\"\n        fi\n        \n        categories[\"$category\"]+=\"$test|$status|$details\\n\"\n        \n        total_tests=$((total_tests + 1))\n        case \"$status\" in\n            \"PASS\") passed_tests=$((passed_tests + 1)) ;;\n            \"WARN\") warned_tests=$((warned_tests + 1)) ;;\n            \"FAIL\") failed_tests=$((failed_tests + 1)) ;;\n        esac\n    done\n    \n    # Print results by category\n    for category in \"Source Security\" \"Docker Security\" \"External Secrets\" \"K8s Security\" \"Deployment\"; do\n        if [[ -n \"${categories[$category]:-}\" ]]; then\n            echo \"## $category\"\n            echo\n            \n            while IFS='|' read -r test status details; do\n                case \"$status\" in\n                    \"PASS\") echo -e \"  ✅ $test\" ;;\n                    \"WARN\") echo -e \"  ⚠️  $test - $details\" ;;\n                    \"FAIL\") echo -e \"  ❌ $test - $details\" ;;\n                esac\n            done <<< \"$(echo -e \"${categories[$category]}\" | head -n -1)\"\n            \n            echo\n        fi\n    done\n    \n    # Summary\n    echo \"===============================================\"\n    echo \"SUMMARY\"\n    echo \"===============================================\"\n    echo \"Total Tests: $total_tests\"\n    echo -e \"Passed: ${GREEN}$passed_tests${NC}\"\n    echo -e \"Warnings: ${YELLOW}$warned_tests${NC}\"\n    echo -e \"Failed: ${RED}$failed_tests${NC}\"\n    echo\n    \n    # Overall status\n    if [[ $failed_tests -eq 0 ]]; then\n        if [[ $warned_tests -eq 0 ]]; then\n            echo -e \"${GREEN}🎉 VALIDATION PASSED - Platform is ready for secure deployment!${NC}\"\n            echo\n        else\n            echo -e \"${YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS - Review warnings before deployment${NC}\"\n            echo\n        fi\n    else\n        echo -e \"${RED}❌ VALIDATION FAILED - Critical issues must be resolved before deployment${NC}\"\n        echo\n        return 1\n    fi\n    \n    # Recommendations\n    echo \"RECOMMENDATIONS:\"\n    echo \"===============================================\"\n    \n    if [[ $failed_tests -gt 0 ]]; then\n        echo \"🔴 CRITICAL: Resolve all failed tests before deploying to production\"\n    fi\n    \n    if [[ $warned_tests -gt 0 ]]; then\n        echo \"🟡 IMPORTANT: Review and address warnings for optimal security\"\n    fi\n    \n    echo \"📚 BEST PRACTICES:\"\n    echo \"  • Regularly run this validation script\"\n    echo \"  • Keep External Secrets Operator updated\"\n    echo \"  • Rotate secrets in Azure Key Vault regularly\"\n    echo \"  • Monitor security scan results in CI/CD\"\n    echo \"  • Review and update security policies\"\n    echo\n}\n\n# Main execution\nmain() {\n    log \"=== Starting Secure Platform Validation ===\"\n    info \"Environment: $ENVIRONMENT\"\n    info \"Namespace: $NAMESPACE\"\n    info \"Verbose: $VERBOSE\"\n    echo\n    \n    # Run validation categories\n    validate_source_security\n    validate_docker_security\n    validate_external_secrets\n    validate_kubernetes_security\n    validate_deployment_readiness\n    \n    # Generate final report\n    generate_report\n}\n\n# Execute main function\nmain \"$@\""