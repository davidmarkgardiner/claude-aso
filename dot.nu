#!/usr/bin/env nu

source scripts/common.nu
source scripts/kubernetes.nu
source scripts/crossplane.nu
source scripts/atlas.nu

def main [] {}

def "main setup" [] {

    rm --force .env

    main create kubernetes kind

    let provider = "google"

    main apply crossplane --provider $provider --db-provider true

    main apply atlas

    main print source

}

def "main destroy" [
    provider: string
] {

    main destroy kubernetes kind

    if $provider == "google" {

        gcloud projects delete $env.PROJECT_ID --quiet

    }

    rm --force .env

}