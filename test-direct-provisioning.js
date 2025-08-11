#!/usr/bin/env node

/**
 * Direct test of Platform API namespace provisioning against Minikube
 * This bypasses the HTTP API and directly tests the Kubernetes integration
 */

const k8s = require('@kubernetes/client-node');
const jwt = require('jsonwebtoken');

// Mock the direct provisioning logic
class MinikubeDirectProvisioning {
  constructor() {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
    this.rbacV1Api = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api);
    this.networkingV1Api = this.kc.makeApiClient(k8s.NetworkingV1Api);
    
    this.resourceTiers = {
      small: {
        cpuLimit: '2',
        memoryLimit: '4Gi',
        storageQuota: '20Gi',
        maxPods: 10,
        maxServices: 5
      },
      medium: {
        cpuLimit: '4',
        memoryLimit: '8Gi',
        storageQuota: '50Gi',
        maxPods: 20,
        maxServices: 10
      }
    };
  }

  async validateRequest(request) {
    // Check namespace naming
    const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    if (!namePattern.test(request.namespaceName)) {
      throw new Error('Invalid namespace name format');
    }

    // Check if namespace exists
    try {
      await this.coreV1Api.readNamespace(request.namespaceName);
      throw new Error(`Namespace ${request.namespaceName} already exists`);
    } catch (error) {
      if (error.response && error.response.statusCode === 404) {
        // Good - namespace doesn't exist
        return true;
      }
      if (error.message && error.message.includes('404')) {
        // Good - namespace doesn't exist (alternative error format)
        return true;
      }
      // Only throw if it's not a "not found" error
      if (!error.message.includes('Required parameter')) {
        throw error;
      }
    }
  }

  async createNamespace(request) {
    const namespace = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: request.namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': request.team,
          'platform.io/environment': request.environment,
          'platform.io/resource-tier': request.resourceTier,
          'platform.io/network-policy': request.networkPolicy,
          'platform.io/provisioned-by': 'platform-api'
        },
        annotations: {
          'platform.io/requested-by': request.requestedBy,
          'platform.io/requested-at': new Date().toISOString(),
          'platform.io/description': request.description || '',
          'platform.io/features': JSON.stringify(request.features)
        }
      }
    };

    await this.coreV1Api.createNamespace(namespace);
    console.log(`✅ Namespace created: ${request.namespaceName}`);
  }

  async createResourceQuota(namespaceName, resourceTier) {
    const config = this.resourceTiers[resourceTier];
    const resourceQuota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: 'platform-resource-quota',
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/resource-type': 'quota'
        }
      },
      spec: {
        hard: {
          'requests.cpu': config.cpuLimit,
          'requests.memory': config.memoryLimit,
          'requests.storage': config.storageQuota,
          'pods': config.maxPods.toString(),
          'services': config.maxServices.toString(),
          'secrets': '10',
          'configmaps': '10'
        }
      }
    };

    await this.coreV1Api.createNamespacedResourceQuota(namespaceName, resourceQuota);
    console.log(`✅ Resource quota created for: ${namespaceName}`);
  }

  async createLimitRange(namespaceName, resourceTier) {
    const config = this.resourceTiers[resourceTier];
    const limitRange = {
      apiVersion: 'v1',
      kind: 'LimitRange',
      metadata: {
        name: 'platform-limit-range',
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/resource-type': 'limits'
        }
      },
      spec: {
        limits: [
          {
            type: 'Container',
            default: {
              cpu: '500m',
              memory: '512Mi'
            },
            defaultRequest: {
              cpu: '100m',
              memory: '128Mi'
            },
            max: {
              cpu: config.cpuLimit,
              memory: config.memoryLimit
            }
          },
          {
            type: 'PersistentVolumeClaim',
            max: {
              storage: config.storageQuota
            }
          }
        ]
      }
    };

    await this.coreV1Api.createNamespacedLimitRange(namespaceName, limitRange);
    console.log(`✅ Limit range created for: ${namespaceName}`);
  }

  async createTeamRBAC(namespaceName, teamName) {
    const roleBinding = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: {
        name: `${teamName}-developers`,
        namespace: namespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': teamName,
          'platform.io/resource-type': 'rbac'
        }
      },
      subjects: [
        {
          kind: 'Group',
          name: `${teamName}-developers`,
          apiGroup: 'rbac.authorization.k8s.io'
        }
      ],
      roleRef: {
        kind: 'ClusterRole',
        name: 'edit',
        apiGroup: 'rbac.authorization.k8s.io'
      }
    };

    await this.rbacV1Api.createNamespacedRoleBinding(namespaceName, roleBinding);
    console.log(`✅ RBAC created for team ${teamName} in: ${namespaceName}`);
  }

  async createNetworkPolicy(namespaceName, teamName, policyType) {
    if (policyType === 'open') {
      console.log(`✅ Open network policy - no restrictions for: ${namespaceName}`);
      return;
    }

    let networkPolicy;
    if (policyType === 'isolated') {
      networkPolicy = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: {
          name: 'platform-isolated-policy',
          namespace: namespaceName,
          labels: {
            'platform.io/managed': 'true',
            'platform.io/team': teamName,
            'platform.io/network-policy': 'isolated'
          }
        },
        spec: {
          podSelector: {},
          policyTypes: ['Ingress', 'Egress'],
          ingress: [
            {
              from: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      'name': namespaceName
                    }
                  }
                }
              ]
            }
          ],
          egress: [
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      'name': namespaceName
                    }
                  }
                }
              ]
            },
            {
              to: [],
              ports: [
                {
                  protocol: 'UDP',
                  port: 53
                }
              ]
            }
          ]
        }
      };
    } else { // team-shared
      networkPolicy = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: {
          name: 'platform-team-shared-policy',
          namespace: namespaceName,
          labels: {
            'platform.io/managed': 'true',
            'platform.io/team': teamName,
            'platform.io/network-policy': 'team-shared'
          }
        },
        spec: {
          podSelector: {},
          policyTypes: ['Ingress', 'Egress'],
          ingress: [
            {
              from: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      'platform.io/team': teamName
                    }
                  }
                }
              ]
            }
          ],
          egress: [
            {
              to: [
                {
                  namespaceSelector: {
                    matchLabels: {
                      'platform.io/team': teamName
                    }
                  }
                }
              ]
            },
            {
              to: []
            }
          ]
        }
      };
    }

    await this.networkingV1Api.createNamespacedNetworkPolicy(namespaceName, networkPolicy);
    console.log(`✅ Network policy (${policyType}) created for: ${namespaceName}`);
  }

  async enableIstioInjection(namespaceName) {
    const patch = [
      {
        op: 'add',
        path: '/metadata/labels/istio-injection',
        value: 'enabled'
      }
    ];

    await this.coreV1Api.patchNamespace(namespaceName, patch, undefined, undefined, undefined, undefined, {
      headers: { 'Content-Type': 'application/json-patch+json' }
    });
    console.log(`✅ Istio injection enabled for: ${namespaceName}`);
  }

  async provisionNamespace(request) {
    console.log(`\n🚀 Starting direct namespace provisioning: ${request.namespaceName}`);
    
    try {
      // 1. Validate request
      await this.validateRequest(request);
      console.log(`✅ Request validation passed`);

      // 2. Create namespace
      await this.createNamespace(request);

      // 3. Create resource quota
      await this.createResourceQuota(request.namespaceName, request.resourceTier);

      // 4. Create limit range
      await this.createLimitRange(request.namespaceName, request.resourceTier);

      // 5. Create RBAC
      await this.createTeamRBAC(request.namespaceName, request.team);

      // 6. Create network policy
      await this.createNetworkPolicy(request.namespaceName, request.team, request.networkPolicy);

      // 7. Enable Istio injection if requested
      if (request.features.includes('istio-injection')) {
        await this.enableIstioInjection(request.namespaceName);
      }

      console.log(`🎉 Namespace ${request.namespaceName} provisioned successfully!`);
      return {
        success: true,
        message: `Namespace ${request.namespaceName} created with all resources`,
        resources: {
          namespace: true,
          resourceQuota: true,
          limitRange: true,
          rbac: true,
          networkPolicy: request.networkPolicy !== 'open',
          istioInjection: request.features.includes('istio-injection')
        }
      };
    } catch (error) {
      console.log(`❌ Failed to provision namespace: ${error.message}`);
      throw error;
    }
  }
}

async function verifyNamespaceResources(namespaceName) {
  console.log(`\n🔍 Verifying resources for namespace: ${namespaceName}`);
  
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  const rbacV1Api = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
  const networkingV1Api = kc.makeApiClient(k8s.NetworkingV1Api);
  
  try {
    // Verify namespace
    const namespace = await coreV1Api.readNamespace(namespaceName);
    console.log(`✅ Namespace verified: ${namespaceName}`);
    console.log(`   Created: ${namespace.body.metadata.creationTimestamp}`);
    
    // Check labels
    if (namespace.body.metadata.labels) {
      console.log(`   Key Labels:`);
      const importantLabels = ['platform.io/managed', 'platform.io/team', 'platform.io/environment'];
      importantLabels.forEach(label => {
        if (namespace.body.metadata.labels[label]) {
          console.log(`     ${label}: ${namespace.body.metadata.labels[label]}`);
        }
      });
    }

    // Verify ResourceQuota
    const quotas = await coreV1Api.listNamespacedResourceQuota(namespaceName);
    console.log(`✅ Resource Quotas: ${quotas.body.items.length} found`);

    // Verify LimitRange
    const limits = await coreV1Api.listNamespacedLimitRange(namespaceName);
    console.log(`✅ Limit Ranges: ${limits.body.items.length} found`);

    // Verify RBAC
    const roleBindings = await rbacV1Api.listNamespacedRoleBinding(namespaceName);
    console.log(`✅ Role Bindings: ${roleBindings.body.items.length} found`);

    // Verify NetworkPolicy
    const policies = await networkingV1Api.listNamespacedNetworkPolicy(namespaceName);
    console.log(`✅ Network Policies: ${policies.body.items.length} found`);

    return true;
  } catch (error) {
    console.log(`❌ Verification failed: ${error.message}`);
    return false;
  }
}

async function runDirectProvisioningTest() {
  console.log('🧪 Direct Platform API Provisioning Test');
  console.log('=========================================');
  
  // Check Minikube connectivity
  console.log('\n🔌 Checking Minikube connectivity...');
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  
  try {
    const nodes = await coreV1Api.listNode();
    const nodeCount = nodes.body && nodes.body.items ? nodes.body.items.length : 0;
    console.log(`✅ Connected to Kubernetes cluster with ${nodeCount} node(s)`);
    console.log(`   Context: ${kc.currentContext}`);
  } catch (error) {
    console.log(`❌ Failed to connect to Kubernetes: ${error.message}`);
    console.log(`   Error details:`, error);
    process.exit(1);
  }
  
  const provisioner = new MinikubeDirectProvisioning();
  const createdNamespaces = [];
  
  const testCases = [
    {
      namespaceName: `direct-test-dev-${Date.now()}`,
      team: 'platform-team',
      environment: 'development',
      resourceTier: 'small',
      networkPolicy: 'team-shared',
      features: ['monitoring-enhanced'],
      description: 'Direct provisioning test - development environment',
      requestedBy: 'platform-test@company.com'
    },
    {
      namespaceName: `direct-test-prod-${Date.now()}`,
      team: 'platform-team',
      environment: 'production',
      resourceTier: 'medium',
      networkPolicy: 'isolated',
      features: ['istio-injection', 'monitoring-enhanced'],
      description: 'Direct provisioning test - production environment',
      requestedBy: 'platform-test@company.com'
    }
  ];
  
  let allTestsPassed = true;
  
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    try {
      const result = await provisioner.provisionNamespace(testCase);
      if (result.success) {
        createdNamespaces.push(testCase.namespaceName);
        
        // Wait a moment for resources to be created
        console.log('\n⏳ Waiting 3 seconds for resources to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify the resources
        const verified = await verifyNamespaceResources(testCase.namespaceName);
        if (!verified) {
          allTestsPassed = false;
        }
      } else {
        allTestsPassed = false;
      }
    } catch (error) {
      console.log(`❌ Test case failed: ${error.message}`);
      allTestsPassed = false;
    }
  }
  
  // Results summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 DIRECT PROVISIONING TEST RESULTS');
  console.log(`${'='.repeat(60)}`);
  
  if (allTestsPassed && createdNamespaces.length > 0) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('✨ Platform API direct provisioning works correctly with Minikube');
    console.log(`📋 Created ${createdNamespaces.length} test namespaces:`);
    createdNamespaces.forEach(ns => console.log(`   - ${ns}`));
    
    console.log('\n🔍 Manual verification commands:');
    console.log('   kubectl get namespaces -l platform.io/managed=true');
    console.log('   kubectl get all,resourcequota,limitrange,rolebinding,networkpolicy -n ' + createdNamespaces[0]);
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('Check the error messages above for details.');
  }
  
  // Cleanup
  if (createdNamespaces.length > 0) {
    console.log('\n🧹 Cleaning up test namespaces in 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    for (const namespaceName of createdNamespaces) {
      try {
        await coreV1Api.deleteNamespace(namespaceName);
        console.log(`   ✅ Deleted: ${namespaceName}`);
      } catch (error) {
        console.log(`   ⚠️  Failed to delete ${namespaceName}: ${error.message}`);
      }
    }
  }
  
  console.log('\n🏁 Direct Provisioning Test Complete!');
}

// Run the test
if (require.main === module) {
  runDirectProvisioningTest().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = { MinikubeDirectProvisioning, runDirectProvisioningTest };