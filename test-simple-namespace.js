#!/usr/bin/env node

/**
 * Simple test to verify Platform API namespace creation patterns work with Minikube
 * This creates a namespace manually to test the core functionality
 */

const k8s = require('@kubernetes/client-node');

async function testBasicNamespaceCreation() {
  console.log('🧪 Simple Namespace Creation Test for Minikube');
  console.log('==============================================');

  // Setup Kubernetes client
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  
  const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  const rbacV1Api = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
  const networkingV1Api = kc.makeApiClient(k8s.NetworkingV1Api);
  
  console.log(`\n🔌 Connected to cluster: ${kc.currentContext}`);
  
  const testNamespaceName = `platform-test-${Date.now()}`;
  console.log(`\n🚀 Creating test namespace: ${testNamespaceName}`);
  
  try {
    // 1. Create namespace with Platform API labels
    console.log('\n1️⃣ Creating namespace...');
    const namespace = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: testNamespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': 'platform-test',
          'platform.io/environment': 'development',
          'platform.io/resource-tier': 'small',
          'platform.io/network-policy': 'team-shared',
          'platform.io/provisioned-by': 'platform-api'
        },
        annotations: {
          'platform.io/requested-by': 'test@company.com',
          'platform.io/requested-at': new Date().toISOString(),
          'platform.io/description': 'Test namespace for Platform API validation',
          'platform.io/features': JSON.stringify(['monitoring-enhanced'])
        }
      }
    };
    
    await coreV1Api.createNamespace(namespace);
    console.log('✅ Namespace created successfully');

    // 2. Create ResourceQuota
    console.log('\n2️⃣ Creating ResourceQuota...');
    const resourceQuota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: 'platform-resource-quota',
        namespace: testNamespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/resource-type': 'quota'
        }
      },
      spec: {
        hard: {
          'requests.cpu': '2',
          'requests.memory': '4Gi',
          'requests.storage': '20Gi',
          'pods': '10',
          'services': '5',
          'secrets': '10',
          'configmaps': '10'
        }
      }
    };
    
    await coreV1Api.createNamespacedResourceQuota(testNamespaceName, resourceQuota);
    console.log('✅ ResourceQuota created successfully');

    // 3. Create LimitRange
    console.log('\n3️⃣ Creating LimitRange...');
    const limitRange = {
      apiVersion: 'v1',
      kind: 'LimitRange',
      metadata: {
        name: 'platform-limit-range',
        namespace: testNamespaceName,
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
              cpu: '2',
              memory: '4Gi'
            }
          },
          {
            type: 'PersistentVolumeClaim',
            max: {
              storage: '20Gi'
            }
          }
        ]
      }
    };
    
    await coreV1Api.createNamespacedLimitRange(testNamespaceName, limitRange);
    console.log('✅ LimitRange created successfully');

    // 4. Create RoleBinding
    console.log('\n4️⃣ Creating RBAC (RoleBinding)...');
    const roleBinding = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: {
        name: 'platform-test-developers',
        namespace: testNamespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': 'platform-test',
          'platform.io/resource-type': 'rbac'
        }
      },
      subjects: [
        {
          kind: 'Group',
          name: 'platform-test-developers',
          apiGroup: 'rbac.authorization.k8s.io'
        }
      ],
      roleRef: {
        kind: 'ClusterRole',
        name: 'edit',
        apiGroup: 'rbac.authorization.k8s.io'
      }
    };
    
    await rbacV1Api.createNamespacedRoleBinding(testNamespaceName, roleBinding);
    console.log('✅ RoleBinding created successfully');

    // 5. Create NetworkPolicy
    console.log('\n5️⃣ Creating NetworkPolicy...');
    const networkPolicy = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'platform-team-shared-policy',
        namespace: testNamespaceName,
        labels: {
          'platform.io/managed': 'true',
          'platform.io/team': 'platform-test',
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
                    'platform.io/team': 'platform-test'
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
                    'platform.io/team': 'platform-test'
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
    
    await networkingV1Api.createNamespacedNetworkPolicy(testNamespaceName, networkPolicy);
    console.log('✅ NetworkPolicy created successfully');

    // Wait a moment for resources to stabilize
    console.log('\n⏳ Waiting 3 seconds for resources to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 6. Verify all resources were created
    console.log('\n6️⃣ Verifying created resources...');
    
    // Check namespace
    const createdNamespace = await coreV1Api.readNamespace(testNamespaceName);
    console.log(`✅ Namespace verified: ${createdNamespace.body.metadata.name}`);
    console.log(`   Created: ${createdNamespace.body.metadata.creationTimestamp}`);
    console.log(`   Team: ${createdNamespace.body.metadata.labels['platform.io/team']}`);
    console.log(`   Environment: ${createdNamespace.body.metadata.labels['platform.io/environment']}`);
    
    // Check ResourceQuota
    const quotas = await coreV1Api.listNamespacedResourceQuota(testNamespaceName);
    console.log(`✅ ResourceQuotas: ${quotas.body.items.length} found`);
    if (quotas.body.items.length > 0) {
      const quota = quotas.body.items[0];
      console.log(`   CPU limit: ${quota.spec.hard['requests.cpu']}`);
      console.log(`   Memory limit: ${quota.spec.hard['requests.memory']}`);
      console.log(`   Pod limit: ${quota.spec.hard['pods']}`);
    }
    
    // Check LimitRange
    const limits = await coreV1Api.listNamespacedLimitRange(testNamespaceName);
    console.log(`✅ LimitRanges: ${limits.body.items.length} found`);
    
    // Check RoleBinding
    const roleBindings = await rbacV1Api.listNamespacedRoleBinding(testNamespaceName);
    console.log(`✅ RoleBindings: ${roleBindings.body.items.length} found`);
    if (roleBindings.body.items.length > 0) {
      const rb = roleBindings.body.items[0];
      console.log(`   Role: ${rb.roleRef.name}`);
      console.log(`   Subject: ${rb.subjects[0].name}`);
    }
    
    // Check NetworkPolicy
    const policies = await networkingV1Api.listNamespacedNetworkPolicy(testNamespaceName);
    console.log(`✅ NetworkPolicies: ${policies.body.items.length} found`);
    
    // Test namespace listing with label selector
    console.log('\n7️⃣ Testing namespace listing with Platform API labels...');
    const managedNamespaces = await coreV1Api.listNamespace(
      undefined, undefined, undefined, undefined, 
      'platform.io/managed=true'
    );
    console.log(`✅ Found ${managedNamespaces.body.items.length} platform-managed namespaces`);
    managedNamespaces.body.items.forEach(ns => {
      const team = ns.metadata.labels?.['platform.io/team'] || 'unknown';
      const env = ns.metadata.labels?.['platform.io/environment'] || 'unknown';
      console.log(`   - ${ns.metadata.name} (team: ${team}, env: ${env})`);
    });

    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✨ Platform API namespace creation patterns work correctly with Minikube');
    
    console.log('\n🔍 Manual verification commands:');
    console.log(`   kubectl describe namespace ${testNamespaceName}`);
    console.log(`   kubectl get resourcequota,limitrange,rolebinding,networkpolicy -n ${testNamespaceName}`);
    console.log(`   kubectl get namespaces -l platform.io/managed=true`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up in 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    await coreV1Api.deleteNamespace(testNamespaceName);
    console.log(`✅ Cleaned up namespace: ${testNamespaceName}`);
    
    console.log('\n🏁 Simple Namespace Test Complete!');
    
    return {
      success: true,
      namespaceName: testNamespaceName,
      resourcesCreated: {
        namespace: true,
        resourceQuota: true,
        limitRange: true,
        roleBinding: true,
        networkPolicy: true
      }
    };
    
  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
    console.log('Error details:', error);
    
    // Try to cleanup on failure
    try {
      await coreV1Api.deleteNamespace(testNamespaceName);
      console.log(`🧹 Cleaned up failed namespace: ${testNamespaceName}`);
    } catch (cleanupError) {
      console.log(`⚠️  Failed to cleanup: ${cleanupError.message}`);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
if (require.main === module) {
  testBasicNamespaceCreation().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { testBasicNamespaceCreation };