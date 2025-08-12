#!/bin/bash

# Platform API Deployment Validation Script
# This script validates the production deployment of Platform API v1.1.0

set -e

NAMESPACE="platform-system"
APP_NAME="platform-api"
IMAGE_VERSION="v1.1.0"

echo "🚀 Platform API v1.1.0 Deployment Validation"
echo "=============================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl not found. Please install kubectl first.${NC}"
    exit 1
fi

# Check if namespace exists
echo
print_info "Checking namespace..."
kubectl get namespace $NAMESPACE &> /dev/null
print_status $? "Namespace '$NAMESPACE' exists"

# Check if all resources exist
echo
print_info "Checking Kubernetes resources..."

# Check deployment
kubectl get deployment $APP_NAME -n $NAMESPACE &> /dev/null
print_status $? "Deployment '$APP_NAME' exists"

# Check service
kubectl get service $APP_NAME -n $NAMESPACE &> /dev/null
print_status $? "Service '$APP_NAME' exists"

# Check service account
kubectl get serviceaccount $APP_NAME -n $NAMESPACE &> /dev/null
print_status $? "ServiceAccount '$APP_NAME' exists"

# Check HPA
kubectl get hpa ${APP_NAME}-hpa -n $NAMESPACE &> /dev/null
print_status $? "HorizontalPodAutoscaler '${APP_NAME}-hpa' exists"

# Check PDB
kubectl get pdb ${APP_NAME}-pdb -n $NAMESPACE &> /dev/null
print_status $? "PodDisruptionBudget '${APP_NAME}-pdb' exists"

# Check RBAC
kubectl get clusterrole ${APP_NAME}-cluster-role &> /dev/null
print_status $? "ClusterRole '${APP_NAME}-cluster-role' exists"

kubectl get clusterrolebinding ${APP_NAME}-cluster-role-binding &> /dev/null
print_status $? "ClusterRoleBinding '${APP_NAME}-cluster-role-binding' exists"

# Check External Secrets
kubectl get secretstore azure-keyvault-store -n $NAMESPACE &> /dev/null
print_status $? "SecretStore 'azure-keyvault-store' exists"

kubectl get externalsecret ${APP_NAME}-secrets -n $NAMESPACE &> /dev/null
print_status $? "ExternalSecret '${APP_NAME}-secrets' exists"

# Check ConfigMaps
kubectl get configmap ${APP_NAME}-config -n $NAMESPACE &> /dev/null
print_status $? "ConfigMap '${APP_NAME}-config' exists"

kubectl get configmap ${APP_NAME}-azure-cm -n $NAMESPACE &> /dev/null
print_status $? "ConfigMap '${APP_NAME}-azure-cm' exists"

# Check Istio resources
echo
print_info "Checking Istio resources..."

kubectl get virtualservice ${APP_NAME}-vs -n $NAMESPACE &> /dev/null
print_status $? "VirtualService '${APP_NAME}-vs' exists"

kubectl get destinationrule ${APP_NAME}-dr -n $NAMESPACE &> /dev/null
print_status $? "DestinationRule '${APP_NAME}-dr' exists"

kubectl get peerauthentication ${APP_NAME}-mtls -n $NAMESPACE &> /dev/null
print_status $? "PeerAuthentication '${APP_NAME}-mtls' exists"

kubectl get authorizationpolicy ${APP_NAME}-authz -n $NAMESPACE &> /dev/null
print_status $? "AuthorizationPolicy '${APP_NAME}-authz' exists"

# Check NetworkPolicy
kubectl get networkpolicy ${APP_NAME}-ingress -n $NAMESPACE &> /dev/null
print_status $? "NetworkPolicy '${APP_NAME}-ingress' exists"

# Check monitoring resources
echo
print_info "Checking monitoring resources..."

kubectl get servicemonitor ${APP_NAME}-monitor -n $NAMESPACE &> /dev/null
print_status $? "ServiceMonitor '${APP_NAME}-monitor' exists"

kubectl get prometheusrule ${APP_NAME}-alerts -n $NAMESPACE &> /dev/null
print_status $? "PrometheusRule '${APP_NAME}-alerts' exists"

# Check pod status
echo
print_info "Checking pod status..."

PODS=$(kubectl get pods -n $NAMESPACE -l app=$APP_NAME -o jsonpath='{.items[*].metadata.name}')
if [ -z "$PODS" ]; then
    print_status 1 "No pods found for app '$APP_NAME'"
else
    POD_COUNT=$(echo $PODS | wc -w)
    print_status 0 "Found $POD_COUNT pod(s) for app '$APP_NAME'"
    
    # Check if all pods are ready
    READY_PODS=$(kubectl get pods -n $NAMESPACE -l app=$APP_NAME -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | grep -o "True" | wc -l)
    if [ "$READY_PODS" -eq "$POD_COUNT" ]; then
        print_status 0 "All $POD_COUNT pods are ready"
    else
        print_status 1 "Only $READY_PODS out of $POD_COUNT pods are ready"
    fi
fi

# Check image version
echo
print_info "Checking container image version..."

CURRENT_IMAGE=$(kubectl get deployment $APP_NAME -n $NAMESPACE -o jsonpath='{.spec.template.spec.containers[0].image}')
if [[ "$CURRENT_IMAGE" == *"$IMAGE_VERSION"* ]]; then
    print_status 0 "Container image version is correct: $CURRENT_IMAGE"
else
    print_status 1 "Container image version mismatch. Expected: *$IMAGE_VERSION*, Got: $CURRENT_IMAGE"
fi

# Check external secret sync status
echo
print_info "Checking External Secret synchronization..."

SECRET_STATUS=$(kubectl get externalsecret ${APP_NAME}-secrets -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
if [ "$SECRET_STATUS" = "True" ]; then
    print_status 0 "External Secret is synced successfully"
else
    print_status 1 "External Secret sync status: $SECRET_STATUS"
fi

# Check service endpoints
echo
print_info "Checking service endpoints..."

ENDPOINTS=$(kubectl get endpoints $APP_NAME -n $NAMESPACE -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null)
if [ -n "$ENDPOINTS" ]; then
    ENDPOINT_COUNT=$(echo $ENDPOINTS | wc -w)
    print_status 0 "Service has $ENDPOINT_COUNT endpoint(s)"
else
    print_status 1 "Service has no endpoints"
fi

# Check HPA status
echo
print_info "Checking HPA status..."

HPA_STATUS=$(kubectl get hpa ${APP_NAME}-hpa -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="ScalingActive")].status}' 2>/dev/null || echo "Unknown")
if [ "$HPA_STATUS" = "True" ]; then
    CURRENT_REPLICAS=$(kubectl get hpa ${APP_NAME}-hpa -n $NAMESPACE -o jsonpath='{.status.currentReplicas}')
    print_status 0 "HPA is active with $CURRENT_REPLICAS current replicas"
else
    print_status 1 "HPA status: $HPA_STATUS"
fi

# Test health endpoint (if port-forward is possible)
echo
print_info "Testing health endpoint..."

# Try to port-forward and test (non-blocking)
timeout 10s kubectl port-forward -n $NAMESPACE svc/$APP_NAME 8080:80 &> /dev/null &
PORT_FORWARD_PID=$!
sleep 2

if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null | grep -q "200"; then
    print_status 0 "Health endpoint is responding"
else
    print_warning "Could not test health endpoint (port-forward may not be available)"
fi

# Clean up port-forward
kill $PORT_FORWARD_PID 2>/dev/null || true

# Check Istio sidecar injection
echo
print_info "Checking Istio sidecar injection..."

SIDECAR_COUNT=$(kubectl get pods -n $NAMESPACE -l app=$APP_NAME -o jsonpath='{.items[*].spec.containers[*].name}' | grep -o "istio-proxy" | wc -l)
if [ "$SIDECAR_COUNT" -gt 0 ]; then
    print_status 0 "Istio sidecar is injected ($SIDECAR_COUNT sidecar(s) found)"
else
    print_status 1 "Istio sidecar not found"
fi

# Final summary
echo
echo "=============================================="
echo "🏁 Validation Summary"
echo "=============================================="

# Count successful checks (this is a simplified approach)
TOTAL_CHECKS=20
echo "ℹ️  Completed validation checks for Platform API v1.1.0"
echo "ℹ️  Review the output above for any issues that need attention"
echo

# Provide next steps
echo "📋 Next Steps:"
echo "   1. Review any failed checks above"
echo "   2. Check pod logs: kubectl logs -n $NAMESPACE -l app=$APP_NAME"
echo "   3. Monitor application: kubectl get pods -n $NAMESPACE -l app=$APP_NAME -w"
echo "   4. Test API endpoints after port-forwarding"
echo "   5. Check monitoring dashboards and alerts"
echo

echo "✅ Platform API deployment validation completed!"