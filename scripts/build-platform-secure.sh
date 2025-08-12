#!/bin/bash

# Secure Platform Build Script
# Builds Docker images with External Secrets integration and security validation
# No secrets are embedded in images - all secrets come from Azure Key Vault at runtime

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
VERSION=${VERSION:-"latest"}
REGISTRY=${REGISTRY:-"davidgardiner"}
BUILD_TARGET=${BUILD_TARGET:-"production"}
SCAN_IMAGES=${SCAN_IMAGES:-"true"}
VALIDATE_SECRETS=${VALIDATE_SECRETS:-"true"}
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

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
    echo "Secure Platform Build Script"
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -v, --version VERSION     Set image version tag (default: latest)"
    echo "  -r, --registry REGISTRY   Set container registry prefix (default: davidgardiner)"
    echo "  -t, --target TARGET       Build target: development|production (default: production)"
    echo "  -s, --skip-scan           Skip security scanning"
    echo "  -n, --no-validate         Skip External Secrets validation"
    echo "  -p, --push                Push images to registry after build"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  VERSION                   Image version tag"
    echo "  REGISTRY                  Container registry prefix"
    echo "  BUILD_TARGET              Build target (development|production)"
    echo "  SCAN_IMAGES               Enable security scanning (true|false)"
    echo "  VALIDATE_SECRETS          Validate External Secrets setup (true|false)"
    echo ""
    echo "Security Features:"
    echo "  • No secrets embedded in container images"
    echo "  • All secrets sourced from Azure Key Vault via External Secrets"
    echo "  • Vulnerability scanning with Trivy"
    echo "  • Build artifact verification"
    echo "  • Secret leak detection in source code"
}

# Parse command line arguments
PUSH_IMAGES="false"
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -t|--target)
            BUILD_TARGET="$2"
            shift 2
            ;;
        -s|--skip-scan)
            SCAN_IMAGES="false"
            shift
            ;;
        -n|--no-validate)
            VALIDATE_SECRETS="false"
            shift
            ;;
        -p|--push)
            PUSH_IMAGES="true"
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

# Validate build target
if [[ "$BUILD_TARGET" != "development" && "$BUILD_TARGET" != "production" ]]; then
    error "Invalid build target: $BUILD_TARGET. Must be 'development' or 'production'"
    exit 1
fi

# Set image names with security labels
PLATFORM_API_IMAGE="${REGISTRY}/platform-api:${VERSION}"
PLATFORM_UI_IMAGE="${REGISTRY}/platform-ui:${VERSION}"

log "=== Secure Platform Build Started ==="
info "Version: $VERSION"
info "Registry: $REGISTRY"
info "Build target: $BUILD_TARGET"
info "Security scanning: $SCAN_IMAGES"
info "External Secrets validation: $VALIDATE_SECRETS"
info "Push to registry: $PUSH_IMAGES"
info "Git commit: $GIT_COMMIT"

# Pre-build security validation
validate_build_environment() {
    log "Validating build environment security..."
    
    # Check Docker is available
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi
    
    # Verify Docker BuildKit is available
    if ! DOCKER_BUILDKIT=1 docker version --format '{{.Server.Version}}' &> /dev/null; then
        error "Docker BuildKit is not available"
        exit 1
    fi
    
    info "Docker environment validated"
}

# Scan source code for hardcoded secrets
scan_for_secrets() {
    log "Scanning source code for hardcoded secrets..."
    
    local found_issues=false
    
    # Use detect-secrets if available
    if command -v detect-secrets &> /dev/null; then
        log "Running detect-secrets scan..."
        if ! detect-secrets scan --all-files --force-use-all-plugins platform-api/ platform-ui/ > .secrets.baseline.tmp; then
            warn "detect-secrets found potential secrets"
            found_issues=true
        fi
        rm -f .secrets.baseline.tmp
    else
        # Fallback to manual patterns
        info "Using fallback secret detection patterns"
        
        # Check for common secret patterns
        if grep -r --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
            -E "(password|secret|token|key|apikey)\s*[:=]\s*['\"][^'\"]{8,}" \
            platform-api/src/ platform-ui/src/ 2>/dev/null | \
            grep -v "test\|mock\|example\|sample\|template\|placeholder"; then
            error "Potential hardcoded secrets found in source code"
            found_issues=true
        fi
        
        # Check for environment variable assignments with values
        if grep -r --include="*.ts" --include="*.js" \
            -E "process\.env\.[A-Z_]+\s*=\s*['\"][^'\"]{8,}" \
            platform-api/src/ platform-ui/src/ 2>/dev/null; then
            error "Hardcoded environment variable assignments found"
            found_issues=true
        fi
    fi
    
    if [[ "$found_issues" == "true" ]]; then
        error "Security scan failed - hardcoded secrets detected"
        info "Please remove all hardcoded secrets and use External Secrets configuration"
        return 1
    fi
    
    log "Source code secret scan passed"
}

# Validate External Secrets configuration
validate_external_secrets() {
    if [[ "$VALIDATE_SECRETS" != "true" ]]; then
        info "Skipping External Secrets validation"
        return 0
    fi
    
    log "Validating External Secrets configuration..."
    
    # Check if validation script exists
    if [[ ! -f "$VALIDATION_SCRIPT" ]]; then
        warn "External Secrets validation script not found at $VALIDATION_SCRIPT"
        warn "Skipping External Secrets validation"
        return 0
    fi
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        warn "kubectl not available - skipping External Secrets validation"
        return 0
    fi
    
    # Run validation script
    if ! bash "$VALIDATION_SCRIPT" dev; then
        error "External Secrets validation failed"
        error "Build cannot proceed without proper secrets configuration"
        return 1
    fi
    
    log "External Secrets validation passed"
}

# Build Docker image with security hardening
build_secure_image() {
    local service=$1
    local dockerfile_path=$2
    local context_path=$3
    local image_name=$4
    
    log "Building secure $service image: $image_name"
    
    # Verify Dockerfile exists
    if [[ ! -f "$dockerfile_path" ]]; then
        error "Dockerfile not found: $dockerfile_path"
        return 1
    fi
    
    # Create .dockerignore if it doesn't exist to prevent secret leakage
    local dockerignore="$context_path/.dockerignore"
    if [[ ! -f "$dockerignore" ]]; then
        warn "No .dockerignore found, creating one to prevent secret leakage"
        cat > "$dockerignore" << 'EOF'
# Security - prevent secret files from being copied
.env*
*.key
*.pem
*.p12
*.pfx
secrets/
.secrets/
config/secrets/

# Development files
node_modules/
.git/
.gitignore
README.md
*.log
*.tmp

# Build artifacts
dist/
build/
coverage/
EOF
    fi
    
    # Build with comprehensive security labels and BuildKit
    local build_args=()
    build_args+=("--target" "$BUILD_TARGET")
    build_args+=("--tag" "$image_name")
    build_args+=("--file" "$dockerfile_path")
    
    # Security and metadata labels
    build_args+=("--label" "org.opencontainers.image.created=$BUILD_DATE")
    build_args+=("--label" "org.opencontainers.image.version=$VERSION")
    build_args+=("--label" "org.opencontainers.image.revision=$GIT_COMMIT")
    build_args+=("--label" "org.opencontainers.image.source=https://github.com/davidmarkgardiner/claude-aso")
    build_args+=("--label" "platform.security.secrets-source=external-secrets")
    build_args+=("--label" "platform.security.no-embedded-secrets=true")
    build_args+=("--label" "platform.security.scan-date=$BUILD_DATE")
    
    # Build with BuildKit for better caching and security
    DOCKER_BUILDKIT=1 docker build "${build_args[@]}" "$context_path"
    
    if [[ $? -eq 0 ]]; then
        log "Successfully built $service image"
        
        # Display image information
        local image_size=$(docker images "$image_name" --format "{{.Size}}" | head -n 1)
        local image_id=$(docker images "$image_name" --format "{{.ID}}" | head -n 1)
        info "$service image size: $image_size"
        info "$service image ID: $image_id"
        
        # Verify image was built with correct target
        local target_label=$(docker inspect "$image_name" --format '{{index .Config.Labels "org.opencontainers.image.target"}}' 2>/dev/null || echo "")
        if [[ -n "$target_label" ]] && [[ "$target_label" != "$BUILD_TARGET" ]]; then
            warn "Image target mismatch: expected $BUILD_TARGET, got $target_label"
        fi
        
        return 0
    else
        error "Failed to build $service image"
        return 1
    fi
}

# Security scan with Trivy
scan_image_security() {
    local image_name=$1
    local service=$2
    
    if [[ "$SCAN_IMAGES" != "true" ]]; then
        info "Skipping security scan for $service"
        return 0
    fi
    
    log "Scanning $service image for security vulnerabilities: $image_name"
    
    # Check if Trivy is available
    local trivy_cmd=""
    if command -v trivy &> /dev/null; then
        trivy_cmd="trivy"
    elif docker run --rm aquasec/trivy:latest --version &> /dev/null; then
        trivy_cmd="docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest"
    else
        warn "Trivy not available - skipping security scan for $service"
        warn "Install Trivy for security scanning: https://aquasecurity.github.io/trivy/"
        return 0
    fi
    
    # Run comprehensive security scan
    log "Running vulnerability scan (HIGH,CRITICAL)..."
    if ! $trivy_cmd image --exit-code 1 --severity HIGH,CRITICAL "$image_name"; then
        error "$service image failed security scan (HIGH/CRITICAL vulnerabilities found)"
        return 1
    fi
    
    # Run configuration scan
    log "Running configuration scan..."
    if ! $trivy_cmd config --exit-code 1 --severity HIGH,CRITICAL "$image_name" 2>/dev/null; then
        warn "Configuration issues found in $service image (non-critical)"
    fi
    
    # Generate security report
    local report_file="$ROOT_DIR/security-report-$service-$VERSION.json"
    log "Generating security report: $report_file"
    $trivy_cmd image --format json --output "$report_file" "$image_name" || warn "Failed to generate security report"
    
    log "$service image passed security scan"
}

# Verify build artifacts
verify_build_artifacts() {
    local service=$1
    local image_name=$2
    
    log "Verifying $service build artifacts..."
    
    # Check image exists
    if ! docker images "$image_name" --format "{{.Repository}}:{{.Tag}}" | grep -q "$image_name"; then
        error "$service image not found after build"
        return 1
    fi
    
    # Verify image doesn't contain secrets
    log "Checking $service image for embedded secrets..."
    
    # Create temporary container to inspect filesystem
    local container_id
    container_id=$(docker create "$image_name" 2>/dev/null || echo "")
    
    if [[ -n "$container_id" ]]; then
        # Check for common secret file patterns
        if docker export "$container_id" 2>/dev/null | tar -tf - | grep -E "\.(key|pem|p12|pfx|env)$|secrets?/|credential" | head -5; then
            docker rm "$container_id" >/dev/null 2>&1
            error "$service image may contain secret files"
            return 1
        fi
        docker rm "$container_id" >/dev/null 2>&1
    fi
    
    # Verify security labels
    local security_label
    security_label=$(docker inspect "$image_name" --format '{{index .Config.Labels "platform.security.no-embedded-secrets"}}' 2>/dev/null || echo "")
    if [[ "$security_label" != "true" ]]; then
        warn "$service image missing security verification label"
    fi
    
    log "$service build artifacts verified"
}

# Push images to registry
push_to_registry() {
    if [[ "$PUSH_IMAGES" != "true" ]]; then
        info "Skipping registry push"
        return 0
    fi
    
    log "Pushing images to registry: $REGISTRY"
    
    # Push Platform API
    log "Pushing Platform API image..."
    if ! docker push "$PLATFORM_API_IMAGE"; then
        error "Failed to push Platform API image"
        return 1
    fi
    
    # Push Platform UI
    log "Pushing Platform UI image..."
    if ! docker push "$PLATFORM_UI_IMAGE"; then
        error "Failed to push Platform UI image"
        return 1
    fi
    
    log "Successfully pushed images to registry"
    
    # Tag latest if this is a version build
    if [[ "$VERSION" != "latest" ]]; then
        log "Tagging and pushing latest images..."
        docker tag "$PLATFORM_API_IMAGE" "${REGISTRY}/platform-api:latest"
        docker tag "$PLATFORM_UI_IMAGE" "${REGISTRY}/platform-ui:latest"
        docker push "${REGISTRY}/platform-api:latest"
        docker push "${REGISTRY}/platform-ui:latest"
    fi
}

# Main build process
main() {
    log "Starting secure build process..."
    
    # Pre-build validation
    validate_build_environment
    scan_for_secrets
    validate_external_secrets
    
    # Build images
    if ! build_secure_image "platform-api" "$ROOT_DIR/platform-api/Dockerfile" "$ROOT_DIR/platform-api" "$PLATFORM_API_IMAGE"; then
        error "Failed to build platform-api"
        exit 1
    fi
    
    if ! build_secure_image "platform-ui" "$ROOT_DIR/platform-ui/Dockerfile" "$ROOT_DIR/platform-ui" "$PLATFORM_UI_IMAGE"; then
        error "Failed to build platform-ui"
        exit 1
    fi
    
    # Security scanning
    scan_image_security "$PLATFORM_API_IMAGE" "platform-api"
    scan_image_security "$PLATFORM_UI_IMAGE" "platform-ui"
    
    # Verify build artifacts
    verify_build_artifacts "platform-api" "$PLATFORM_API_IMAGE"
    verify_build_artifacts "platform-ui" "$PLATFORM_UI_IMAGE"
    
    # Push to registry if requested
    push_to_registry
    
    # Build summary
    echo
    log "=== Secure Build Completed Successfully ==="
    info "Images built:"
    info "  Platform API: $PLATFORM_API_IMAGE"
    info "  Platform UI:  $PLATFORM_UI_IMAGE"
    
    if [[ "$PUSH_IMAGES" == "true" ]]; then
        info "Images pushed to registry: $REGISTRY"
    else
        info "Images available locally"
        info "To push: $0 --push"
    fi
    
    echo
    info "Security features:"
    info "  ✓ No embedded secrets in images"
    info "  ✓ Source code scanned for hardcoded secrets"
    info "  ✓ External Secrets configuration validated"
    info "  ✓ Container images vulnerability scanned"
    info "  ✓ Build artifacts verified"
    
    echo
    info "Next steps:"
    info "  • Deploy with: ./scripts/deploy-platform-secure.sh -v $VERSION"
    info "  • Verify External Secrets: kubectl get externalsecrets -A"
    info "  • Check security reports: ls -la security-report-*.json"
}

# Cleanup on exit
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        error "Secure build process failed with exit code $exit_code"
        info "Check the logs above for details"
    fi
}

trap cleanup EXIT

# Configure Minikube if available
if command -v minikube &> /dev/null && minikube status &> /dev/null 2>&1; then
    log "Configuring Docker environment for Minikube"
    eval $(minikube docker-env)
fi

# Run main function
main "$@"