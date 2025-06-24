#!/usr/bin/env nu

source scripts/common.nu
source scripts/kubernetes.nu
source scripts/crossplane.nu
source scripts/atlas.nu
source scripts/ingress.nu

def main [] {}

def "main setup" [] {

    rm --force .env

    let provider = (
        main get provider --providers ["aws" "google" "azure"]
    )

    # Update MCP configuration files with absolute paths
    for file in [".mcp.json", ".cursor/mcp.json"] { 
        open $file
        | update mcpServers.memory-db.env.MEMORY_FILE_PATH ($env.PWD | path join "memory-db.json")
        | update mcpServers.memory-app.env.MEMORY_FILE_PATH ($env.PWD | path join "memory-app.json")
        | save $file --force 
    }

    main create kubernetes $provider

    main apply ingress contour --provider $provider

    (
        main apply crossplane --provider $provider
            --db-provider true --app-config true --skip-login true
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