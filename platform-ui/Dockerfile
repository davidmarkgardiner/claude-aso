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
EXPOSE 5173
CMD ["npm", "run", "dev"]

# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig*.json vite.config.ts postcss.config.js tailwind.config.js ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY index.html ./
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS production
LABEL org.opencontainers.image.title="Platform UI"
LABEL org.opencontainers.image.description="Namespace-as-a-Service Platform UI"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Platform Engineering Team"

# Create non-root user (nginx group already exists)
RUN adduser -S platformui -u 1001 -G nginx

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application
COPY --from=build /app/dist /usr/share/nginx/html

# Create necessary directories and set permissions
RUN mkdir -p /var/cache/nginx && \
    mkdir -p /var/log/nginx && \
    mkdir -p /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R platformui:nginx /var/cache/nginx && \
    chown -R platformui:nginx /var/log/nginx && \
    chown -R platformui:nginx /var/run/nginx.pid && \
    chown -R platformui:nginx /usr/share/nginx/html && \
    chown -R platformui:nginx /etc/nginx

# Switch to non-root user
USER platformui

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

EXPOSE 8080

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["nginx", "-g", "daemon off;"]