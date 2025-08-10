#!/usr/bin/env python3
"""
Cert-Manager Validation Script for Azure Workload Identity
Validates cert-manager installation and certificate issuance capabilities
"""

import subprocess
import json
import time
import sys
from datetime import datetime
import yaml

class CertManagerValidator:
    def __init__(self):
        self.namespace = "cert-manager"
        self.dns_zone = "davidmarkgardiner.co.uk"
        self.cluster = "uk8s-tsshared-weu-gt025-int-prod"
        self.client_id = "1317ba0a-60d3-4f05-b41e-483ed1d6acb3"
        self.results = []
        
    def run_kubectl(self, args, check=True):
        """Run kubectl command and return result."""
        cmd = ["kubectl"] + args
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=check)
            return result
        except subprocess.CalledProcessError as e:
            print(f"❌ Command failed: {' '.join(cmd)}")
            print(f"   Error: {e.stderr}")
            return None
    
    def run_az(self, args, check=True):
        """Run Azure CLI command and return result."""
        cmd = ["az"] + args
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=check)
            return result
        except subprocess.CalledProcessError as e:
            print(f"❌ Azure CLI command failed: {' '.join(cmd)}")
            print(f"   Error: {e.stderr}")
            return None
    
    def check_cert_manager_pods(self):
        """Verify cert-manager pods are running."""
        print("🔍 Checking cert-manager pods...")
        
        result = self.run_kubectl(["get", "pods", "-n", self.namespace, "-o", "json"])
        if not result:
            return False
            
        try:
            data = json.loads(result.stdout)
            pods = data.get("items", [])
            
            expected_pods = ["cert-manager", "cert-manager-webhook", "cert-manager-cainjector"]
            running_pods = []
            
            for pod in pods:
                name = pod["metadata"]["name"]
                status = pod["status"]["phase"]
                
                for expected in expected_pods:
                    if expected in name:
                        if status == "Running":
                            print(f"✅ {expected} is running")
                            running_pods.append(expected)
                        else:
                            print(f"❌ {expected} status: {status}")
            
            success = len(running_pods) >= 3
            self.results.append(("Cert-Manager Pods", success))
            return success
            
        except json.JSONDecodeError:
            print(f"❌ Failed to parse pod status")
            return False
    
    def check_crds_installed(self):
        """Verify cert-manager CRDs are installed."""
        print("🔍 Checking cert-manager CRDs...")
        
        required_crds = [
            "certificates.cert-manager.io",
            "certificaterequests.cert-manager.io",
            "issuers.cert-manager.io",
            "clusterissuers.cert-manager.io",
            "challenges.acme.cert-manager.io",
            "orders.acme.cert-manager.io"
        ]
        
        result = self.run_kubectl(["get", "crd"])
        if not result:
            return False
        
        missing = []
        for crd in required_crds:
            if crd not in result.stdout:
                missing.append(crd)
        
        if missing:
            print(f"❌ Missing CRDs: {missing}")
            success = False
        else:
            print("✅ All required CRDs are installed")
            success = True
        
        self.results.append(("CRDs Installed", success))
        return success
    
    def check_clusterissuers(self):
        """Verify ClusterIssuers are ready."""
        print("🔍 Checking ClusterIssuers...")
        
        result = self.run_kubectl(["get", "clusterissuer", "-o", "json"])
        if not result:
            return False
        
        try:
            data = json.loads(result.stdout)
            issuers = data.get("items", [])
            
            ready_issuers = []
            for issuer in issuers:
                name = issuer["metadata"]["name"]
                status = issuer.get("status", {})
                conditions = status.get("conditions", [])
                
                ready = False
                for condition in conditions:
                    if condition["type"] == "Ready" and condition["status"] == "True":
                        ready = True
                        break
                
                if ready:
                    print(f"✅ ClusterIssuer {name} is ready")
                    ready_issuers.append(name)
                else:
                    print(f"❌ ClusterIssuer {name} is not ready")
            
            success = len(ready_issuers) >= 2  # Expecting at least staging and production
            self.results.append(("ClusterIssuers Ready", success))
            return success
            
        except json.JSONDecodeError:
            print("❌ Failed to parse ClusterIssuer status")
            return False
    
    def check_workload_identity(self):
        """Verify Azure Workload Identity configuration."""
        print("🔍 Checking Azure Workload Identity configuration...")
        
        # Check service account annotations
        result = self.run_kubectl(["get", "serviceaccount", "cert-manager", "-n", self.namespace, "-o", "json"])
        if not result:
            return False
        
        try:
            data = json.loads(result.stdout)
            annotations = data.get("metadata", {}).get("annotations", {})
            labels = data.get("metadata", {}).get("labels", {})
            
            # Check for workload identity annotation
            client_id_annotation = annotations.get("azure.workload.identity/client-id")
            workload_label = labels.get("azure.workload.identity/use")
            
            if client_id_annotation == self.client_id:
                print(f"✅ Service account has correct client ID: {client_id_annotation}")
            else:
                print(f"❌ Service account client ID mismatch. Expected: {self.client_id}, Got: {client_id_annotation}")
                return False
            
            if workload_label == "true":
                print("✅ Service account has workload identity label")
            else:
                print(f"❌ Service account missing workload identity label")
                return False
            
            success = True
            self.results.append(("Workload Identity Config", success))
            return success
            
        except json.JSONDecodeError:
            print("❌ Failed to parse service account configuration")
            return False
    
    def check_azure_permissions(self):
        """Verify Azure DNS permissions."""
        print("🔍 Checking Azure DNS permissions...")
        
        # List DNS TXT records to verify permissions
        result = self.run_az([
            "network", "dns", "record-set", "txt", "list",
            "--zone-name", self.dns_zone,
            "--resource-group", "dns",
            "--query", "[?contains(name, 'acme-challenge')].name",
            "-o", "json"
        ])
        
        if result and result.returncode == 0:
            try:
                records = json.loads(result.stdout)
                if records:
                    print(f"✅ Found {len(records)} ACME challenge records in DNS zone")
                    print(f"   Records: {records}")
                else:
                    print("ℹ️ No ACME challenge records found (this is normal if no certificates are being issued)")
                
                success = True
                self.results.append(("Azure DNS Permissions", success))
                return success
                
            except json.JSONDecodeError:
                print("❌ Failed to parse DNS records")
                return False
        else:
            print("❌ Cannot access Azure DNS zone - check permissions")
            return False
    
    def test_certificate_issuance(self, timeout_seconds=300):
        """Test certificate issuance with staging issuer."""
        print("🧪 Testing certificate issuance...")
        
        # Create a test certificate
        test_name = f"test-cert-{int(time.time())}"
        cert_yaml = {
            "apiVersion": "cert-manager.io/v1",
            "kind": "Certificate",
            "metadata": {
                "name": test_name,
                "namespace": "default"
            },
            "spec": {
                "secretName": f"{test_name}-tls",
                "dnsNames": [f"{test_name}.{self.dns_zone}"],
                "issuerRef": {
                    "name": "letsencrypt-staging-dns01",
                    "kind": "ClusterIssuer"
                }
            }
        }
        
        # Apply certificate
        with open(f"/tmp/{test_name}.yaml", "w") as f:
            yaml.dump(cert_yaml, f)
        
        apply_result = self.run_kubectl(["apply", "-f", f"/tmp/{test_name}.yaml"])
        if not apply_result:
            return False
        
        print(f"✅ Created test certificate: {test_name}")
        
        # Wait for certificate to be ready
        start_time = time.time()
        while time.time() - start_time < timeout_seconds:
            result = self.run_kubectl([
                "get", "certificate", test_name,
                "-o", "jsonpath={.status.conditions[?(@.type=='Ready')].status}"
            ])
            
            if result and result.stdout.strip() == "True":
                elapsed = time.time() - start_time
                print(f"✅ Certificate issued successfully in {elapsed:.1f} seconds")
                
                # Cleanup
                self.run_kubectl(["delete", "certificate", test_name], check=False)
                
                success = True
                self.results.append(("Certificate Issuance Test", success))
                return success
            
            # Check for errors
            cert_status = self.run_kubectl(["describe", "certificate", test_name])
            if cert_status and "Error" in cert_status.stdout:
                print("❌ Certificate issuance failed:")
                print(cert_status.stdout)
                break
            
            time.sleep(10)
        
        print(f"❌ Certificate issuance timed out after {timeout_seconds} seconds")
        
        # Cleanup
        self.run_kubectl(["delete", "certificate", test_name], check=False)
        
        self.results.append(("Certificate Issuance Test", False))
        return False
    
    def generate_summary(self):
        """Generate validation summary."""
        print("\n" + "="*60)
        print("CERT-MANAGER VALIDATION SUMMARY")
        print("="*60)
        
        passed = sum(1 for _, success in self.results if success)
        total = len(self.results)
        
        print(f"Cluster: {self.cluster}")
        print(f"Namespace: {self.namespace}")
        print(f"DNS Zone: {self.dns_zone}")
        print(f"Client ID: {self.client_id}")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print("-" * 60)
        
        for check_name, success in self.results:
            status = "✅ PASS" if success else "❌ FAIL"
            print(f"{check_name:<30} {status}")
        
        print("-" * 60)
        print(f"Overall: {passed}/{total} checks passed")
        
        if passed == total:
            print("🎉 All validations passed! Cert-manager is ready for production use.")
            return True
        else:
            print("⚠️  Some validations failed. Please review and fix issues before production use.")
            return False
    
    def run_all_validations(self):
        """Run all validation checks."""
        print("🚀 Starting Cert-Manager validation")
        print("="*60)
        
        checks = [
            ("CRDs Installation", self.check_crds_installed),
            ("Pod Status", self.check_cert_manager_pods),
            ("Workload Identity", self.check_workload_identity),
            ("ClusterIssuers", self.check_clusterissuers),
            ("Azure DNS Permissions", self.check_azure_permissions),
            # ("Certificate Issuance", self.test_certificate_issuance)  # Optional - can take 5+ minutes
        ]
        
        for name, check_func in checks:
            print(f"\n📌 Running: {name}")
            try:
                check_func()
            except Exception as e:
                print(f"❌ Check failed with exception: {e}")
                self.results.append((name, False))
        
        return self.generate_summary()

if __name__ == "__main__":
    validator = CertManagerValidator()
    success = validator.run_all_validations()
    sys.exit(0 if success else 1)