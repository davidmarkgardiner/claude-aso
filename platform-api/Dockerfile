# Multi-stage build for optimal image size and security
# Stage 1: Base dependencies (production only)
FROM node:20-alpine AS base

# Security: Install security updates and create non-root user early
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/* && \
    addgroup -g 1001 -S nodejs && \
    adduser -S platformapi -u 1001 -G nodejs

WORKDIR /app

# Copy package files with proper ownership
COPY --chown=platformapi:nodejs package*.json ./

# Install production dependencies only
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Stage 2: Development (for local development only)
FROM node:20-alpine AS development

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Create non-root user for development
RUN addgroup -g 1001 -S nodejs && \
    adduser -S platformapi -u 1001 -G nodejs

WORKDIR /app

# Copy package files
COPY --chown=platformapi:nodejs package*.json ./

# Install all dependencies (including dev)
RUN npm ci --no-audit --no-fund

# Copy source code
COPY --chown=platformapi:nodejs . .

# Switch to non-root user
USER platformapi

EXPOSE 3000

# Development command
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

# Stage 3: Build (compile TypeScript)
FROM node:20-alpine AS build

# Install build dependencies
RUN apk update && apk upgrade && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files, TypeScript config, and ESLint config
COPY package*.json tsconfig.json .eslintrc.js ./

# Install all dependencies for building
RUN npm ci --no-audit --no-fund

# Copy source code (excluding sensitive files via .dockerignore)
COPY src ./src

# Build the application
RUN npm run build && \
    npm run lint && \
    rm -rf node_modules

# Stage 4: Production (secure runtime)
FROM node:20-alpine AS production

# Security and metadata labels
LABEL org.opencontainers.image.title="Platform API"
LABEL org.opencontainers.image.description="Namespace-as-a-Service Platform API - External Secrets Enabled"
LABEL org.opencontainers.image.version="1.1.0"
LABEL org.opencontainers.image.authors="Platform Engineering Team"
LABEL org.opencontainers.image.vendor="Platform Engineering"
LABEL org.opencontainers.image.licenses="MIT"
LABEL platform.security.no-embedded-secrets="true"
LABEL platform.security.secrets-source="external-secrets"
LABEL platform.security.non-root="true"
LABEL platform.security.read-only-fs="supported"

# Install security updates and runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
        dumb-init \
        ca-certificates \
        tzdata && \
    rm -rf /var/cache/apk/*

# Create non-root user and group
RUN addgroup -g 1001 -S nodejs && \
    adduser -S platformapi -u 1001 -G nodejs

WORKDIR /app

# Copy production dependencies with proper ownership
COPY --from=base --chown=platformapi:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=build --chown=platformapi:nodejs /app/dist ./dist

# Copy package.json for runtime (no package-lock.json needed)
COPY --chown=platformapi:nodejs package.json ./

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs /app/tmp && \
    chown -R platformapi:nodejs /app && \
    chmod -R 755 /app && \
    chmod 700 /app/logs /app/tmp

# Create startup script to validate External Secrets
COPY --chown=platformapi:nodejs <<'STARTUP_SCRIPT' /usr/local/bin/startup.sh
#!/bin/sh
set -e

echo "[$(date)] Starting Platform API with External Secrets validation"

# Validate required environment variables are set (from External Secrets)
required_vars="NODE_ENV PORT JWT_SECRET"

for var in $required_vars; do
    if eval "[ -z \"\$$var\" ]"; then
        echo "[ERROR] Required environment variable $var is not set"
        echo "[ERROR] Ensure External Secrets are properly configured and synced"
        exit 1
    fi
done

echo "[$(date)] Environment validation passed"
echo "[$(date)] Starting application server"

# Start the application
exec node dist/server.js
STARTUP_SCRIPT

# Make startup script executable
RUN chmod +x /usr/local/bin/startup.sh

# Switch to non-root user
USER platformapi

# Enhanced health check that validates External Secrets
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e " \
        const http = require('http'); \
        const options = { \
            hostname: 'localhost', \
            port: process.env.PORT || 3000, \
            path: '/health', \
            timeout: 3000 \
        }; \
        const req = http.request(options, (res) => { \
            process.exit(res.statusCode === 200 ? 0 : 1); \
        }); \
        req.on('error', () => process.exit(1)); \
        req.on('timeout', () => { \
            req.destroy(); \
            process.exit(1); \
        }); \
        req.end(); \
    "

# Expose port (configurable via environment)
EXPOSE 3000

# Security: Use dumb-init and custom startup script
ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/startup.sh"]