#!/usr/bin/env node

/**
 * Simple Platform API starter for Minikube testing
 * This bypasses some of the complex TypeScript compilation issues
 */

// Set environment variables for Minikube
process.env.NODE_ENV = 'development';
process.env.PORT = '3000';
process.env.KUBE_CONTEXT = 'minikube';
process.env.KUBE_NAMESPACE = 'default';
process.env.JWT_SECRET = 'test-secret-key-for-minikube';
process.env.LOG_LEVEL = 'info';
process.env.LOG_FORMAT = 'simple';
process.env.PLATFORM_COST_TRACKING = 'false';
process.env.DB_SSL = 'false';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:7007';

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Platform API for Minikube testing...');
console.log('Environment Configuration:');
console.log(`   KUBE_CONTEXT: ${process.env.KUBE_CONTEXT}`);
console.log(`   KUBE_NAMESPACE: ${process.env.KUBE_NAMESPACE}`);
console.log(`   PORT: ${process.env.PORT}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);

const platformApiPath = path.join(__dirname, 'platform-api');

// Try to start with npm run dev first
const child = spawn('npm', ['run', 'dev'], {
    cwd: platformApiPath,
    stdio: 'inherit',
    env: process.env,
    shell: true
});

child.on('error', (error) => {
    console.error(`Failed to start Platform API: ${error.message}`);
    process.exit(1);
});

child.on('close', (code) => {
    console.log(`Platform API exited with code ${code}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down Platform API...');
    child.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down Platform API...');
    child.kill('SIGTERM');
    process.exit(0);
});