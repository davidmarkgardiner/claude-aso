# Platform API Build and Deployment Instructions

## Option 1: Manual Build and Push (Local)

If you have Docker installed locally, run these commands:

```bash
# Navigate to platform-api directory
cd platform-api

# Build the image
docker build -t davidgardiner/platform-api:latest --target production .

# Login to Docker Hub (you'll need to provide credentials)
docker login

# Push the image
docker push davidgardiner/platform-api:latest
```

## Option 2: Using GitHub Actions (Recommended)

1. **Set up Docker Hub secrets in GitHub:**
   - Go to your repository settings → Secrets and variables → Actions
   - Add these secrets:
     - `DOCKER_USERNAME`: Your Docker Hub username
     - `DOCKER_PASSWORD`: Your Docker Hub password or access token

2. **Trigger the build:**
   - Push your changes to the `experiment/test-cluster-build` branch
   - Or manually trigger the workflow in GitHub Actions tab

3. **The workflow will:**
   - Build the Platform API image
   - Push it to `davidgardiner/platform-api:latest`
   - Run security scanning with Trivy

## Option 3: Quick Test with Pre-built Node Image

For immediate testing, you can temporarily use a generic Node.js image:

```bash
# Update the deployment image temporarily
kubectl patch deployment platform-api -n platform-system -p '{"spec":{"template":{"spec":{"containers":[{"name":"platform-api","image":"node:18-alpine","command":["sh","-c","while true; do sleep 30; done;"]}]}}}}'
```

## After Image is Built

Once the image is available, update the deployment:

```bash
# Update deployment to use the pushed image
kubectl patch deployment platform-api -n platform-system -p '{"spec":{"template":{"spec":{"containers":[{"name":"platform-api","image":"davidgardiner/platform-api:latest"}]}}}}'

# Check deployment status
kubectl get pods -n platform-system
kubectl logs -f deployment/platform-api -n platform-system
```

## Troubleshooting

If you encounter issues:

```bash
# Check pod status
kubectl describe pod -l app=platform-api -n platform-system

# Check events
kubectl get events -n platform-system --sort-by='.lastTimestamp'

# Check deployment
kubectl describe deployment platform-api -n platform-system
```
