export interface ClusterConfiguration {
  name: string;
  armId: string;
  resourceGroup: string;
  subscriptionId: string;
  region: string;
  endpoint?: string;
  isDefault?: boolean;
  environment: "development" | "staging" | "production";
}

export interface RoleAssignmentRequest {
  principalId: string;
  principalType: "User" | "Group" | "ServicePrincipal";
  roleDefinitionId: string;
  scope: string;
  description?: string;
}

export interface NamespaceRBACConfiguration {
  namespaceName: string;
  clusterName: string;
  teamName: string;
  environment: string;
  roleAssignments: RoleAssignmentRequest[];
}

export interface RBACProvisioningResult {
  namespaceRBAC: NamespaceRBACConfiguration;
  roleAssignmentIds: string[];
  asoManifests: any[];
  status: "created" | "pending" | "failed";
  message: string;
  createdAt: Date;
}

export interface AzureServiceOperatorRoleAssignment {
  apiVersion: "authorization.azure.com/v1api20200801preview";
  kind: "RoleAssignment";
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    owner: {
      armId: string;
    };
    principalId: string;
    principalType?: "User" | "Group" | "ServicePrincipal";
    roleDefinitionId: string;
    scope?: string;
    description?: string;
  };
}

export interface UserPrincipal {
  objectId: string;
  userPrincipalName: string;
  displayName: string;
  principalType: "User";
  verified: boolean;
}

export interface GroupPrincipal {
  objectId: string;
  displayName: string;
  principalType: "Group";
  verified: boolean;
}

export type AzureADPrincipal = UserPrincipal | GroupPrincipal;

export interface RBACValidationResult {
  valid: boolean;
  principal?: AzureADPrincipal;
  errors: string[];
}

// Standard Azure role definitions for AKS
export const AKS_ROLE_DEFINITIONS = {
  "aks-rbac-admin": "b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b",
  "aks-rbac-cluster-admin": "8e3af657-a8ff-443c-a75c-2fe8c4bcb635",
  "aks-rbac-reader": "7f6c6a51-bcf8-42ba-9220-52d62157d7db",
  "aks-rbac-writer": "a7ffa36f-339b-4b5c-8bdf-e2c188b2c0eb",
} as const;

export type AKSRoleDefinition = keyof typeof AKS_ROLE_DEFINITIONS;
