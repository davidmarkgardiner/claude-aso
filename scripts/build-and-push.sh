#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="davidgardiner/platform-api:latest"

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

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH"
    log_info "Please install Docker and try again"
    exit 1
fi

# Check if we're in the right directory
if [[ ! -f "$PROJECT_ROOT/platform-api/Dockerfile" ]]; then
    log_error "Dockerfile not found in platform-api directory"
    exit 1
fi

log_info "Building Platform API Docker image..."
log_info "Image: $IMAGE_NAME"

# Build the image
cd "$PROJECT_ROOT/platform-api"
docker build -t "$IMAGE_NAME" --target production .

log_success "Image built successfully!"

# Check if user is logged in to Docker Hub
if ! docker info | grep -q "Username:"; then
    log_warning "You may need to login to Docker Hub first"
    log_info "Run: docker login"
    read -p "Do you want to continue with push? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping push. You can push later with: docker push $IMAGE_NAME"
        exit 0
    fi
fi

# Push the image
log_info "Pushing image to Docker Hub..."
docker push "$IMAGE_NAME"

log_success "Image pushed successfully!"

# Update the deployment
log_info "Updating Kubernetes deployment..."
kubectl patch deployment platform-api -n platform-system -p "{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"platform-api\",\"image\":\"$IMAGE_NAME\"}]}}}}"

log_success "Deployment updated!"

# Check deployment status
log_info "Checking deployment status..."
kubectl rollout status deployment/platform-api -n platform-system --timeout=300s

log_success "Platform API deployment completed!"
log_info "You can check the pods with: kubectl get pods -n platform-system"