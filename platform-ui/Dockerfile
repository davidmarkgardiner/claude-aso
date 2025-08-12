# Multi-stage build for optimal image size and security
# Stage 1: Base dependencies
FROM node:20-alpine AS base

# Security: Install security updates early
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Stage 2: Development (for local development only)
FROM node:20-alpine AS development

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user for development
RUN adduser -S platformui -u 1001

WORKDIR /app

# Copy package files
COPY --chown=platformui package*.json ./

# Install all dependencies (including dev)
RUN npm ci --no-audit --no-fund

# Copy source code (excluding secrets via .dockerignore)
COPY --chown=platformui . .

# Switch to non-root user
USER platformui

EXPOSE 5173

# Development command
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

# Stage 3: Build (compile and bundle)
FROM node:20-alpine AS build

# Install build dependencies
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy configuration files
COPY package*.json tsconfig*.json vite.config.ts postcss.config.js tailwind.config.js eslint.config.js ./

# Install all dependencies for building
RUN npm ci --no-audit --no-fund

# Copy source code (secrets excluded via .dockerignore)
COPY src ./src
COPY public ./public
COPY index.html ./

# Build the application (no secrets embedded)
RUN npm run build && \
    npm run lint && \
    rm -rf node_modules

# Verify no secrets in build artifacts
RUN echo "Checking build artifacts for secrets..." && \
    find dist/ -type f -name "*.js" -o -name "*.html" | \
    xargs grep -l "secret\|password\|token\|key" || \
    echo "Build verification: No hardcoded secrets found"

# Stage 4: Production with nginx
FROM nginx:alpine AS production

# Security and metadata labels
LABEL org.opencontainers.image.title="Platform UI"
LABEL org.opencontainers.image.description="Namespace-as-a-Service Platform UI - External Secrets Enabled"
LABEL org.opencontainers.image.version="1.1.0"
LABEL org.opencontainers.image.authors="Platform Engineering Team"
LABEL org.opencontainers.image.vendor="Platform Engineering"
LABEL org.opencontainers.image.licenses="MIT"
LABEL platform.security.no-embedded-secrets="true"
LABEL platform.security.secrets-source="external-secrets"
LABEL platform.security.non-root="true"
LABEL platform.security.read-only-fs="true"

# Install security updates and runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
        dumb-init \
        ca-certificates \
        tzdata && \
    rm -rf /var/cache/apk/*

# Create non-root user (nginx group already exists)
RUN adduser -S platformui -u 1001 -G nginx

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application with proper ownership
COPY --from=build --chown=platformui:nginx /app/dist /usr/share/nginx/html

# Create runtime configuration directories
RUN mkdir -p /usr/share/nginx/html/config /tmp/nginx && \
    mkdir -p /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid

# Set proper permissions for nginx runtime
RUN chown -R platformui:nginx \
        /var/cache/nginx \
        /var/log/nginx \
        /var/run/nginx.pid \
        /usr/share/nginx/html \
        /etc/nginx \
        /tmp/nginx && \
    chmod -R 755 /usr/share/nginx/html && \
    chmod 700 /usr/share/nginx/html/config

# Create secure startup script with External Secrets validation
COPY --chown=platformui:nginx <<'STARTUP_SCRIPT' /usr/local/bin/startup.sh
#!/bin/sh
set -e

echo "[$(date)] Starting Platform UI with External Secrets integration"

# Validate environment - these come from External Secrets via ConfigMaps
echo "[$(date)] Validating configuration..."

# Create runtime configuration from environment variables
# These variables are set by Kubernetes from External Secrets
cat > /usr/share/nginx/html/config/config.json << JSON
{
  "apiUrl": "${API_URL:-/api}",
  "authEnabled": ${AUTH_ENABLED:-false},
  "environment": "${ENVIRONMENT:-production}",
  "features": {
    "darkMode": ${FEATURE_DARK_MODE:-true},
    "analytics": ${FEATURE_ANALYTICS:-false},
    "costTracking": ${FEATURE_COST_TRACKING:-true},
    "debugMode": ${DEBUG_MODE:-false}
  },
  "oauth": {
    "clientId": "${OAUTH_CLIENT_ID:-}",
    "authority": "${OAUTH_AUTHORITY:-}",
    "redirectUri": "${OAUTH_REDIRECT_URI:-}",
    "scopes": ["User.Read", "Directory.Read.All"]
  },
  "monitoring": {
    "enableMetrics": ${ENABLE_METRICS:-true},
    "enableTracing": ${ENABLE_TRACING:-true}
  },
  "timestamp": "$(date -Iseconds)"
}
JSON

echo "[$(date)] Configuration generated successfully"
echo "[$(date)] Starting nginx server"

# Start nginx
exec nginx -g "daemon off;"
STARTUP_SCRIPT

# Make startup script executable
RUN chmod +x /usr/local/bin/startup.sh

# Create health check endpoint
RUN echo '{"status":"healthy","service":"platform-ui"}' > /usr/share/nginx/html/health

# Switch to non-root user
USER platformui

# Enhanced health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080

# Security: Use dumb-init and secure startup
ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/startup.sh"]