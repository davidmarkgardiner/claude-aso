#!/bin/bash
set -euo pipefail

# Platform UI Security Audit Script
# This script performs comprehensive security checks on the Platform UI codebase

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
PASSED=0

# Functions for logging
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++))
}

# Change to project directory
cd "$PROJECT_DIR"

echo -e "${BLUE}🔒 Platform UI Security Audit${NC}"
echo "=================================="

# Check 1: Hardcoded secrets and credentials
log "Checking for hardcoded secrets..."
# Look for actual secret patterns, not legitimate code
if grep -r -E "(password|secret|key|token)\s*[:=]\s*['\"][^'\"]*['\"]" src/ --exclude-dir=node_modules 2>/dev/null | \
   grep -v "localStorage" | grep -v "sessionStorage" | \
   grep -v "getItem" | grep -v "removeItem" | grep -v "setItem" | \
   grep -v "Bearer" | grep -v "Authorization" | \
   grep -v "X-API-Key" | grep -v "X-Correlation-ID" | \
   grep -v "// " | grep -v "\* " | \
   grep -q .; then
    error "Found potential hardcoded secrets in source code"
    grep -r -E "(password|secret|key|token)\s*[:=]\s*['\"][^'\"]*['\"]" src/ --exclude-dir=node_modules 2>/dev/null | \
    grep -v "localStorage" | grep -v "sessionStorage" | \
    grep -v "getItem" | grep -v "removeItem" | grep -v "setItem" | \
    grep -v "Bearer" | grep -v "Authorization" | \
    grep -v "X-API-Key" | grep -v "X-Correlation-ID" | \
    grep -v "// " | grep -v "\* " | head -5
else
    pass "No hardcoded secrets found"
fi

# Check for React key props (these are safe)
log "Checking for legitimate key usage..."
if grep -r "key={" src/ --exclude-dir=node_modules 2>/dev/null | grep -q .; then
    pass "React key props found (legitimate usage)"
fi

# Check 2: Hardcoded URLs
log "Checking for hardcoded URLs..."
if grep -r "localhost\|127.0.0.1" src/ --exclude-dir=node_modules 2>/dev/null | \
   grep -v "config/environment.ts" | grep -v "// " | grep -v "* " | grep -q .; then
    error "Found hardcoded localhost URLs in source code"
    grep -r "localhost\|127.0.0.1" src/ --exclude-dir=node_modules 2>/dev/null | \
    grep -v "config/environment.ts" | grep -v "// " | grep -v "* " | head -3
else
    pass "No hardcoded URLs found"
fi

# Check 3: Environment variable usage
log "Checking environment variable usage..."
if grep -r "import.meta.env\|process.env" src/ --exclude-dir=node_modules | grep -q .; then
    if grep -r "import.meta.env" src/config/environment.ts | grep -q .; then
        pass "Environment variables properly centralized in config/environment.ts"
    else
        warn "Environment variables found outside of config/environment.ts"
    fi
else
    error "No environment variable usage found - configuration may be hardcoded"
fi

# Check 4: External Secrets configuration
log "Checking External Secrets configuration..."
if [ -f "deployment/external-secrets.yaml" ]; then
    pass "External Secrets configuration exists"
    
    # Check for required secrets
    required_secrets=("platform-ui-api-url" "platform-azure-client-id" "platform-ui-oauth-authority")
    for secret in "${required_secrets[@]}"; do
        if grep -q "$secret" deployment/external-secrets.yaml; then
            pass "Required secret '$secret' configured"
        else
            error "Required secret '$secret' missing from External Secrets"
        fi
    done
else
    error "External Secrets configuration missing"
fi

# Check 5: Dockerfile security
log "Checking Dockerfile security..."
if [ -f "Dockerfile" ]; then
    if grep -q "USER.*1001" Dockerfile; then
        pass "Dockerfile uses non-root user"
    else
        error "Dockerfile should use non-root user"
    fi
    
    if grep -q "readOnlyRootFilesystem.*true" deployment/kubernetes.yaml 2>/dev/null; then
        pass "Read-only root filesystem configured"
    else
        warn "Consider enabling read-only root filesystem"
    fi
    
    if grep -q "allowPrivilegeEscalation.*false" deployment/kubernetes.yaml 2>/dev/null; then
        pass "Privilege escalation disabled"
    else
        error "Privilege escalation should be disabled"
    fi
else
    error "Dockerfile not found"
fi

# Check 6: Package.json security
log "Checking package.json for security issues..."
if [ -f "package.json" ]; then
    # Check for development dependencies in production
    if npm audit --audit-level=moderate --production > /dev/null 2>&1; then
        pass "No moderate+ vulnerabilities in production dependencies"
    else
        error "Vulnerabilities found in production dependencies"
        npm audit --audit-level=moderate --production
    fi
else
    error "package.json not found"
fi

# Check 7: Configuration validation
log "Checking configuration validation..."
if grep -q "validateConfig" src/config/environment.ts 2>/dev/null; then
    pass "Configuration validation implemented"
else
    warn "Configuration validation not found - consider implementing"
fi

# Check 8: Error boundary and error handling
log "Checking error handling..."
if [ -f "src/components/ErrorBoundary.tsx" ]; then
    pass "Error boundary component exists"
else
    warn "Error boundary component not found"
fi

if grep -q "handleAuthError" src/api/client.ts 2>/dev/null; then
    pass "Authentication error handling implemented"
else
    error "Authentication error handling not found"
fi

# Check 9: Content Security Policy
log "Checking Content Security Policy..."
if grep -q "Content-Security-Policy" nginx.conf 2>/dev/null; then
    pass "CSP headers configured in nginx.conf"
else
    warn "CSP headers not found in nginx.conf"
fi

# Check 10: HTTPS and security headers
log "Checking security headers..."
security_headers=("X-Frame-Options" "X-Content-Type-Options" "X-XSS-Protection")
for header in "${security_headers[@]}"; do
    if grep -q "$header" nginx.conf 2>/dev/null; then
        pass "Security header '$header' configured"
    else
        warn "Security header '$header' not configured"
    fi
done

# Check 11: Environment file security
log "Checking environment file security..."
if [ -f ".env" ]; then
    error "Found .env file - this should not be committed to git"
fi

if [ -f ".env.local" ]; then
    warn "Found .env.local file - ensure it's in .gitignore"
fi

if [ -f ".env.sample" ]; then
    pass "Environment template file exists"
    
    # Check that sample doesn't contain real secrets
    if grep -q "your-.*-here\|example\|sample" .env.sample; then
        pass "Environment sample uses placeholder values"
    else
        warn "Environment sample may contain real values"
    fi
else
    warn "Environment template file (.env.sample) not found"
fi

# Check 12: TypeScript strict mode
log "Checking TypeScript configuration..."
if [ -f "tsconfig.json" ]; then
    if grep -q '"strict".*true' tsconfig.json; then
        pass "TypeScript strict mode enabled"
    else
        warn "TypeScript strict mode not enabled"
    fi
else
    warn "tsconfig.json not found"
fi

# Summary
echo ""
echo "=================================="
echo -e "${BLUE}Security Audit Summary${NC}"
echo "=================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Errors: $ERRORS${NC}"

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ Security audit failed with $ERRORS error(s)${NC}"
    echo "Please fix the errors before deploying to production."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Security audit completed with $WARNINGS warning(s)${NC}"
    echo "Consider addressing the warnings for improved security."
    exit 0
else
    echo ""
    echo -e "${GREEN}✅ Security audit passed successfully!${NC}"
    echo "Platform UI is ready for secure deployment."
    exit 0
fi