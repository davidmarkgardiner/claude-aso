# Multi-stage build for optimal image size
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine AS production
LABEL org.opencontainers.image.title="Platform API"
LABEL org.opencontainers.image.description="Namespace-as-a-Service Platform API"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Platform Engineering Team"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S platformapi -u 1001

WORKDIR /app

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Copy production dependencies
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./

# Create logs directory
RUN mkdir -p /app/logs && \
    chown -R platformapi:nodejs /app

# Switch to non-root user
USER platformapi

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1); \
    }).on('error', () => process.exit(1))"

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]