#!/usr/bin/env nu

source scripts/common.nu
source scripts/kubernetes.nu
source scripts/crossplane.nu
source scripts/atlas.nu

def main [] {}

def "main setup" [] {

    rm --force .env

    let provider = main get provider --providers ["google"]

    main create kubernetes $provider

    main apply crossplane --provider $provider --db-provider true

    main apply atlas

    main print source

}

def "main destroy" [
    provider: string
] {

    main destroy kubernetes $provider

    rm --force .env

}