#!/usr/bin/env python3
"""
Istio Comprehensive Test Suite
Tests all aspects of the deployed Istio service mesh
"""

import subprocess
import json
import time
import requests
import yaml
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Tuple, Any

class IstioTestSuite:
    def __init__(self):
        self.test_results = []
        self.security_findings = []
        self.performance_metrics = []
        self.start_time = datetime.now()
        
        # AKS-specific configuration
        self.ingress_namespace = "aks-istio-ingress"
        self.system_namespace = "aks-istio-system"
        self.test_namespaces = ["istio-demo", "istio-staging", "istio-production"]
        
        # Get ingress IP
        self.ingress_ip = self.get_ingress_ip()
        self.test_domains = {
            "demo": "demo.istio.local",
            "staging": "staging.istio.local", 
            "production": "prod.istio.local"
        }
        
    def get_ingress_ip(self) -> str:
        """Get the ingress gateway IP address."""
        cmd = f"kubectl get svc -n {self.ingress_namespace} -o json"
        result = subprocess.run(cmd.split(), capture_output=True, text=True)
        
        if result.returncode == 0:
            services = json.loads(result.stdout)
            for svc in services.get('items', []):
                if 'ingress' in svc['metadata']['name'].lower():
                    # For testing, we'll use port-forward if no external IP
                    external_ip = svc.get('status', {}).get('loadBalancer', {}).get('ingress')
                    if external_ip and len(external_ip) > 0:
                        return external_ip[0].get('ip', 'localhost')
        
        # Fallback to localhost for port-forwarding
        return 'localhost'
    
    def store_test_result(self, test_name: str, passed: bool, details: Dict[str, Any]):
        """Store test result with immediate memory update."""
        result = {
            "test": test_name,
            "passed": passed,
            "timestamp": datetime.now().isoformat(),
            "details": details
        }
        
        self.test_results.append(result)
        
        status_symbol = "✅" if passed else "❌"
        status_text = "PASSED" if passed else "FAILED"
        print(f"  {status_symbol} {test_name}: {status_text}")
        
        if not passed:
            print(f"    Details: {details.get('error', details)}")
        
        return result
    
    def store_security_finding(self, severity: str, finding_type: str, description: str, remediation: str):
        """Store security finding."""
        finding = {
            "severity": severity,
            "type": finding_type,
            "description": description,
            "remediation": remediation,
            "timestamp": datetime.now().isoformat()
        }
        
        self.security_findings.append(finding)
        print(f"  🔒 Security finding ({severity}): {description}")
    
    def run_kubectl_cmd(self, cmd: str) -> Tuple[bool, str]:
        """Execute kubectl command and return success status and output."""
        full_cmd = f"kubectl {cmd}"
        result = subprocess.run(full_cmd.split(), capture_output=True, text=True)
        return result.returncode == 0, result.stdout.strip()
    
    def test_control_plane_health(self):
        """Test Istio control plane health."""
        print("\n🏥 Testing Control Plane Health...")
        
        # Check istiod pods
        success, output = self.run_kubectl_cmd(f"get pods -n {self.system_namespace} -l app=istiod")
        
        if success and output:
            pods = []
            for line in output.split('\n')[1:]:  # Skip header
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 3:
                        pods.append({
                            "name": parts[0],
                            "ready": parts[1],
                            "status": parts[2]
                        })
            
            all_ready = all(pod["status"] == "Running" for pod in pods)
            ready_count = sum(1 for pod in pods if pod["status"] == "Running")
            
            self.store_test_result(
                "control_plane_health",
                all_ready and len(pods) > 0,
                {
                    "total_pods": len(pods),
                    "ready_pods": ready_count,
                    "pods": pods
                }
            )
        else:
            self.store_test_result(
                "control_plane_health",
                False,
                {"error": "Could not retrieve control plane pods"}
            )
    
    def test_sidecar_injection(self):
        """Test sidecar injection in test namespaces."""
        print("\n💉 Testing Sidecar Injection...")
        
        for namespace in self.test_namespaces:
            success, output = self.run_kubectl_cmd(f"get pods -n {namespace} -o json")
            
            if success:
                pods_data = json.loads(output)
                injected_count = 0
                total_pods = 0
                
                for pod in pods_data.get('items', []):
                    total_pods += 1
                    containers = pod.get('spec', {}).get('containers', [])
                    
                    # Check for istio-proxy container
                    has_proxy = any(c.get('name') == 'istio-proxy' for c in containers)
                    if has_proxy:
                        injected_count += 1
                
                injection_rate = (injected_count / total_pods * 100) if total_pods > 0 else 0
                
                self.store_test_result(
                    f"sidecar_injection_{namespace}",
                    injection_rate >= 90,  # At least 90% should have sidecars
                    {
                        "namespace": namespace,
                        "total_pods": total_pods,
                        "injected_pods": injected_count,
                        "injection_rate": f"{injection_rate:.1f}%"
                    }
                )
            else:
                self.store_test_result(
                    f"sidecar_injection_{namespace}",
                    False,
                    {"error": f"Could not get pods in namespace {namespace}"}
                )
    
    def setup_port_forward(self):
        """Setup port forwarding for testing if no external IP."""
        if self.ingress_ip == 'localhost':
            print("\n🔄 Setting up port forwarding for testing...")
            
            # Find the ingress gateway service
            success, output = self.run_kubectl_cmd(f"get svc -n {self.ingress_namespace}")
            if success:
                # Start port forwarding in background
                cmd = f"kubectl port-forward -n {self.ingress_namespace} svc/aks-istio-ingressgateway-internal 8080:80 8443:443"
                subprocess.Popen(cmd.split(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(5)  # Wait for port forward to establish
                print("  ✅ Port forwarding established (localhost:8080 -> 80, localhost:8443 -> 443)")
                return "localhost:8080", "localhost:8443"
        
        return f"{self.ingress_ip}:80", f"{self.ingress_ip}:443"
    
    def test_gateway_routing(self):
        """Test Gateway routing functionality."""
        print("\n🌐 Testing Gateway Routing...")
        
        http_endpoint, https_endpoint = self.setup_port_forward()
        
        # Test each domain
        for env, domain in self.test_domains.items():
            try:
                # Test HTTP request
                response = requests.get(
                    f"http://{http_endpoint}/",
                    headers={"Host": domain},
                    timeout=10,
                    allow_redirects=False
                )
                
                # Check if we get a response (could be redirect or direct response)
                passed = response.status_code in [200, 301, 302, 404]  # Any valid HTTP response
                
                self.store_test_result(
                    f"gateway_routing_{env}",
                    passed,
                    {
                        "domain": domain,
                        "status_code": response.status_code,
                        "response_time_ms": response.elapsed.total_seconds() * 1000
                    }
                )
                
            except Exception as e:
                self.store_test_result(
                    f"gateway_routing_{env}",
                    False,
                    {
                        "domain": domain,
                        "error": str(e)
                    }
                )
    
    def test_canary_routing(self):
        """Test canary routing in demo environment."""
        print("\n🔀 Testing Canary Routing...")
        
        # Get the current VirtualService for demo
        success, output = self.run_kubectl_cmd("get virtualservice demo-virtualservice -n istio-demo -o json")
        
        if success:
            vs_data = json.loads(output)
            http_routes = vs_data.get('spec', {}).get('http', [])
            
            if http_routes and 'route' in http_routes[0]:
                routes = http_routes[0]['route']
                
                # Check weight distribution
                weights = {route['destination']['subset']: route.get('weight', 0) for route in routes}
                
                # Test actual traffic distribution
                version_counts = {"v1": 0, "v2": 0}
                total_requests = 50
                
                http_endpoint, _ = self.setup_port_forward()
                
                for i in range(total_requests):
                    try:
                        response = requests.get(
                            f"http://{http_endpoint}/",
                            headers={"Host": self.test_domains["demo"]},
                            timeout=5
                        )
                        
                        if response.status_code == 200:
                            # Try to determine version from response
                            if "6.0.0" in response.text or "v1" in response.text.lower():
                                version_counts["v1"] += 1
                            elif "6.0.1" in response.text or "v2" in response.text.lower():
                                version_counts["v2"] += 1
                    except:
                        pass
                
                total_successful = version_counts["v1"] + version_counts["v2"]
                if total_successful > 0:
                    v1_percentage = version_counts["v1"] / total_successful * 100
                    v2_percentage = version_counts["v2"] / total_successful * 100
                    
                    # Allow 20% deviation from configured weights
                    expected_v1 = weights.get('v1', 90)
                    expected_v2 = weights.get('v2', 10)
                    
                    v1_within_range = abs(v1_percentage - expected_v1) <= 20
                    v2_within_range = abs(v2_percentage - expected_v2) <= 20
                    
                    passed = v1_within_range or v2_within_range  # At least one should be close
                    
                    self.store_test_result(
                        "canary_routing_demo",
                        passed,
                        {
                            "configured_weights": weights,
                            "actual_distribution": {
                                "v1": f"{v1_percentage:.1f}%",
                                "v2": f"{v2_percentage:.1f}%"
                            },
                            "total_requests": total_successful,
                            "version_counts": version_counts
                        }
                    )
                else:
                    self.store_test_result(
                        "canary_routing_demo",
                        False,
                        {"error": "No successful responses to measure distribution"}
                    )
            else:
                self.store_test_result(
                    "canary_routing_demo",
                    False,
                    {"error": "VirtualService route configuration not found"}
                )
        else:
            self.store_test_result(
                "canary_routing_demo",
                False,
                {"error": "Could not retrieve VirtualService configuration"}
            )
    
    def test_destination_rules(self):
        """Test DestinationRule configurations."""
        print("\n📋 Testing DestinationRule Configurations...")
        
        for namespace in self.test_namespaces:
            success, output = self.run_kubectl_cmd(f"get destinationrule podinfo-destination-rule -n {namespace} -o json")
            
            if success:
                dr_data = json.loads(output)
                spec = dr_data.get('spec', {})
                
                # Check for subsets
                subsets = spec.get('subsets', [])
                has_subsets = len(subsets) >= 2  # Should have v1 and v2
                
                # Check for traffic policy
                traffic_policy = spec.get('trafficPolicy', {})
                has_load_balancer = 'loadBalancer' in traffic_policy
                has_circuit_breaker = 'connectionPool' in traffic_policy or 'outlierDetection' in traffic_policy
                
                self.store_test_result(
                    f"destination_rule_{namespace}",
                    has_subsets,
                    {
                        "namespace": namespace,
                        "subsets_count": len(subsets),
                        "has_load_balancer": has_load_balancer,
                        "has_circuit_breaker": has_circuit_breaker,
                        "subsets": [s.get('name') for s in subsets]
                    }
                )
            else:
                self.store_test_result(
                    f"destination_rule_{namespace}",
                    False,
                    {"error": f"Could not retrieve DestinationRule in {namespace}"}
                )
    
    def test_namespace_isolation(self):
        """Test namespace isolation with authorization policies."""
        print("\n🔒 Testing Namespace Isolation...")
        
        # Check for authorization policies
        for namespace in self.test_namespaces:
            success, output = self.run_kubectl_cmd(f"get authorizationpolicy -n {namespace}")
            
            has_policies = success and output and len(output.split('\n')) > 1
            
            if has_policies:
                # Try to access service from different namespace (if possible)
                # For now, just verify the policy exists
                self.store_test_result(
                    f"namespace_isolation_{namespace}",
                    True,
                    {"has_authorization_policies": True}
                )
            else:
                # This is a security finding - no isolation policies
                self.store_security_finding(
                    "HIGH",
                    "missing_authorization_policy",
                    f"No authorization policies found in namespace {namespace}",
                    f"Implement authorization policies to restrict cross-namespace access in {namespace}"
                )
                
                self.store_test_result(
                    f"namespace_isolation_{namespace}",
                    False,
                    {"has_authorization_policies": False}
                )
    
    def test_mtls_configuration(self):
        """Test mTLS configuration."""
        print("\n🔐 Testing mTLS Configuration...")
        
        # Check for PeerAuthentication policies
        success, output = self.run_kubectl_cmd("get peerauthentication -A")
        
        has_peer_auth = success and output and len(output.split('\n')) > 1
        
        if has_peer_auth:
            # Parse the output to check for STRICT mode
            strict_policies = 0
            for line in output.split('\n')[1:]:
                if line.strip():
                    # Get detailed info about each policy
                    parts = line.split()
                    if len(parts) >= 2:
                        namespace = parts[0]
                        name = parts[1]
                        
                        policy_success, policy_output = self.run_kubectl_cmd(
                            f"get peerauthentication {name} -n {namespace} -o json"
                        )
                        
                        if policy_success:
                            policy_data = json.loads(policy_output)
                            mtls_mode = policy_data.get('spec', {}).get('mtls', {}).get('mode', 'PERMISSIVE')
                            if mtls_mode == 'STRICT':
                                strict_policies += 1
            
            self.store_test_result(
                "mtls_configuration",
                strict_policies > 0,
                {
                    "has_peer_authentication": True,
                    "strict_policies_count": strict_policies
                }
            )
        else:
            # Check if mTLS is configured at mesh level
            success, output = self.run_kubectl_cmd(f"get configmap istio -n {self.system_namespace} -o json")
            
            mesh_mtls = False
            if success:
                config_data = json.loads(output)
                mesh_config = config_data.get('data', {}).get('mesh', '')
                mesh_mtls = 'STRICT' in mesh_config
            
            if not mesh_mtls:
                self.store_security_finding(
                    "MEDIUM",
                    "mtls_not_strict",
                    "mTLS is not configured in STRICT mode",
                    "Configure PeerAuthentication policies with STRICT mTLS mode"
                )
            
            self.store_test_result(
                "mtls_configuration",
                mesh_mtls,
                {
                    "has_peer_authentication": has_peer_auth,
                    "mesh_level_mtls": mesh_mtls
                }
            )
    
    def test_external_services(self):
        """Test external service access via ServiceEntry."""
        print("\n🌍 Testing External Service Access...")
        
        # Check for ServiceEntry configurations
        success, output = self.run_kubectl_cmd("get serviceentry -A")
        
        has_service_entries = success and output and len(output.split('\n')) > 1
        
        if has_service_entries:
            service_entries = []
            for line in output.split('\n')[1:]:
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 2:
                        service_entries.append({
                            "namespace": parts[0],
                            "name": parts[1]
                        })
            
            # Test external connectivity from a pod (if possible)
            # For now, just verify ServiceEntry exists
            self.store_test_result(
                "external_services",
                True,
                {
                    "service_entries_count": len(service_entries),
                    "service_entries": service_entries
                }
            )
        else:
            self.store_test_result(
                "external_services",
                False,
                {"error": "No ServiceEntry configurations found"}
            )
    
    def test_observability(self):
        """Test observability features."""
        print("\n📊 Testing Observability...")
        
        # Check if pods have Envoy stats endpoint accessible
        test_results = {}
        
        for namespace in self.test_namespaces:
            success, output = self.run_kubectl_cmd(f"get pods -n {namespace} -l app=podinfo -o name")
            
            if success and output:
                pod_name = output.split('\n')[0].replace('pod/', '')
                
                # Check if we can access Envoy admin interface
                stats_success, stats_output = self.run_kubectl_cmd(
                    f"exec {pod_name} -n {namespace} -c istio-proxy -- curl -s localhost:15000/stats/prometheus"
                )
                
                metrics_available = stats_success and 'istio_' in stats_output
                
                test_results[namespace] = {
                    "pod_name": pod_name,
                    "metrics_available": metrics_available,
                    "stats_accessible": stats_success
                }
        
        overall_success = any(result["metrics_available"] for result in test_results.values())
        
        self.store_test_result(
            "observability_metrics",
            overall_success,
            test_results
        )
        
        # Store performance metrics sample
        if overall_success:
            self.performance_metrics.append({
                "type": "envoy_metrics",
                "timestamp": datetime.now().isoformat(),
                "namespaces_with_metrics": [ns for ns, result in test_results.items() if result["metrics_available"]]
            })
    
    def test_performance_baseline(self):
        """Test basic performance characteristics."""
        print("\n🚀 Testing Performance Baseline...")
        
        http_endpoint, _ = self.setup_port_forward()
        
        # Simple performance test
        latencies = []
        errors = 0
        total_requests = 20
        
        for i in range(total_requests):
            try:
                start_time = time.time()
                response = requests.get(
                    f"http://{http_endpoint}/",
                    headers={"Host": self.test_domains["demo"]},
                    timeout=10
                )
                latency = (time.time() - start_time) * 1000  # Convert to ms
                
                if response.status_code == 200:
                    latencies.append(latency)
                else:
                    errors += 1
                    
            except Exception:
                errors += 1
        
        if latencies:
            avg_latency = sum(latencies) / len(latencies)
            max_latency = max(latencies)
            min_latency = min(latencies)
            
            # Performance criteria: average < 1000ms, max < 2000ms
            performance_good = avg_latency < 1000 and max_latency < 2000
            
            self.store_test_result(
                "performance_baseline",
                performance_good,
                {
                    "total_requests": total_requests,
                    "successful_requests": len(latencies),
                    "errors": errors,
                    "avg_latency_ms": round(avg_latency, 2),
                    "max_latency_ms": round(max_latency, 2),
                    "min_latency_ms": round(min_latency, 2)
                }
            )
            
            # Store performance metrics
            self.performance_metrics.append({
                "type": "baseline_performance",
                "timestamp": datetime.now().isoformat(),
                "avg_latency_ms": avg_latency,
                "max_latency_ms": max_latency,
                "error_rate": errors / total_requests * 100
            })
        else:
            self.store_test_result(
                "performance_baseline",
                False,
                {"error": "No successful requests for performance measurement"}
            )
    
    def generate_report(self):
        """Generate comprehensive test report."""
        end_time = datetime.now()
        duration = (end_time - self.start_time).total_seconds()
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for t in self.test_results if t["passed"])
        pass_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        # Security assessment
        critical_findings = [f for f in self.security_findings if f["severity"] == "CRITICAL"]
        high_findings = [f for f in self.security_findings if f["severity"] == "HIGH"]
        
        report = {
            "metadata": {
                "test_agent": "istio-test-agent",
                "cluster": "uk8s-tsshared-weu-gt025-int-prod-admin",
                "istio_version": "1.25.3-4 (AKS add-on)",
                "timestamp": end_time.isoformat(),
                "duration_seconds": round(duration, 2)
            },
            
            "executive_summary": {
                "overall_status": "PASS" if pass_rate >= 80 and len(critical_findings) == 0 else "FAIL",
                "test_pass_rate": f"{pass_rate:.1f}%",
                "total_tests": total_tests,
                "passed_tests": passed_tests,
                "failed_tests": total_tests - passed_tests,
                "critical_security_issues": len(critical_findings),
                "high_security_issues": len(high_findings)
            },
            
            "test_results": {
                "detailed_results": self.test_results,
                "categories": self.categorize_results()
            },
            
            "security_assessment": {
                "risk_level": self.calculate_risk_level(),
                "findings": self.security_findings,
                "recommendations": self.generate_security_recommendations()
            },
            
            "performance_analysis": {
                "baseline_metrics": self.performance_metrics,
                "sla_compliance": self.assess_sla_compliance()
            },
            
            "configuration_validation": {
                "tested_namespaces": self.test_namespaces,
                "ingress_configuration": {
                    "gateway_namespace": self.ingress_namespace,
                    "system_namespace": self.system_namespace,
                    "domains": self.test_domains
                }
            },
            
            "recommendations": self.generate_recommendations()
        }
        
        return report
    
    def categorize_results(self):
        """Categorize test results by type."""
        categories = {
            "control_plane": [],
            "traffic_management": [],
            "security": [],
            "observability": [],
            "performance": [],
            "external_services": []
        }
        
        for test in self.test_results:
            test_name = test["test"]
            
            if "control_plane" in test_name or "sidecar" in test_name:
                categories["control_plane"].append(test)
            elif "gateway" in test_name or "canary" in test_name or "destination_rule" in test_name:
                categories["traffic_management"].append(test)
            elif "isolation" in test_name or "mtls" in test_name:
                categories["security"].append(test)
            elif "observability" in test_name or "metrics" in test_name:
                categories["observability"].append(test)
            elif "performance" in test_name:
                categories["performance"].append(test)
            elif "external" in test_name:
                categories["external_services"].append(test)
        
        return categories
    
    def calculate_risk_level(self):
        """Calculate overall security risk level."""
        risk_score = 0
        
        severity_weights = {
            "CRITICAL": 40,
            "HIGH": 20,
            "MEDIUM": 10,
            "LOW": 5
        }
        
        for finding in self.security_findings:
            severity = finding.get("severity", "LOW")
            risk_score += severity_weights.get(severity, 0)
        
        if risk_score >= 100:
            return "CRITICAL"
        elif risk_score >= 60:
            return "HIGH"
        elif risk_score >= 30:
            return "MEDIUM"
        else:
            return "LOW"
    
    def generate_security_recommendations(self):
        """Generate security recommendations."""
        recommendations = []
        
        # Check for missing authorization policies
        if any(f["type"] == "missing_authorization_policy" for f in self.security_findings):
            recommendations.append({
                "priority": "HIGH",
                "recommendation": "Implement AuthorizationPolicy resources in all namespaces",
                "impact": "Ensures proper namespace isolation and zero-trust architecture"
            })
        
        # Check for mTLS configuration
        if any(f["type"] == "mtls_not_strict" for f in self.security_findings):
            recommendations.append({
                "priority": "MEDIUM", 
                "recommendation": "Configure STRICT mTLS mode across the mesh",
                "impact": "Ensures encrypted communication between all services"
            })
        
        return recommendations
    
    def assess_sla_compliance(self):
        """Assess SLA compliance from performance metrics."""
        if not self.performance_metrics:
            return {"status": "NOT_TESTED"}
        
        baseline_metrics = [m for m in self.performance_metrics if m["type"] == "baseline_performance"]
        
        if baseline_metrics:
            latest = baseline_metrics[-1]
            avg_latency = latest.get("avg_latency_ms", 0)
            error_rate = latest.get("error_rate", 0)
            
            sla_criteria = {
                "latency_threshold_ms": 1000,
                "error_rate_threshold_percent": 5
            }
            
            latency_compliant = avg_latency <= sla_criteria["latency_threshold_ms"]
            error_rate_compliant = error_rate <= sla_criteria["error_rate_threshold_percent"]
            
            return {
                "status": "COMPLIANT" if latency_compliant and error_rate_compliant else "NON_COMPLIANT",
                "latency_compliant": latency_compliant,
                "error_rate_compliant": error_rate_compliant,
                "actual_avg_latency_ms": avg_latency,
                "actual_error_rate_percent": error_rate,
                "criteria": sla_criteria
            }
        
        return {"status": "NO_DATA"}
    
    def generate_recommendations(self):
        """Generate overall recommendations."""
        recommendations = []
        
        # Based on test results
        failed_tests = [t["test"] for t in self.test_results if not t["passed"]]
        
        if failed_tests:
            recommendations.append({
                "category": "Test Failures",
                "priority": "HIGH",
                "recommendation": f"Address {len(failed_tests)} failed tests: {', '.join(failed_tests[:3])}{'...' if len(failed_tests) > 3 else ''}",
                "impact": "Critical functionality may not work as expected"
            })
        
        # Security recommendations
        if self.security_findings:
            recommendations.extend(self.generate_security_recommendations())
        
        # Performance recommendations
        if self.performance_metrics:
            baseline = [m for m in self.performance_metrics if m["type"] == "baseline_performance"]
            if baseline and baseline[-1].get("avg_latency_ms", 0) > 500:
                recommendations.append({
                    "category": "Performance",
                    "priority": "MEDIUM",
                    "recommendation": "Optimize application response times",
                    "impact": "Improve user experience and reduce resource consumption"
                })
        
        return recommendations
    
    def run_all_tests(self):
        """Execute the complete test suite."""
        print("="*80)
        print("🧪 ISTIO COMPREHENSIVE TEST SUITE")
        print(f"Cluster: uk8s-tsshared-weu-gt025-int-prod-admin")
        print(f"Istio Version: 1.25.3-4 (AKS add-on)")
        print(f"Started: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*80)
        
        # Execute all test categories
        self.test_control_plane_health()
        self.test_sidecar_injection()
        self.test_gateway_routing()
        self.test_canary_routing()
        self.test_destination_rules()
        self.test_namespace_isolation()
        self.test_mtls_configuration()
        self.test_external_services()
        self.test_observability()
        self.test_performance_baseline()
        
        # Generate and return comprehensive report
        report = self.generate_report()
        
        return report

def main():
    """Main execution function."""
    test_suite = IstioTestSuite()
    report = test_suite.run_all_tests()
    
    # Print summary
    print("\n" + "="*80)
    print("📊 TEST EXECUTION SUMMARY")
    print("="*80)
    
    summary = report["executive_summary"]
    print(f"""
Overall Status: {summary['overall_status']}
Test Pass Rate: {summary['test_pass_rate']}
Total Tests: {summary['total_tests']}
Passed Tests: {summary['passed_tests']}
Failed Tests: {summary['failed_tests']}

Security Assessment:
  Risk Level: {report['security_assessment']['risk_level']}
  Critical Issues: {summary['critical_security_issues']}
  High Issues: {summary['high_security_issues']}

Performance:
  SLA Compliance: {report['performance_analysis']['sla_compliance'].get('status', 'UNKNOWN')}
  
Duration: {report['metadata']['duration_seconds']} seconds
""")
    
    # Show failed tests
    failed_tests = [t for t in report["test_results"]["detailed_results"] if not t["passed"]]
    if failed_tests:
        print("\nFailed Tests:")
        for test in failed_tests:
            print(f"  ❌ {test['test']}: {test['details']}")
    
    # Show security findings
    if report["security_assessment"]["findings"]:
        print("\nSecurity Findings:")
        for finding in report["security_assessment"]["findings"]:
            print(f"  🔒 {finding['severity']}: {finding['description']}")
    
    # Show recommendations
    if report["recommendations"]:
        print("\nRecommendations:")
        for rec in report["recommendations"]:
            print(f"  📋 {rec['priority']}: {rec['recommendation']}")
    
    print("\n" + "="*80)
    
    # Return report as JSON for further processing
    return report

if __name__ == "__main__":
    import sys
    try:
        report = main()
        
        # Save report to file
        with open('/tmp/istio_test_report.json', 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"📄 Full report saved to: /tmp/istio_test_report.json")
        
        # Exit with appropriate code
        if report["executive_summary"]["overall_status"] == "PASS":
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Test suite execution failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(2)