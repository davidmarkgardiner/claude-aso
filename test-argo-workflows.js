#!/usr/bin/env node

/**
 * Test script for Argo Workflows integration with Platform API
 * 
 * Usage: node test-argo-workflows.js
 * 
 * Prerequisites:
 * - Platform API running locally (npm run dev in platform-api/)
 * - Argo Workflows server accessible (configured in ARGO_WORKFLOWS_URL env var)
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const JWT_TOKEN = process.env.JWT_TOKEN || 'test-token'; // In production, use a real JWT token

// Test data
const testNamespaceRequest = {
  namespaceName: `test-argo-${Date.now()}`,
  team: 'platform-team',
  environment: 'development',
  resourceTier: 'small',
  networkPolicy: 'team-shared',
  features: ['istio-injection', 'monitoring-enhanced'],
  description: 'Test namespace provisioned via Argo Workflows',
  useArgoWorkflows: true // Enable Argo Workflows mode
};

// Axios client with auth
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${JWT_TOKEN}`
  }
});

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.cyan);
  console.log('='.repeat(60));
}

// Test functions
async function testWorkflowsHealth() {
  logSection('Testing Argo Workflows Health Check');
  
  try {
    const response = await apiClient.get('/api/platform/workflows/health');
    
    if (response.data.success && response.data.data.healthy) {
      log('✓ Argo Workflows is healthy', colors.green);
      if (response.data.data.version) {
        log(`  Version: ${response.data.data.version}`, colors.blue);
      }
      return true;
    } else {
      log('✗ Argo Workflows is not healthy', colors.red);
      return false;
    }
  } catch (error) {
    log(`✗ Failed to check Argo Workflows health: ${error.message}`, colors.red);
    return false;
  }
}

async function testNamespaceProvisioningWithArgo() {
  logSection('Testing Namespace Provisioning with Argo Workflows');
  
  try {
    log('Submitting namespace request with Argo Workflows...', colors.yellow);
    log(`  Namespace: ${testNamespaceRequest.namespaceName}`);
    log(`  Team: ${testNamespaceRequest.team}`);
    log(`  Environment: ${testNamespaceRequest.environment}`);
    log(`  Use Argo: ${testNamespaceRequest.useArgoWorkflows}`);
    
    const response = await apiClient.post('/api/platform/namespaces/request', testNamespaceRequest);
    
    if (response.data.success) {
      const result = response.data.data;
      log('✓ Namespace provisioning request submitted successfully', colors.green);
      log(`  Request ID: ${result.requestId}`, colors.blue);
      log(`  Status: ${result.status}`, colors.blue);
      
      if (result.workflowId) {
        log(`  Workflow ID: ${result.workflowId}`, colors.blue);
        log(`  Message: ${result.message}`, colors.blue);
        
        if (result.estimatedCompletionTime) {
          log(`  Estimated completion: ${new Date(result.estimatedCompletionTime).toLocaleString()}`, colors.blue);
        }
        
        return result.requestId;
      } else {
        log('  Note: Direct provisioning was used (no workflow ID)', colors.yellow);
        return null;
      }
    }
  } catch (error) {
    log(`✗ Failed to submit namespace request: ${error.response?.data?.message || error.message}`, colors.red);
    if (error.response?.data?.details) {
      error.response.data.details.forEach(detail => {
        log(`    ${detail.field}: ${detail.message}`, colors.red);
      });
    }
    return null;
  }
}

async function checkProvisioningStatus(requestId) {
  logSection('Checking Provisioning Status');
  
  try {
    const response = await apiClient.get(`/api/platform/namespaces/request/${requestId}/status`);
    
    if (response.data.success) {
      const status = response.data.data;
      log('✓ Retrieved provisioning status', colors.green);
      log(`  Request ID: ${status.requestId}`, colors.blue);
      log(`  Status: ${status.status}`, colors.blue);
      log(`  Message: ${status.message}`, colors.blue);
      
      if (status.workflowId) {
        log(`  Workflow ID: ${status.workflowId}`, colors.blue);
      }
      
      return status;
    }
  } catch (error) {
    log(`✗ Failed to check provisioning status: ${error.response?.data?.message || error.message}`, colors.red);
    return null;
  }
}

async function listWorkflows() {
  logSection('Listing Recent Workflows');
  
  try {
    const response = await apiClient.get('/api/platform/workflows', {
      params: {
        limit: 5
      }
    });
    
    if (response.data.success) {
      const workflows = response.data.data.workflows;
      log(`✓ Found ${workflows.length} workflow(s)`, colors.green);
      
      workflows.forEach((wf, index) => {
        log(`\n  Workflow ${index + 1}:`, colors.cyan);
        log(`    Name: ${wf.metadata.name}`, colors.blue);
        log(`    Namespace: ${wf.metadata.namespace}`, colors.blue);
        log(`    Status: ${wf.status.phase}`, colors.blue);
        log(`    Created: ${new Date(wf.metadata.creationTimestamp).toLocaleString()}`, colors.blue);
        
        if (wf.status.message) {
          log(`    Message: ${wf.status.message}`, colors.blue);
        }
      });
      
      return true;
    }
  } catch (error) {
    log(`✗ Failed to list workflows: ${error.response?.data?.message || error.message}`, colors.red);
    return false;
  }
}

async function testDirectProvisioning() {
  logSection('Testing Direct Provisioning (without Argo)');
  
  const directRequest = {
    ...testNamespaceRequest,
    namespaceName: `test-direct-${Date.now()}`,
    useArgoWorkflows: false // Disable Argo Workflows
  };
  
  try {
    log('Submitting namespace request with direct provisioning...', colors.yellow);
    log(`  Namespace: ${directRequest.namespaceName}`);
    log(`  Use Argo: ${directRequest.useArgoWorkflows}`);
    
    const response = await apiClient.post('/api/platform/namespaces/request', directRequest);
    
    if (response.data.success) {
      const result = response.data.data;
      log('✓ Namespace provisioned directly (synchronously)', colors.green);
      log(`  Request ID: ${result.requestId}`, colors.blue);
      log(`  Status: ${result.status}`, colors.blue);
      log(`  Message: ${result.message}`, colors.blue);
      
      return true;
    }
  } catch (error) {
    log(`✗ Failed to provision namespace directly: ${error.response?.data?.message || error.message}`, colors.red);
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n🚀 Starting Argo Workflows Integration Tests', colors.cyan);
  log(`API Base URL: ${API_BASE_URL}`, colors.blue);
  
  let allTestsPassed = true;
  
  // Test 1: Check Argo Workflows health
  const healthOk = await testWorkflowsHealth();
  if (!healthOk) {
    log('\n⚠️  Argo Workflows is not accessible. Some tests may fail.', colors.yellow);
    log('Make sure Argo Workflows server is running and ARGO_WORKFLOWS_URL is configured.', colors.yellow);
  }
  
  // Test 2: Test direct provisioning (baseline)
  const directOk = await testDirectProvisioning();
  allTestsPassed = allTestsPassed && directOk;
  
  // Test 3: Test Argo Workflows provisioning
  const requestId = await testNamespaceProvisioningWithArgo();
  if (requestId) {
    // Wait a bit for workflow to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 4: Check provisioning status
    const status = await checkProvisioningStatus(requestId);
    allTestsPassed = allTestsPassed && (status !== null);
  } else {
    allTestsPassed = false;
  }
  
  // Test 5: List workflows
  if (healthOk) {
    const listOk = await listWorkflows();
    allTestsPassed = allTestsPassed && listOk;
  }
  
  // Summary
  logSection('Test Summary');
  if (allTestsPassed) {
    log('✅ All tests passed successfully!', colors.green);
    log('\nArgo Workflows integration is working correctly.', colors.green);
  } else {
    log('❌ Some tests failed. Please check the errors above.', colors.red);
    log('\nTroubleshooting tips:', colors.yellow);
    log('1. Ensure Platform API is running: npm run dev', colors.yellow);
    log('2. Check ARGO_WORKFLOWS_URL environment variable', colors.yellow);
    log('3. Verify Argo Workflows server is accessible', colors.yellow);
    log('4. Check JWT_TOKEN for authentication', colors.yellow);
  }
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, colors.red);
  console.error(error.stack);
  process.exit(1);
});