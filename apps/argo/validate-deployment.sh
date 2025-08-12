#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="argo"
TIMEOUT="300s"

echo -e "${BLUE}🚀 Argo Workflows AKS Deployment Validation${NC}"
echo "=============================================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "OK" ]; then
        echo -e "✅ ${GREEN}$message${NC}"
    elif [ "$status" = "WARN" ]; then
        echo -e "⚠️  ${YELLOW}$message${NC}"
    else
        echo -e "❌ ${RED}$message${NC}"
    fi
}

# Function to check pod status
check_pods() {
    local app_selector=$1
    local component_name=$2
    
    echo "Checking $component_name pods..."
    
    if ! kubectl get pods -n "$NAMESPACE" -l "$app_selector" >/dev/null 2>&1; then
        print_status "FAIL" "$component_name: No pods found"
        return 1
    fi
    
    local ready_pods
    ready_pods=$(kubectl get pods -n "$NAMESPACE" -l "$app_selector" -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | tr ' ' '\n' | grep -c "True" || true)
    local total_pods
    total_pods=$(kubectl get pods -n "$NAMESPACE" -l "$app_selector" --no-headers | wc -l)
    
    if [ "$ready_pods" -eq "$total_pods" ] && [ "$total_pods" -gt 0 ]; then
        print_status "OK" "$component_name: $ready_pods/$total_pods pods ready"
        return 0
    else
        print_status "FAIL" "$component_name: $ready_pods/$total_pods pods ready"
        return 1
    fi
}

# Function to check service status
check_service() {
    local service_name=$1
    
    echo "Checking service: $service_name"
    
    if kubectl get service "$service_name" -n "$NAMESPACE" >/dev/null 2>&1; then
        local service_type
        service_type=$(kubectl get service "$service_name" -n "$NAMESPACE" -o jsonpath='{.spec.type}')
        print_status "OK" "Service $service_name ($service_type) exists"
        return 0
    else
        print_status "FAIL" "Service $service_name not found"
        return 1
    fi
}

# Function to check workflow templates
check_workflow_templates() {
    echo "Checking workflow templates..."
    
    if kubectl get workflowtemplate -n "$NAMESPACE" >/dev/null 2>&1; then
        local template_count
        template_count=$(kubectl get workflowtemplate -n "$NAMESPACE" --no-headers | wc -l)
        if [ "$template_count" -gt 0 ]; then
            print_status "OK" "Found $template_count workflow template(s)"
            kubectl get workflowtemplate -n "$NAMESPACE" --no-headers | while read -r line; do
                echo "  • $(echo "$line" | awk '{print $1}')"
            done
        else
            print_status "WARN" "No workflow templates found"
        fi
    else
        print_status "FAIL" "Cannot access workflow templates"
        return 1
    fi
}

# Function to test Platform API integration
test_platform_api_integration() {
    echo "Testing Platform API integration..."
    
    # Check if we can create a test workflow
    if command_exists argo; then
        print_status "OK" "Argo CLI available for testing"
        
        # Test workflow template validation
        if argo template lint -n "$NAMESPACE" namespace-provisioning >/dev/null 2>&1; then
            print_status "OK" "namespace-provisioning template validation passed"
        else
            print_status "WARN" "namespace-provisioning template validation failed"
        fi
    else
        print_status "WARN" "Argo CLI not available for advanced testing"
    fi
}

# Function to check monitoring setup
check_monitoring() {
    echo "Checking monitoring configuration..."
    
    # Check ServiceMonitors
    if kubectl get servicemonitor -n "$NAMESPACE" >/dev/null 2>&1; then
        local sm_count
        sm_count=$(kubectl get servicemonitor -n "$NAMESPACE" --no-headers | wc -l)
        if [ "$sm_count" -gt 0 ]; then
            print_status "OK" "Found $sm_count ServiceMonitor(s)"
        else
            print_status "WARN" "No ServiceMonitors found"
        fi
    else
        print_status "WARN" "ServiceMonitor CRD not available (Prometheus not installed?)"
    fi
    
    # Check PrometheusRules
    if kubectl get prometheusrule -n "$NAMESPACE" >/dev/null 2>&1; then
        local pr_count
        pr_count=$(kubectl get prometheusrule -n "$NAMESPACE" --no-headers | wc -l)
        if [ "$pr_count" -gt 0 ]; then
            print_status "OK" "Found $pr_count PrometheusRule(s)"
        else
            print_status "WARN" "No PrometheusRules found"
        fi
    else
        print_status "WARN" "PrometheusRule CRD not available"
    fi
}

# Function to check security policies
check_security() {
    echo "Checking security configuration..."
    
    # Check NetworkPolicies
    if kubectl get networkpolicy -n "$NAMESPACE" >/dev/null 2>&1; then
        local np_count
        np_count=$(kubectl get networkpolicy -n "$NAMESPACE" --no-headers | wc -l)
        if [ "$np_count" -gt 0 ]; then
            print_status "OK" "Found $np_count NetworkPolicy(ies)"
        else
            print_status "WARN" "No NetworkPolicies found"
        fi
    else
        print_status "WARN" "NetworkPolicy support not available"
    fi
    
    # Check PodDisruptionBudgets
    if kubectl get pdb -n "$NAMESPACE" >/dev/null 2>&1; then
        local pdb_count
        pdb_count=$(kubectl get pdb -n "$NAMESPACE" --no-headers | wc -l)
        if [ "$pdb_count" -gt 0 ]; then
            print_status "OK" "Found $pdb_count PodDisruptionBudget(s)"
        else
            print_status "WARN" "No PodDisruptionBudgets found"
        fi
    fi
    
    # Check Pod Security Standards
    if kubectl get namespace "$NAMESPACE" -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/enforce}' >/dev/null 2>&1; then
        local pss_policy
        pss_policy=$(kubectl get namespace "$NAMESPACE" -o jsonpath='{.metadata.labels.pod-security\.kubernetes\.io/enforce}')
        if [ "$pss_policy" = "restricted" ]; then
            print_status "OK" "Pod Security Standards: $pss_policy"
        else
            print_status "WARN" "Pod Security Standards: $pss_policy (consider 'restricted')"
        fi
    else
        print_status "WARN" "Pod Security Standards not configured"
    fi
}

# Main validation function
main() {
    echo "Starting Argo Workflows validation..."
    echo
    
    # Prerequisites check
    echo -e "${BLUE}📋 Prerequisites Check${NC}"
    echo "======================="
    
    if ! command_exists kubectl; then
        print_status "FAIL" "kubectl not found"
        exit 1
    fi
    print_status "OK" "kubectl available"
    
    if ! kubectl cluster-info >/dev/null 2>&1; then
        print_status "FAIL" "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    print_status "OK" "Kubernetes cluster accessible"
    
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        print_status "FAIL" "Namespace '$NAMESPACE' not found"
        exit 1
    fi
    print_status "OK" "Namespace '$NAMESPACE' exists"
    
    echo
    
    # Core Components Check
    echo -e "${BLUE}🔧 Core Components Check${NC}"
    echo "=========================="
    
    check_pods "app.kubernetes.io/component=workflow-controller" "Workflow Controller"
    check_pods "app.kubernetes.io/component=argo-server" "Argo Server"
    
    echo
    
    # Services Check
    echo -e "${BLUE}🌐 Services Check${NC}"
    echo "=================="
    
    check_service "argo-server"
    check_service "workflow-controller-metrics"
    check_service "argo-server-internal"
    
    echo
    
    # RBAC Check
    echo -e "${BLUE}🔐 RBAC Check${NC}"
    echo "=============="
    
    if kubectl get serviceaccount argo -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "ServiceAccount 'argo' exists"
    else
        print_status "FAIL" "ServiceAccount 'argo' not found"
    fi
    
    if kubectl get clusterrole argo-role >/dev/null 2>&1; then
        print_status "OK" "ClusterRole 'argo-role' exists"
    else
        print_status "FAIL" "ClusterRole 'argo-role' not found"
    fi
    
    if kubectl get clusterrolebinding argo-binding >/dev/null 2>&1; then
        print_status "OK" "ClusterRoleBinding 'argo-binding' exists"
    else
        print_status "FAIL" "ClusterRoleBinding 'argo-binding' not found"
    fi
    
    echo
    
    # Configuration Check
    echo -e "${BLUE}⚙️  Configuration Check${NC}"
    echo "======================="
    
    if kubectl get configmap workflow-controller-configmap -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "Workflow controller ConfigMap exists"
    else
        print_status "FAIL" "Workflow controller ConfigMap not found"
    fi
    
    check_workflow_templates
    
    echo
    
    # Security Check
    echo -e "${BLUE}🔒 Security Check${NC}"
    echo "=================="
    
    check_security
    
    echo
    
    # Monitoring Check
    echo -e "${BLUE}📊 Monitoring Check${NC}"
    echo "==================="
    
    check_monitoring
    
    echo
    
    # Platform API Integration Check
    echo -e "${BLUE}🔗 Platform API Integration Check${NC}"
    echo "=================================="
    
    test_platform_api_integration
    
    echo
    
    # Final Health Check
    echo -e "${BLUE}❤️  Health Check${NC}"
    echo "================"
    
    echo "Waiting for all pods to be ready..."
    if kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=argo-workflows -n "$NAMESPACE" --timeout="$TIMEOUT" >/dev/null 2>&1; then
        print_status "OK" "All Argo Workflows pods are ready"
    else
        print_status "WARN" "Some pods may not be ready yet"
    fi
    
    # Test basic API connectivity
    if kubectl get workflows -n "$NAMESPACE" >/dev/null 2>&1; then
        print_status "OK" "Workflow CRD is accessible"
    else
        print_status "FAIL" "Cannot access Workflow CRD"
    fi
    
    echo
    echo -e "${GREEN}✨ Validation completed!${NC}"
    echo
    echo "Next steps:"
    echo "1. Configure secrets via External Secrets Operator"
    echo "2. Test namespace provisioning workflow"
    echo "3. Verify Platform API integration"
    echo "4. Set up monitoring dashboards"
    echo
    echo "For troubleshooting, check:"
    echo "• kubectl logs -l app.kubernetes.io/component=workflow-controller -n $NAMESPACE"
    echo "• kubectl logs -l app.kubernetes.io/component=argo-server -n $NAMESPACE"
    echo "• kubectl get events -n $NAMESPACE"
}

# Run main function
main "$@"