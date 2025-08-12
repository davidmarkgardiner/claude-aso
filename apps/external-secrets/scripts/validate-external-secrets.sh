#!/bin/bash

# External Secrets Validation Script
# Validates the deployment and functionality of External Secrets Operator

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="external-secrets-system"
TIMEOUT=300

echo "================================================"
echo "🔐 External Secrets Validation"
echo "================================================"

# Function to check if a resource exists
check_resource() {
    local resource=$1
    local name=$2
    local namespace=$3
    
    if kubectl get $resource $name -n $namespace &>/dev/null; then
        echo -e "${GREEN}✓${NC} $resource/$name exists in namespace $namespace"
        return 0
    else
        echo -e "${RED}✗${NC} $resource/$name not found in namespace $namespace"
        return 1
    fi
}

# Function to wait for deployment
wait_for_deployment() {
    local deployment=$1
    local namespace=$2
    local timeout=$3
    
    echo -e "${YELLOW}Waiting for deployment $deployment in namespace $namespace...${NC}"
    
    if kubectl wait --for=condition=available --timeout=${timeout}s \
        deployment/$deployment -n $namespace &>/dev/null; then
        echo -e "${GREEN}✓${NC} Deployment $deployment is ready"
        return 0
    else
        echo -e "${RED}✗${NC} Deployment $deployment failed to become ready"
        kubectl describe deployment $deployment -n $namespace
        return 1
    fi
}

# Function to check CRDs
check_crds() {
    echo -e "\n${BLUE}Checking External Secrets CRDs...${NC}"
    
    local crds=(
        "secretstores.external-secrets.io"
        "clustersecretstores.external-secrets.io"
        "externalsecrets.external-secrets.io"
        "pushsecrets.external-secrets.io"
    )
    
    for crd in "${crds[@]}"; do
        if kubectl get crd $crd &>/dev/null; then
            echo -e "${GREEN}✓${NC} CRD $crd is installed"
        else
            echo -e "${RED}✗${NC} CRD $crd is missing"
            return 1
        fi
    done
}

# Function to check operator pods
check_operator_pods() {
    echo -e "\n${BLUE}Checking External Secrets Operator pods...${NC}"
    
    local pods=$(kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=external-secrets -o name)
    
    if [ -z "$pods" ]; then
        echo -e "${RED}✗${NC} No External Secrets pods found"
        return 1
    fi
    
    for pod in $pods; do
        local pod_name=$(echo $pod | cut -d'/' -f2)
        local status=$(kubectl get pod $pod_name -n $NAMESPACE -o jsonpath='{.status.phase}')
        
        if [ "$status" == "Running" ]; then
            echo -e "${GREEN}✓${NC} Pod $pod_name is $status"
        else
            echo -e "${RED}✗${NC} Pod $pod_name is $status"
            kubectl describe pod $pod_name -n $NAMESPACE
            return 1
        fi
    done
}

# Function to test secret store connection
test_secret_store() {
    echo -e "\n${BLUE}Testing Secret Store connections...${NC}"
    
    # Check ClusterSecretStore
    local stores=$(kubectl get clustersecretstores -o name 2>/dev/null)
    
    for store in $stores; do
        local store_name=$(echo $store | cut -d'/' -f2)
        echo -e "${YELLOW}Checking ClusterSecretStore: $store_name${NC}"
        
        # Check if the store is ready
        local ready=$(kubectl get clustersecretstore $store_name \
            -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
        
        if [ "$ready" == "True" ]; then
            echo -e "${GREEN}✓${NC} ClusterSecretStore $store_name is ready"
        else
            echo -e "${RED}✗${NC} ClusterSecretStore $store_name is not ready"
            kubectl describe clustersecretstore $store_name
        fi
    done
    
    # Check namespace-scoped SecretStores
    local namespaces=("platform-system" "cert-manager" "external-dns" "default")
    
    for ns in "${namespaces[@]}"; do
        if kubectl get namespace $ns &>/dev/null; then
            local stores=$(kubectl get secretstores -n $ns -o name 2>/dev/null)
            
            for store in $stores; do
                local store_name=$(echo $store | cut -d'/' -f2)
                echo -e "${YELLOW}Checking SecretStore: $store_name in namespace $ns${NC}"
                
                local ready=$(kubectl get secretstore $store_name -n $ns \
                    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
                
                if [ "$ready" == "True" ]; then
                    echo -e "${GREEN}✓${NC} SecretStore $store_name is ready"
                else
                    echo -e "${YELLOW}⚠${NC} SecretStore $store_name status: $ready"
                fi
            done
        fi
    done
}

# Function to test external secret synchronization
test_external_secrets() {
    echo -e "\n${BLUE}Testing ExternalSecret synchronization...${NC}"
    
    # Create a test secret in development mode
    if [ "$1" == "dev" ]; then
        echo -e "${YELLOW}Creating test secret for development environment...${NC}"
        
        cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: test-backend-secret
  namespace: $NAMESPACE
type: Opaque
stringData:
  test-key: "test-value-$(date +%s)"
  test-password: "secure-password-123"
EOF
        
        # Create test ExternalSecret
        cat <<EOF | kubectl apply -f -
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: test-store
  namespace: default
spec:
  provider:
    kubernetes:
      remoteNamespace: $NAMESPACE
      auth:
        serviceAccount:
          name: external-secrets
      server:
        caProvider:
          type: ConfigMap
          name: kube-root-ca.crt
          key: ca.crt
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: test-external-secret
  namespace: default
spec:
  refreshInterval: 10s
  secretStoreRef:
    name: test-store
    kind: SecretStore
  target:
    name: test-synced-secret
    creationPolicy: Owner
  data:
  - secretKey: password
    remoteRef:
      key: test-backend-secret
      property: test-password
EOF
        
        # Wait for synchronization
        echo -e "${YELLOW}Waiting for secret synchronization...${NC}"
        sleep 15
        
        # Check if secret was created
        if kubectl get secret test-synced-secret -n default &>/dev/null; then
            echo -e "${GREEN}✓${NC} Test secret synchronized successfully"
            
            # Verify secret content
            local synced_value=$(kubectl get secret test-synced-secret -n default \
                -o jsonpath='{.data.password}' | base64 -d)
            
            if [ "$synced_value" == "secure-password-123" ]; then
                echo -e "${GREEN}✓${NC} Secret content verified successfully"
            else
                echo -e "${RED}✗${NC} Secret content mismatch"
            fi
            
            # Cleanup
            kubectl delete externalsecret test-external-secret -n default &>/dev/null
            kubectl delete secretstore test-store -n default &>/dev/null
            kubectl delete secret test-backend-secret -n $NAMESPACE &>/dev/null
        else
            echo -e "${RED}✗${NC} Test secret synchronization failed"
        fi
    fi
}

# Function to check RBAC permissions
check_rbac() {
    echo -e "\n${BLUE}Checking RBAC permissions...${NC}"
    
    local service_account="external-secrets"
    
    # Check if service account can read secrets
    if kubectl auth can-i get secrets --as=system:serviceaccount:$NAMESPACE:$service_account \
        -n $NAMESPACE &>/dev/null; then
        echo -e "${GREEN}✓${NC} Service account can read secrets"
    else
        echo -e "${RED}✗${NC} Service account cannot read secrets"
    fi
    
    # Check if service account can create secrets in target namespaces
    local target_namespaces=("platform-system" "cert-manager" "external-dns")
    
    for ns in "${target_namespaces[@]}"; do
        if kubectl get namespace $ns &>/dev/null; then
            if kubectl auth can-i create secrets \
                --as=system:serviceaccount:$NAMESPACE:$service_account \
                -n $ns &>/dev/null; then
                echo -e "${GREEN}✓${NC} Service account can create secrets in $ns"
            else
                echo -e "${YELLOW}⚠${NC} Service account cannot create secrets in $ns"
            fi
        fi
    done
}

# Function to display metrics
check_metrics() {
    echo -e "\n${BLUE}Checking metrics endpoint...${NC}"
    
    local service="external-secrets"
    
    if kubectl get service $service -n $NAMESPACE &>/dev/null; then
        echo -e "${GREEN}✓${NC} Metrics service exists"
        
        # Port-forward to check metrics
        kubectl port-forward -n $NAMESPACE service/$service 8080:8080 &>/dev/null &
        local pf_pid=$!
        
        sleep 2
        
        if curl -s http://localhost:8080/metrics | grep -q "external_secrets"; then
            echo -e "${GREEN}✓${NC} Metrics endpoint is accessible"
        else
            echo -e "${YELLOW}⚠${NC} Metrics endpoint not responding"
        fi
        
        kill $pf_pid 2>/dev/null
    else
        echo -e "${YELLOW}⚠${NC} Metrics service not found"
    fi
}

# Main validation flow
main() {
    local environment="${1:-prod}"
    
    echo "Environment: $environment"
    echo ""
    
    # Check if namespace exists
    if ! kubectl get namespace $NAMESPACE &>/dev/null; then
        echo -e "${RED}✗${NC} Namespace $NAMESPACE does not exist"
        echo "Please deploy External Secrets Operator first"
        exit 1
    fi
    
    # Run validation checks
    check_crds
    check_operator_pods
    
    # Wait for main deployment
    wait_for_deployment "external-secrets" $NAMESPACE $TIMEOUT
    wait_for_deployment "external-secrets-webhook" $NAMESPACE $TIMEOUT
    wait_for_deployment "external-secrets-cert-controller" $NAMESPACE $TIMEOUT
    
    check_rbac
    test_secret_store
    test_external_secrets $environment
    check_metrics
    
    echo ""
    echo "================================================"
    echo -e "${GREEN}External Secrets validation completed${NC}"
    echo "================================================"
    
    # Display summary
    echo -e "\n${BLUE}Summary:${NC}"
    kubectl get pods -n $NAMESPACE
    echo ""
    kubectl get clustersecretstores
    echo ""
    kubectl get externalsecrets --all-namespaces
}

# Handle script arguments
case "${1}" in
    dev|development)
        main "dev"
        ;;
    prod|production)
        main "prod"
        ;;
    *)
        echo "Usage: $0 [dev|prod]"
        echo "  dev  - Run validation for development environment (minikube)"
        echo "  prod - Run validation for production environment (AKS)"
        main "prod"
        ;;
esac