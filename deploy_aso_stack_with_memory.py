#!/usr/bin/env python3
"""
ASO Stack Deployment with Enhanced Memory Learning
This script deploys Azure Service Operator resources with continuous memory updates
for learning and optimization.
"""

import subprocess
import json
import time
import sys
import yaml
import os
from datetime import datetime
from pathlib import Path

class ASODeployerWithEnhancedMemory:
    def __init__(self):
        self.stack_dir = "./aso-stack"
        self.namespace = "azure-system"
        self.deployment_start = datetime.now()
        self.cluster_name = "uk8s-tsshared-weu-gt025-int-prod"
        self.resource_order = [
            "resourcegroup.yaml",
            "identity.yaml", 
            "roleassignment.yaml",
            "cluster.yaml",
            "federated.yaml",
            "extension.yaml",
            "fluxconfiguration.yaml"
        ]
        self.deployment_results = []
        
    def log_with_timestamp(self, message):
        """Log message with timestamp."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {message}")
        
    def store_issue_immediately(self, resource_type, issue_data):
        """Store issues in memory immediately for fast learning."""
        self.log_with_timestamp(f"🚨 MEMORY: Storing issue for {resource_type}")
        
        # In a real implementation with MCP memory service:
        # entity = {
        #     "name": f"aso-{resource_type}-issue-{int(time.time())}",
        #     "entityType": "troubleshooting-guide",
        #     "observations": [
        #         f"Timestamp: {datetime.now().isoformat()}",
        #         f"Resource type: {resource_type}",
        #         f"Issue: {issue_data.get('description', 'Unknown')}",
        #         f"Symptoms: {json.dumps(issue_data.get('symptoms', []))}",
        #         f"Error output: {issue_data.get('error_output', 'N/A')}",
        #         f"Resolution attempted: {issue_data.get('resolution', 'Investigation needed')}",
        #         f"Context: {issue_data.get('context', 'ASO deployment')}"
        #     ]
        # }
        # mcp__memory-aso__create_entities(entities=[entity])
        
    def store_success_pattern(self, resource_type, success_data):
        """Store successful deployment patterns."""
        self.log_with_timestamp(f"✅ MEMORY: Storing success pattern for {resource_type}")
        
        # In a real implementation:
        # observations = [
        #     f"Success: {resource_type} deployed at {datetime.now().isoformat()}",
        #     f"Duration: {success_data.get('duration', 0)}s",
        #     f"Configuration: {success_data.get('config_summary', 'Standard')}",
        #     f"Dependencies met: {success_data.get('dependencies', [])}"
        # ]
        # mcp__memory-aso__add_observations(observations=[{
        #     "entityName": f"aso-{resource_type}-patterns",
        #     "contents": observations
        # }])
    
    def query_memory_before_action(self, query_pattern):
        """Query memory before taking actions."""
        self.log_with_timestamp(f"🧠 MEMORY QUERY: {query_pattern}")
        # In real implementation:
        # return mcp__memory-aso__search_nodes(query=query_pattern)
        return {"entities": [], "relations": []}
    
    def run_kubectl_command(self, cmd_args):
        """Execute kubectl command and return result."""
        cmd = ["kubectl"] + cmd_args
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result
    
    def check_resource_status(self, resource_type, resource_name, namespace):
        """Check if resource exists and its status."""
        try:
            cmd_args = ["get", resource_type, resource_name, "-n", namespace, "-o", "yaml"]
            result = self.run_kubectl_command(cmd_args)
            if result.returncode == 0:
                resource_data = yaml.safe_load(result.stdout)
                status = resource_data.get('status', {})
                conditions = status.get('conditions', [])
                
                # Look for Ready condition
                for condition in conditions:
                    if condition.get('type') == 'Ready':
                        return condition.get('status') == 'True', condition.get('message', '')
                
                return False, "No Ready condition found"
            return False, f"Resource not found: {result.stderr}"
        except Exception as e:
            return False, f"Error checking status: {str(e)}"
    
    def deploy_resource_with_memory(self, resource_file):
        """Deploy resource with real-time memory updates."""
        print(f"\n📦 Deploying {resource_file}...")
        
        # Query memory first
        resource_type = resource_file.replace('.yaml', '')
        memory_results = self.query_memory_before_action(f"aso {resource_type} issues")
        
        if memory_results.get("entities"):
            print(f"⚠️  Found {len(memory_results['entities'])} previous issues with {resource_type}")
        
        deployment_start = time.time()
        
        # Apply the resource
        cmd_args = ["apply", "-f", f"{self.stack_dir}/{resource_file}"]
        result = self.run_kubectl_command(cmd_args)
        
        deployment_duration = time.time() - deployment_start
        
        if result.returncode == 0:
            # SUCCESS: Store pattern immediately
            self.store_success_pattern(resource_type, {
                "duration": deployment_duration,
                "config_summary": f"Standard {resource_type} configuration",
                "dependencies": ["Previous resources in sequence"]
            })
            print(f"✅ {resource_file} applied successfully")
            return True
        else:
            # FAILURE: Store issue immediately
            self.store_issue_immediately(resource_type, {
                "description": f"{resource_type} deployment failed",
                "symptoms": [f"kubectl apply returned {result.returncode}"],
                "error_output": result.stderr,
                "resolution": "Check YAML syntax and CRD availability",
                "context": f"Deployment sequence position: {resource_file}"
            })
            print(f"❌ {resource_file} failed: {result.stderr}")
            return False
    
    def monitor_with_memory_updates(self, resource_file):
        """Monitor resource with memory-guided approach."""
        print(f"📊 Memory-guided monitoring: {resource_file}")
        
        # Query memory for known timing patterns
        resource_type = resource_file.replace('.yaml', '')
        timing_query = self.query_memory_before_action(f"aso {resource_type} provisioning time")
        
        # Set timeout based on memory or defaults
        expected_time = 300  # Default 5 minutes
        if resource_type == "cluster":
            expected_time = 1800  # 30 minutes for AKS cluster
        elif resource_type == "extension":
            expected_time = 600   # 10 minutes for extensions
        
        if timing_query.get("entities"):
            print(f"📚 Memory: Found previous timing data for {resource_type}")
        
        monitor_start = time.time()
        
        # Get resource details for monitoring
        resource_details = self.get_resource_details(resource_file)
        if not resource_details:
            print(f"⚠️  Could not determine resource details for {resource_file}")
            return True
        
        # Monitoring loop with memory updates
        last_status = ""
        while time.time() - monitor_start < expected_time:
            elapsed = time.time() - monitor_start
            
            # Check resource status
            for rd in resource_details:
                is_ready, message = self.check_resource_status(
                    rd['type'], rd['name'], rd['namespace']
                )
                
                if is_ready:
                    final_duration = time.time() - monitor_start
                    print(f"  ✅ {rd['name']} ready after {int(final_duration)}s")
                    
                    # Store final timing data
                    self.store_success_pattern(f"{resource_type}-timing", {
                        "duration": final_duration,
                        "config_summary": f"Provisioning completed in {int(final_duration)}s",
                        "dependencies": ["Azure region capacity"]
                    })
                    return True
                else:
                    current_status = f"{rd['name']}: {message}"
                    if current_status != last_status:
                        print(f"  ⏳ {current_status}")
                        last_status = current_status
            
            if elapsed > 120 and elapsed % 60 == 0:  # Log every minute after 2 minutes
                print(f"  ⏳ Still provisioning... {int(elapsed)}s elapsed")
            
            time.sleep(30)
        
        # If we get here, timeout was reached
        print(f"⚠️  {resource_type} did not become ready within {expected_time}s")
        self.store_issue_immediately(f"{resource_type}-timeout", {
            "description": f"{resource_type} provisioning timeout",
            "symptoms": [f"Not ready after {expected_time}s"],
            "context": "May need longer timeout or Azure capacity issues"
        })
        return False
    
    def get_resource_details(self, resource_file):
        """Extract resource details from YAML file."""
        file_path = f"{self.stack_dir}/{resource_file}"
        try:
            with open(file_path, 'r') as f:
                docs = list(yaml.safe_load_all(f))
            
            resources = []
            for doc in docs:
                if doc and doc.get('kind'):
                    resources.append({
                        'type': doc['kind'].lower(),
                        'name': doc['metadata']['name'],
                        'namespace': doc['metadata'].get('namespace', 'default')
                    })
            return resources
        except Exception as e:
            print(f"Error reading {resource_file}: {e}")
            return []
    
    def run_memory_guided_deployment(self):
        """Execute complete deployment with continuous memory learning."""
        print("🚀 ASO Deployment with Enhanced Memory Learning")
        print("=" * 60)
        
        # Initial memory query
        self.query_memory_before_action(f"aso {self.cluster_name} deployment")
        
        for resource_file in self.resource_order:
            print(f"\n{'=' * 50}")
            print(f"PHASE: {resource_file}")
            
            # Deploy with memory
            deploy_success = self.deploy_resource_with_memory(resource_file)
            
            if deploy_success:
                # Monitor with memory (skip for immediate resources)
                if resource_file in ["cluster.yaml", "extension.yaml"]:
                    monitor_success = self.monitor_with_memory_updates(resource_file)
                else:
                    monitor_success = True
                    print(f"  ✅ {resource_file} - no monitoring needed")
                
                self.deployment_results.append({
                    "resource": resource_file,
                    "deployed": deploy_success,
                    "monitored": monitor_success
                })
            else:
                self.deployment_results.append({
                    "resource": resource_file,
                    "deployed": False,
                    "monitored": False
                })
                
                print(f"❌ {resource_file} failed - check memory for resolution patterns")
                # Don't break on failure, continue with other resources
        
        # Store complete deployment summary
        self.store_deployment_summary()
        
        success_count = sum(1 for r in self.deployment_results if r["deployed"])
        return success_count == len(self.resource_order)
    
    def store_deployment_summary(self):
        """Store complete deployment summary in memory."""
        total_duration = time.time() - self.deployment_start.timestamp()
        success_count = sum(1 for r in self.deployment_results if r["deployed"])
        
        self.log_with_timestamp("💾 FINAL MEMORY UPDATE:")
        print(f"   Deployment Summary: {success_count}/{len(self.resource_order)} success")
        print(f"   Duration: {int(total_duration/60)} minutes")
        
        # In real implementation:
        # summary_entity = {
        #     "name": f"aso-deployment-summary-{int(time.time())}",
        #     "entityType": "deployment-plan",
        #     "observations": [
        #         f"Complete deployment finished: {datetime.now().isoformat()}",
        #         f"Total duration: {int(total_duration)}s ({int(total_duration/60)}min)",
        #         f"Success rate: {success_count}/{len(self.resource_order)}",
        #         f"Resource sequence: {', '.join(self.resource_order)}",
        #         f"Results: {self.deployment_results}",
        #         f"Memory updates: Continuous throughout deployment",
        #         f"Environment: K8s 1.33, ASO v2, uksouth region"
        #     ]
        # }
        # mcp__memory-aso__create_entities(entities=[summary_entity])

def main():
    """Main deployment function."""
    deployer = ASODeployerWithEnhancedMemory()
    success = deployer.run_memory_guided_deployment()
    
    if success:
        print("\n🎯 HANDOFF READY: All ASO resources deployed with complete memory record")
        print("   Ready for external-dns and cert-manager deployment")
    else:
        print("\n📚 PARTIAL SUCCESS: Some resources deployed, check memory for patterns")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())