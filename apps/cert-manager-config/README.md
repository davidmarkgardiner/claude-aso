# Cert-Manager Configuration

This directory contains cert-manager ClusterIssuer configurations:

- **clusterissuer-staging.yaml**: Let's Encrypt staging ClusterIssuer
- **clusterissuer-production.yaml**: Let's Encrypt production ClusterIssuer

## Purpose

This is deployed after `cert-manager-base` to ensure the cert-manager CRDs are available before creating ClusterIssuers.

## Dependencies

- cert-manager-base must be successfully deployed first
- Azure DNS zone and workload identity permissions for DNS01 challenges
- DNS Zone Contributor role on the Azure DNS zone

## Features

Both ClusterIssuers use:

- DNS01 ACME challenge via Azure DNS
- Azure workload identity for authentication
- Support for `davidmarkgardiner.co.uk` and wildcard certificates
