#!/bin/bash

# ASO Workload Identity Deployment Script
# This script deploys Azure Service Operator with Workload Identity authentication

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="azure-system"
ASO_NAMESPACE="azureserviceoperator-system"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if we're connected to a cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Not connected to a Kubernetes cluster"
        exit 1
    fi
    
    # Check if ASO CRDs are installed
    if ! kubectl get crd | grep -q "azure.com"; then
        log_error "Azure Service Operator CRDs are not installed. Please install ASO first."
        log_info "Install ASO using: helm install aso2 aso2/azure-service-operator --create-namespace --namespace=azureserviceoperator-system"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Deploy identity infrastructure
deploy_identity_infrastructure() {
    log_info "Deploying Azure identity infrastructure..."
    
    # Apply the ASO CRDs for identity resources
    kubectl apply -k "$SCRIPT_DIR"
    
    log_info "Waiting for identity resources to be provisioned..."
    
    # Wait for UserAssignedIdentity to be ready
    log_info "Waiting for ASO workload identity to be ready..."
    kubectl wait --for=condition=Ready userassignedidentity/aso-workload-identity -n "$NAMESPACE" --timeout=300s || {
        log_error "Timeout waiting for aso-workload-identity to be ready"
        return 1
    }
    
    # Wait for FederatedIdentityCredential to be ready
    log_info "Waiting for federated identity credential to be ready..."
    kubectl wait --for=condition=Ready federatedidentitycredential/aso-fic-workload-identity -n "$NAMESPACE" --timeout=300s || {
        log_error "Timeout waiting for federated identity credential to be ready"
        return 1
    }
    
    # Wait for RoleAssignments to be ready
    log_info "Waiting for role assignments to be ready..."
    kubectl wait --for=condition=Ready roleassignment/aso-subscription-contributor -n "$NAMESPACE" --timeout=300s || {
        log_error "Timeout waiting for contributor role assignment to be ready"
        return 1
    }
    
    kubectl wait --for=condition=Ready roleassignment/aso-user-access-administrator -n "$NAMESPACE" --timeout=300s || {
        log_error "Timeout waiting for user access administrator role assignment to be ready"
        return 1
    }
    
    log_success "Identity infrastructure deployed successfully"
}

# Verify workload identity setup
verify_workload_identity() {
    log_info "Verifying workload identity setup..."
    
    # Check if the identity ConfigMap exists and has the required data
    if kubectl get configmap aso-identity-cm -n "$NAMESPACE" &> /dev/null; then
        CLIENT_ID=$(kubectl get configmap aso-identity-cm -n "$NAMESPACE" -o jsonpath='{.data.clientId}' 2>/dev/null || echo "")
        PRINCIPAL_ID=$(kubectl get configmap aso-identity-cm -n "$NAMESPACE" -o jsonpath='{.data.principalId}' 2>/dev/null || echo "")
        
        if [[ -n "$CLIENT_ID" && -n "$PRINCIPAL_ID" ]]; then
            log_success "Identity ConfigMap found with clientId: $CLIENT_ID"
            log_success "Identity ConfigMap found with principalId: $PRINCIPAL_ID"
        else
            log_error "Identity ConfigMap exists but missing required data"
            return 1
        fi
    else
        log_error "Identity ConfigMap aso-identity-cm not found in namespace $NAMESPACE"
        return 1
    fi
    
    # Check ServiceAccount annotation
    if kubectl get serviceaccount azureserviceoperator-default -n "$ASO_NAMESPACE" &> /dev/null; then
        SA_CLIENT_ID=$(kubectl get serviceaccount azureserviceoperator-default -n "$ASO_NAMESPACE" -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}' 2>/dev/null || echo "")
        if [[ -n "$SA_CLIENT_ID" ]]; then
            log_success "ServiceAccount has workload identity annotation with client-id: $SA_CLIENT_ID"
        else
            log_warning "ServiceAccount missing workload identity annotation - this will be set up by the setup job"
        fi
    fi
    
    log_success "Workload identity verification completed"
}

# Check ASO deployment status
check_aso_deployment() {
    log_info "Checking ASO deployment status..."
    
    # Check if ASO deployment exists and is ready
    if kubectl get deployment azureserviceoperator-controller-manager -n "$ASO_NAMESPACE" &> /dev/null; then
        kubectl wait --for=condition=Available deployment/azureserviceoperator-controller-manager -n "$ASO_NAMESPACE" --timeout=300s || {
            log_error "ASO deployment is not ready"
            return 1
        }
        log_success "ASO deployment is ready"
    else
        log_warning "ASO deployment not found - it may need to be installed separately"
    fi
    
    # Check if setup job completed successfully
    if kubectl get job aso-workload-identity-setup -n "$ASO_NAMESPACE" &> /dev/null; then
        JOB_STATUS=$(kubectl get job aso-workload-identity-setup -n "$ASO_NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || echo "")
        if [[ "$JOB_STATUS" == "True" ]]; then
            log_success "Workload identity setup job completed successfully"
        else
            log_warning "Workload identity setup job has not completed yet"
        fi
    fi
}

# Display connection information
display_connection_info() {
    log_info "ASO Workload Identity Connection Information:"
    echo "----------------------------------------"
    
    # Get identity details
    if kubectl get configmap aso-identity-cm -n "$NAMESPACE" &> /dev/null; then
        CLIENT_ID=$(kubectl get configmap aso-identity-cm -n "$NAMESPACE" -o jsonpath='{.data.clientId}' 2>/dev/null || echo "Not available")
        PRINCIPAL_ID=$(kubectl get configmap aso-identity-cm -n "$NAMESPACE" -o jsonpath='{.data.principalId}' 2>/dev/null || echo "Not available")
        TENANT_ID=$(kubectl get configmap aso-identity-cm -n "$NAMESPACE" -o jsonpath='{.data.tenantId}' 2>/dev/null || echo "Not available")
        
        echo "Azure Client ID: $CLIENT_ID"
        echo "Principal ID: $PRINCIPAL_ID"
        echo "Tenant ID: $TENANT_ID"
        echo "Subscription ID: 133d5755-4074-4d6e-ad38-eb2a6ad12903"
    fi
    
    echo "Workload Identity: Enabled"
    echo "Service Account: azureserviceoperator-system/azureserviceoperator-default"
    echo "Namespace: $ASO_NAMESPACE"
    echo "----------------------------------------"
}

# Main deployment function
main() {
    log_info "Starting ASO Workload Identity deployment..."
    
    # Run deployment steps
    check_prerequisites
    deploy_identity_infrastructure
    verify_workload_identity
    check_aso_deployment
    display_connection_info
    
    log_success "ASO Workload Identity deployment completed successfully!"
    log_info "ASO is now configured to use Azure Workload Identity for authentication."
    log_info "No client secrets are stored in Kubernetes - all authentication is handled via federated tokens."
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"