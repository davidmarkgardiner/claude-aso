#!/bin/bash

# Platform services build script with version tagging
# Supports building for Minikube and registry deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
VERSION=${VERSION:-"latest"}
NAMESPACE=${NAMESPACE:-"platform-system"}
REGISTRY=${REGISTRY:-""}
BUILD_TARGET=${BUILD_TARGET:-"production"}
SCAN_IMAGES=${SCAN_IMAGES:-"true"}

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -v, --version VERSION     Set image version tag (default: latest)"
    echo "  -n, --namespace NAMESPACE Set Kubernetes namespace (default: platform-system)"
    echo "  -r, --registry REGISTRY   Set container registry prefix"
    echo "  -t, --target TARGET       Build target: development|production (default: production)"
    echo "  -s, --skip-scan           Skip security scanning"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  VERSION                   Image version tag"
    echo "  NAMESPACE                 Kubernetes namespace"
    echo "  REGISTRY                  Container registry prefix"
    echo "  BUILD_TARGET              Build target (development|production)"
    echo "  SCAN_IMAGES               Enable/disable security scanning (true|false)"
    echo ""
    echo "Examples:"
    echo "  # Build for Minikube"
    echo "  $0 -v v1.0.0"
    echo ""
    echo "  # Build for registry"
    echo "  $0 -v v1.0.0 -r docker.io/myuser"
    echo ""
    echo "  # Build development images"
    echo "  $0 -t development -v dev"
}

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

# Set image names
if [[ -n "$REGISTRY" ]]; then
    PLATFORM_API_IMAGE="${REGISTRY}/platform-api:${VERSION}"
    PLATFORM_UI_IMAGE="${REGISTRY}/platform-ui:${VERSION}"
else
    PLATFORM_API_IMAGE="platform-api:${VERSION}"
    PLATFORM_UI_IMAGE="platform-ui:${VERSION}"
fi

log "Starting platform services build"
info "Version: $VERSION"
info "Namespace: $NAMESPACE"
info "Registry: ${REGISTRY:-'(none - local build)'}"
info "Build target: $BUILD_TARGET"
info "Security scanning: $SCAN_IMAGES"

# Check if Minikube is running and configure Docker environment
if command -v minikube &> /dev/null && minikube status &> /dev/null; then
    log "Configuring Docker environment for Minikube"
    eval $(minikube docker-env)
    info "Using Minikube Docker daemon"
fi

# Check Docker is available
if ! command -v docker &> /dev/null; then
    error "Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    error "Docker daemon is not running"
    exit 1
fi

# Security scanner check
check_security_scanner() {
    if [[ "$SCAN_IMAGES" == "true" ]]; then
        if command -v trivy &> /dev/null; then
            return 0
        elif command -v docker &> /dev/null && docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest --version &> /dev/null; then
            return 0
        else
            warn "Security scanner (trivy) not available. Skipping security scan"
            SCAN_IMAGES="false"
        fi
    fi
}

# Build function with error handling
build_image() {
    local service=$1
    local dockerfile_path=$2
    local context_path=$3
    local image_name=$4
    
    log "Building $service image: $image_name"
    
    # Check if Dockerfile exists
    if [[ ! -f "$dockerfile_path" ]]; then
        error "Dockerfile not found: $dockerfile_path"
        return 1
    fi
    
    # Build with BuildKit and multi-stage target
    DOCKER_BUILDKIT=1 docker build \
        --target "$BUILD_TARGET" \
        --tag "$image_name" \
        --file "$dockerfile_path" \
        --label "org.opencontainers.image.created=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
        --label "org.opencontainers.image.version=$VERSION" \
        --label "org.opencontainers.image.source=https://github.com/davidmarkgardiner/claude-aso" \
        "$context_path"
    
    if [[ $? -eq 0 ]]; then
        log "Successfully built $service image"
        
        # Get image size
        local image_size=$(docker images "$image_name" --format "table {{.Size}}" | tail -n 1)
        info "$service image size: $image_size"
        
        return 0
    else
        error "Failed to build $service image"
        return 1
    fi
}

# Security scan function
scan_image() {
    local image_name=$1
    local service=$2
    
    if [[ "$SCAN_IMAGES" != "true" ]]; then
        return 0
    fi
    
    log "Scanning $service image for vulnerabilities: $image_name"
    
    if command -v trivy &> /dev/null; then
        trivy image --exit-code 1 --severity HIGH,CRITICAL "$image_name"
    else
        docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:latest image --exit-code 1 --severity HIGH,CRITICAL "$image_name"
    fi
    
    local scan_result=$?
    if [[ $scan_result -eq 0 ]]; then
        log "$service image passed security scan"
    else
        error "$service image failed security scan"
        return 1
    fi
}

# Main build process
main() {
    log "Starting build process..."
    
    # Check prerequisites
    check_security_scanner
    
    # Build platform-api
    if ! build_image "platform-api" "$ROOT_DIR/platform-api/Dockerfile" "$ROOT_DIR/platform-api" "$PLATFORM_API_IMAGE"; then
        error "Failed to build platform-api"
        exit 1
    fi
    
    # Build platform-ui
    if ! build_image "platform-ui" "$ROOT_DIR/platform-ui/Dockerfile" "$ROOT_DIR/platform-ui" "$PLATFORM_UI_IMAGE"; then
        error "Failed to build platform-ui"
        exit 1
    fi
    
    # Security scanning
    if [[ "$SCAN_IMAGES" == "true" ]]; then
        log "Starting security scans..."
        
        if ! scan_image "$PLATFORM_API_IMAGE" "platform-api"; then
            error "Security scan failed for platform-api"
            exit 1
        fi
        
        if ! scan_image "$PLATFORM_UI_IMAGE" "platform-ui"; then
            error "Security scan failed for platform-ui"
            exit 1
        fi
    fi
    
    # Push to registry if specified
    if [[ -n "$REGISTRY" ]]; then
        log "Pushing images to registry..."
        
        if ! docker push "$PLATFORM_API_IMAGE"; then
            error "Failed to push platform-api image"
            exit 1
        fi
        
        if ! docker push "$PLATFORM_UI_IMAGE"; then
            error "Failed to push platform-ui image"
            exit 1
        fi
        
        log "Successfully pushed images to registry"
    fi
    
    # Display build summary
    echo
    log "Build completed successfully!"
    info "Images built:"
    info "  Platform API: $PLATFORM_API_IMAGE"
    info "  Platform UI:  $PLATFORM_UI_IMAGE"
    
    if [[ -n "$REGISTRY" ]]; then
        info "Images pushed to registry: $REGISTRY"
    else
        info "Images available locally (Minikube compatible)"
    fi
    
    echo
    info "To deploy to Minikube:"
    info "  ./scripts/deploy-minikube.sh -v $VERSION"
    
    if [[ -n "$REGISTRY" ]]; then
        echo
        info "To deploy to production cluster:"
        info "  kubectl apply -k k8s/ --namespace $NAMESPACE"
    fi
}

# Cleanup function
cleanup() {
    if [[ $? -ne 0 ]]; then
        error "Build process failed!"
        info "Check the logs above for more details"
        exit 1
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Run main function
main