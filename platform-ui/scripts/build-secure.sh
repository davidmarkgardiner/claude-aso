#!/bin/bash
set -euo pipefail

# Platform UI Secure Build Script
# This script builds the UI with security validations and secret checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Platform UI secure build...${NC}"

# Function to log messages
log() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check for required tools
command -v npm >/dev/null 2>&1 || error "npm is required but not installed"
command -v docker >/dev/null 2>&1 || error "docker is required but not installed"

# Change to project directory
cd "$PROJECT_DIR"

# Validate environment
log "Validating build environment..."

# Check that we're not building with development secrets
if [ -f ".env.local" ]; then
    warn "Found .env.local file - ensure it doesn't contain production secrets"
    if grep -q "localhost" .env.local; then
        warn "Found localhost URLs in .env.local - this should not be used in production"
    fi
fi

# Check for hardcoded secrets in source code
log "Scanning for hardcoded secrets..."
if grep -r "localhost" src/ --exclude-dir=node_modules 2>/dev/null | grep -v "// FIXME" | grep -v "// TODO"; then
    error "Found hardcoded localhost URLs in source code"
fi

# Check for API keys or secrets in source
if grep -ri "api.*key\|secret\|password\|token" src/ --exclude-dir=node_modules 2>/dev/null | grep -v "auth_token" | grep -v "getAuthToken" | grep -v "localStorage" | grep -v "// FIXME" | grep -v "// TODO"; then
    warn "Found potential secrets in source code - please review"
fi

# Validate package.json for security
log "Validating package dependencies..."
if npm audit --audit-level=high --production; then
    log "✅ No high-severity vulnerabilities found"
else
    error "❌ High-severity vulnerabilities found - please fix before building"
fi

# Install dependencies
log "Installing dependencies..."
npm ci --production=false

# Run linting
log "Running linting checks..."
npm run lint

# Set build environment variables
export NODE_ENV=production
export VITE_BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export VITE_BUILD_VERSION=${BUILD_VERSION:-"1.0.0"}
export VITE_BUILD_COMMIT=${BUILD_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")}

# Build the application
log "Building application..."
npm run build

# Validate build output
log "Validating build output..."
if [ ! -d "dist" ]; then
    error "Build failed - dist directory not found"
fi

if [ ! -f "dist/index.html" ]; then
    error "Build failed - index.html not found"
fi

# Check for source maps in production build
if find dist -name "*.map" | grep -q .; then
    warn "Source maps found in production build - consider removing for security"
fi

# Check build size
BUILD_SIZE=$(du -sh dist | cut -f1)
log "Build size: $BUILD_SIZE"

# Create build manifest
cat > dist/build-manifest.json << EOF
{
  "buildDate": "$VITE_BUILD_DATE",
  "buildVersion": "$VITE_BUILD_VERSION",
  "buildCommit": "$VITE_BUILD_COMMIT",
  "buildSize": "$BUILD_SIZE",
  "nodeEnv": "$NODE_ENV"
}
EOF

# Build Docker image if requested
if [ "${BUILD_DOCKER:-false}" = "true" ]; then
    log "Building Docker image..."
    
    IMAGE_TAG=${IMAGE_TAG:-"platform-ui:latest"}
    
    docker build \
        --build-arg BUILD_VERSION="$VITE_BUILD_VERSION" \
        --build-arg BUILD_DATE="$VITE_BUILD_DATE" \
        --build-arg BUILD_COMMIT="$VITE_BUILD_COMMIT" \
        -t "$IMAGE_TAG" \
        .
    
    log "Docker image built: $IMAGE_TAG"
    
    # Test the Docker image
    log "Testing Docker image..."
    CONTAINER_ID=$(docker run -d -p 0:8080 "$IMAGE_TAG")
    sleep 5
    
    # Get the mapped port
    PORT=$(docker port "$CONTAINER_ID" 8080 | cut -d: -f2)
    
    if curl -f "http://localhost:$PORT/health" >/dev/null 2>&1; then
        log "✅ Docker image health check passed"
    else
        error "❌ Docker image health check failed"
    fi
    
    # Cleanup test container
    docker stop "$CONTAINER_ID" >/dev/null
    docker rm "$CONTAINER_ID" >/dev/null
fi

echo -e "${GREEN}✅ Platform UI build completed successfully!${NC}"
echo -e "${GREEN}📦 Build artifacts are in the 'dist' directory${NC}"

if [ "${BUILD_DOCKER:-false}" = "true" ]; then
    echo -e "${GREEN}🐳 Docker image: $IMAGE_TAG${NC}"
fi

# Print security reminders
echo -e "\n${YELLOW}🔒 Security Reminders:${NC}"
echo "  • Ensure runtime configuration is injected via External Secrets"
echo "  • Verify no hardcoded secrets are in the build"
echo "  • Use HTTPS in production"
echo "  • Configure proper CSP headers"
echo "  • Enable security headers in nginx.conf"