#!/bin/bash

# Platform services Minikube deployment script
# Handles building, tagging, and deploying to local Minikube cluster

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
BUILD_IMAGES=${BUILD_IMAGES:-"true"}
WAIT_FOR_READY=${WAIT_FOR_READY:-"true"}
TIMEOUT=${TIMEOUT:-"300"}

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -v, --version VERSION     Set image version tag (default: latest)"
    echo "  -n, --namespace NAMESPACE Set Kubernetes namespace (default: platform-system)"
    echo "  -s, --skip-build          Skip building images (use existing)"
    echo "  -w, --skip-wait           Skip waiting for deployment readiness"
    echo "  -t, --timeout SECONDS     Deployment timeout in seconds (default: 300)"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  VERSION                   Image version tag"
    echo "  NAMESPACE                 Kubernetes namespace"
    echo "  BUILD_IMAGES              Build images before deploy (true|false)"
    echo "  WAIT_FOR_READY            Wait for deployment readiness (true|false)"
    echo "  TIMEOUT                   Deployment timeout in seconds"
    echo ""
    echo "Examples:"
    echo "  # Full build and deploy"
    echo "  $0 -v v1.0.0"
    echo ""
    echo "  # Deploy existing images"
    echo "  $0 -v v1.0.0 -s"
    echo ""
    echo "  # Quick deploy without waiting"
    echo "  $0 -v dev -w"
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
        -s|--skip-build)
            BUILD_IMAGES="false"
            shift
            ;;
        -w|--skip-wait)
            WAIT_FOR_READY="false"
            shift
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
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

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Minikube
    if ! command -v minikube &> /dev/null; then
        error "Minikube is not installed"
        exit 1
    fi
    
    # Check if Minikube is running
    if ! minikube status &> /dev/null; then
        error "Minikube is not running. Start it with: minikube start"
        exit 1
    fi
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        exit 1
    fi
    
    # Configure kubectl for Minikube
    kubectl config use-context minikube &> /dev/null || {
        error "Failed to set kubectl context to minikube"
        exit 1
    }
    
    info "Prerequisites check passed"
}

# Build images if requested
build_images() {
    if [[ "$BUILD_IMAGES" != "true" ]]; then
        info "Skipping image build (using existing images)"
        return 0
    fi
    
    log "Building platform images for Minikube..."
    
    # Use Minikube's Docker daemon
    eval $(minikube docker-env)
    
    # Call the build script
    if ! "$SCRIPT_DIR/build-platform.sh" -v "$VERSION" -t production; then
        error "Failed to build images"
        exit 1
    fi
    
    log "Images built successfully"
}

# Create or update namespace
setup_namespace() {
    log "Setting up namespace: $NAMESPACE"
    
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        info "Namespace $NAMESPACE already exists"
    else
        kubectl apply -f "$ROOT_DIR/k8s/platform-api/namespace.yaml"
        log "Created namespace: $NAMESPACE"
    fi
}

# Update image tags in kustomization
update_kustomization() {
    log "Updating image tags to version: $VERSION"
    
    local kustomization_file="$ROOT_DIR/k8s/kustomization.yaml"
    local temp_file=$(mktemp)
    
    # Update image tags in kustomization.yaml
    sed "s/newTag: .*/newTag: $VERSION/g" "$kustomization_file" > "$temp_file"
    mv "$temp_file" "$kustomization_file"
    
    info "Updated kustomization.yaml with version: $VERSION"
}

# Deploy services
deploy_services() {
    log "Deploying platform services to Minikube..."
    
    # Apply all manifests using kustomize
    if ! kubectl apply -k "$ROOT_DIR/k8s/" --namespace "$NAMESPACE"; then
        error "Failed to deploy services"
        exit 1
    fi
    
    log "Services deployed successfully"
}

# Wait for deployments to be ready
wait_for_deployments() {
    if [[ "$WAIT_FOR_READY" != "true" ]]; then
        info "Skipping deployment readiness wait"
        return 0
    fi
    
    log "Waiting for deployments to be ready (timeout: ${TIMEOUT}s)..."
    
    local deployments=("platform-api" "platform-ui")
    
    for deployment in "${deployments[@]}"; do
        info "Waiting for deployment: $deployment"
        
        if ! kubectl wait --for=condition=available \
            --timeout="${TIMEOUT}s" \
            deployment/"$deployment" \
            --namespace "$NAMESPACE"; then
            error "Deployment $deployment failed to become ready"
            exit 1
        fi
        
        log "Deployment $deployment is ready"
    done
}

# Check pod status
check_pods() {
    log "Checking pod status..."
    
    kubectl get pods -n "$NAMESPACE" -o wide
    
    # Check if any pods are not running
    local failed_pods=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running --no-headers 2>/dev/null | wc -l)
    
    if [[ $failed_pods -gt 0 ]]; then
        warn "Some pods are not in Running state"
        kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running
        
        info "Pod logs for troubleshooting:"
        kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running --no-headers | while read pod _; do
            echo "--- Logs for $pod ---"
            kubectl logs "$pod" -n "$NAMESPACE" --tail=20 || true
        done
    else
        log "All pods are running successfully"
    fi
}

# Setup port forwarding
setup_port_forwarding() {
    log "Setting up port forwarding for local access..."
    
    # Kill existing port forwards
    pkill -f "kubectl.*port-forward" || true
    sleep 2
    
    # Port forward platform-api
    kubectl port-forward service/platform-api 3000:80 -n "$NAMESPACE" &
    local api_pid=$!
    
    # Port forward platform-ui
    kubectl port-forward service/platform-ui 8080:80 -n "$NAMESPACE" &
    local ui_pid=$!
    
    # Give port forwards time to establish
    sleep 3
    
    # Check if port forwards are working
    if kill -0 $api_pid 2>/dev/null && kill -0 $ui_pid 2>/dev/null; then
        log "Port forwarding setup completed"
        info "Platform API available at: http://localhost:3000"
        info "Platform UI available at: http://localhost:8080"
        info "To stop port forwarding: pkill -f 'kubectl.*port-forward'"
    else
        warn "Port forwarding may not be working properly"
    fi
}

# Provide access instructions
show_access_info() {
    echo
    log "Deployment completed successfully!"
    echo
    info "Access methods:"
    info "  1. Port forwarding (already setup):"
    info "     - Platform API: http://localhost:3000"
    info "     - Platform UI:  http://localhost:8080"
    echo
    info "  2. Minikube service (alternative):"
    info "     - minikube service platform-api -n $NAMESPACE"
    info "     - minikube service platform-ui -n $NAMESPACE"
    echo
    info "  3. kubectl port-forward (manual):"
    info "     - kubectl port-forward svc/platform-api 3000:80 -n $NAMESPACE"
    info "     - kubectl port-forward svc/platform-ui 8080:80 -n $NAMESPACE"
    echo
    info "Useful commands:"
    info "  - View pods: kubectl get pods -n $NAMESPACE"
    info "  - View services: kubectl get services -n $NAMESPACE"
    info "  - View logs: kubectl logs -f deployment/platform-api -n $NAMESPACE"
    info "  - Delete deployment: kubectl delete -k k8s/ --namespace $NAMESPACE"
    echo
    info "To test the API:"
    info "  curl http://localhost:3000/health"
    echo
}

# Main deployment process
main() {
    log "Starting Minikube deployment for platform services"
    info "Version: $VERSION"
    info "Namespace: $NAMESPACE"
    info "Build images: $BUILD_IMAGES"
    info "Wait for ready: $WAIT_FOR_READY"
    
    check_prerequisites
    build_images
    setup_namespace
    update_kustomization
    deploy_services
    wait_for_deployments
    check_pods
    setup_port_forwarding
    show_access_info
}

# Cleanup function
cleanup() {
    if [[ $? -ne 0 ]]; then
        error "Deployment failed!"
        info "Troubleshooting information:"
        kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -10
        exit 1
    fi
}

# Set trap for cleanup
trap cleanup EXIT

# Run main function
main