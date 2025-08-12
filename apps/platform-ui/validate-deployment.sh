#!/bin/bash

# Platform UI Deployment Validation Script
# This script validates the Platform UI deployment in AKS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="platform-system"
APP_NAME="platform-ui"
TIMEOUT="300s"

echo "🚀 Platform UI Deployment Validation"
echo "====================================="

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    if [ "$status" == "OK" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" == "WARN" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
    else
        echo -e "${RED}✗${NC} $message"
    fi
}

# Function to check if namespace exists
check_namespace() {
    echo "🔍 Checking namespace..."
    if kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "Namespace '$NAMESPACE' exists"
    else
        print_status "FAIL" "Namespace '$NAMESPACE' does not exist"
        return 1
    fi
}

# Function to check deployment status
check_deployment() {
    echo "🔍 Checking deployment..."
    if kubectl get deployment "$APP_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "Deployment '$APP_NAME' exists"
        
        # Check if deployment is ready
        if kubectl wait --for=condition=available deployment/"$APP_NAME" -n "$NAMESPACE" --timeout="$TIMEOUT" >/dev/null 2>&1; then
            print_status "OK" "Deployment '$APP_NAME' is available"
        else
            print_status "FAIL" "Deployment '$APP_NAME' is not ready"
            return 1
        fi
    else
        print_status "FAIL" "Deployment '$APP_NAME' does not exist"
        return 1
    fi
}

# Function to check pods
check_pods() {
    echo "🔍 Checking pods..."
    local pods=$(kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME" -o jsonpath='{.items[*].metadata.name}')
    
    if [ -z "$pods" ]; then
        print_status "FAIL" "No pods found for app '$APP_NAME'"
        return 1
    fi
    
    for pod in $pods; do
        local status=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.status.phase}')
        if [ "$status" == "Running" ]; then
            print_status "OK" "Pod '$pod' is running"
        else
            print_status "FAIL" "Pod '$pod' is in state: $status"
            kubectl describe pod "$pod" -n "$NAMESPACE"
            return 1
        fi
    done
}

# Function to check services
check_services() {
    echo "🔍 Checking services..."
    if kubectl get service "$APP_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "Service '$APP_NAME' exists"
        
        # Check if service has endpoints
        local endpoints=$(kubectl get endpoints "$APP_NAME" -n "$NAMESPACE" -o jsonpath='{.subsets[*].addresses[*].ip}')
        if [ -n "$endpoints" ]; then
            print_status "OK" "Service '$APP_NAME' has endpoints"
        else
            print_status "WARN" "Service '$APP_NAME' has no endpoints"
        fi
    else
        print_status "FAIL" "Service '$APP_NAME' does not exist"
        return 1
    fi
}

# Function to check ingress
check_ingress() {
    echo "🔍 Checking ingress..."
    if kubectl get ingress "$APP_NAME-ingress" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "Ingress '$APP_NAME-ingress' exists"
        
        # Check if ingress has IP
        local ingress_ip=$(kubectl get ingress "$APP_NAME-ingress" -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
        if [ -n "$ingress_ip" ]; then
            print_status "OK" "Ingress has IP: $ingress_ip"
        else
            print_status "WARN" "Ingress does not have an IP yet"
        fi
    else
        print_status "WARN" "Ingress '$APP_NAME-ingress' does not exist (optional)"
    fi
}

# Function to check Istio resources
check_istio() {
    echo "🔍 Checking Istio resources..."
    
    # Check VirtualService
    if kubectl get virtualservice "$APP_NAME-vs" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "VirtualService '$APP_NAME-vs' exists"
    else
        print_status "WARN" "VirtualService '$APP_NAME-vs' does not exist"
    fi
    
    # Check DestinationRule
    if kubectl get destinationrule "$APP_NAME-dr" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "DestinationRule '$APP_NAME-dr' exists"
    else
        print_status "WARN" "DestinationRule '$APP_NAME-dr' does not exist"
    fi
    
    # Check Gateway
    if kubectl get gateway "$APP_NAME-gateway" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "Gateway '$APP_NAME-gateway' exists"
    else
        print_status "WARN" "Gateway '$APP_NAME-gateway' does not exist"
    fi
    
    # Check if Istio sidecar is injected
    local pods=$(kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME" -o jsonpath='{.items[*].metadata.name}')
    for pod in $pods; do
        local containers=$(kubectl get pod "$pod" -n "$NAMESPACE" -o jsonpath='{.spec.containers[*].name}')
        if [[ $containers == *"istio-proxy"* ]]; then
            print_status "OK" "Pod '$pod' has Istio sidecar"
        else
            print_status "WARN" "Pod '$pod' does not have Istio sidecar"
        fi
    done
}

# Function to check HPA
check_hpa() {
    echo "🔍 Checking HPA..."
    if kubectl get hpa "$APP_NAME-hpa" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "HPA '$APP_NAME-hpa' exists"
        
        # Check HPA status
        local targets=$(kubectl get hpa "$APP_NAME-hpa" -n "$NAMESPACE" -o jsonpath='{.status.currentMetrics[*].resource.current.averageUtilization}')
        if [ -n "$targets" ]; then
            print_status "OK" "HPA is active with metrics"
        else
            print_status "WARN" "HPA exists but no metrics available yet"
        fi
    else
        print_status "WARN" "HPA '$APP_NAME-hpa' does not exist"
    fi
}

# Function to check PDB
check_pdb() {
    echo "🔍 Checking PDB..."
    if kubectl get pdb "$APP_NAME-pdb" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "PDB '$APP_NAME-pdb' exists"
    else
        print_status "WARN" "PDB '$APP_NAME-pdb' does not exist"
    fi
}

# Function to check health endpoint
check_health() {
    echo "🔍 Checking health endpoint..."
    local service_name="$APP_NAME.$NAMESPACE.svc.cluster.local"
    
    # Try to port-forward and check health
    kubectl port-forward -n "$NAMESPACE" service/"$APP_NAME" 8080:80 >/dev/null 2>&1 &
    local pf_pid=$!
    sleep 5
    
    if curl -f -s http://localhost:8080/health >/dev/null 2>&1; then
        print_status "OK" "Health endpoint is responding"
    else
        print_status "WARN" "Health endpoint is not responding (may take time to start)"
    fi
    
    # Clean up port-forward
    kill $pf_pid >/dev/null 2>&1 || true
}

# Function to check monitoring
check_monitoring() {
    echo "🔍 Checking monitoring resources..."
    
    # Check ServiceMonitor
    if kubectl get servicemonitor "$APP_NAME-monitor" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "ServiceMonitor '$APP_NAME-monitor' exists"
    else
        print_status "WARN" "ServiceMonitor '$APP_NAME-monitor' does not exist"
    fi
    
    # Check PrometheusRule
    if kubectl get prometheusrule "$APP_NAME-alerts" -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "PrometheusRule '$APP_NAME-alerts' exists"
    else
        print_status "WARN" "PrometheusRule '$APP_NAME-alerts' does not exist"
    fi
}

# Function to show resource usage
show_resource_usage() {
    echo "📊 Resource Usage:"
    echo "=================="
    kubectl top pods -n "$NAMESPACE" -l app="$APP_NAME" 2>/dev/null || print_status "WARN" "Metrics server not available"
}

# Function to show logs
show_logs() {
    echo "📋 Recent Logs (last 20 lines):"
    echo "================================="
    local pods=$(kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME" -o jsonpath='{.items[0].metadata.name}')
    if [ -n "$pods" ]; then
        kubectl logs -n "$NAMESPACE" "$pods" --tail=20 || print_status "WARN" "Could not fetch logs"
    fi
}

# Main execution
main() {
    echo "Starting validation for Platform UI deployment..."
    echo
    
    check_namespace || exit 1
    check_deployment || exit 1
    check_pods || exit 1
    check_services || exit 1
    check_ingress
    check_istio
    check_hpa
    check_pdb
    check_health
    check_monitoring
    
    echo
    show_resource_usage
    echo
    show_logs
    
    echo
    echo "🎉 Platform UI validation completed!"
    echo
    echo "Next steps:"
    echo "1. Configure DNS to point platform.aks.local to your ingress IP"
    echo "2. Update Azure AD application settings with the correct redirect URLs"
    echo "3. Monitor the application using the Grafana dashboard"
    echo "4. Test the UI functionality by accessing https://platform.aks.local"
}

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    print_status "FAIL" "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if connected to cluster
if ! kubectl cluster-info &> /dev/null; then
    print_status "FAIL" "Not connected to a Kubernetes cluster"
    exit 1
fi

# Run main function
main