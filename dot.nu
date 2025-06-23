#!/usr/bin/env nu

source scripts/common.nu
source scripts/kubernetes.nu
source scripts/crossplane.nu
source scripts/atlas.nu
source scripts/ingress.nu

def main [] {}

def "main setup" [] {

    rm --force .env

    let provider = main get provider --providers ["google"]

    main create kubernetes $provider

    main apply ingress contour --provider $provider

    (
        main apply crossplane --provider $provider
            --db-provider true --app-config true
    )

    main apply atlas

    kubectl create namespace a-team

    kubectl create namespace b-team

    main print source

}

def "main destroy" [
    provider: string
] {

    main destroy kubernetes $provider

    rm --force .env

}