# Cert-Manager Base

This directory contains the base cert-manager installation components:

- **namespace.yaml**: cert-manager namespace
- **identity-configmap.yaml**: Azure workload identity configuration
- **helm-repository.yaml**: Jetstack Helm repository
- **helm-release.yaml**: cert-manager Helm chart installation with CRDs

## Purpose

This is deployed first to install cert-manager and its CRDs. The ClusterIssuer resources are deployed separately in `cert-manager-config` to avoid race conditions.

## Dependencies

- Azure workload identity (`${clientId}`, `${principalId}`, `${tenantId}` substituted by Flux)
- Jetstack Helm repository

## Deployment Order

1. cert-manager-base (this directory) - installs cert-manager with CRDs
2. cert-manager-config - installs ClusterIssuers once CRDs are available
