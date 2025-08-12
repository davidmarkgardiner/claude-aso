// Simple demo runner to showcase the Platform API capabilities
console.log("🎭 Platform API Demo Starting...\n");

// Import mock data
const mockTemplates = [
  {
    id: "microservice-api",
    name: "Microservice API",
    description:
      "A production-ready REST API microservice with database integration, monitoring, and security features",
    category: "microservice",
    version: "2.1.0",
    tags: ["nodejs", "api", "postgresql", "redis", "monitoring"],
    author: "Platform Team",
    parameters: [
      {
        name: "serviceName",
        type: "string",
        required: true,
        description: "Name of the microservice",
      },
      {
        name: "databaseType",
        type: "select",
        required: true,
        description: "Type of database to use",
        options: ["postgresql", "mysql", "mongodb"],
      },
      {
        name: "replicas",
        type: "number",
        required: false,
        description: "Number of replicas to deploy",
        defaultValue: 2,
      },
    ],
    examples: [
      {
        name: "Basic Payment API",
        description: "Simple payment processing API with PostgreSQL",
      },
      {
        name: "High-Performance User API",
        description: "User management API with MongoDB and high availability",
      },
    ],
  },
  {
    id: "static-website",
    name: "Static Website",
    description:
      "Static website hosting with CDN, SSL, and automated deployments",
    category: "frontend",
    version: "1.3.0",
    tags: ["react", "nextjs", "static", "cdn", "ssl"],
    parameters: [
      {
        name: "siteName",
        type: "string",
        required: true,
        description: "Name of the static site",
      },
      {
        name: "domain",
        type: "string",
        required: true,
        description: "Domain name for the website",
      },
    ],
  },
];

const mockNamespaces = [
  {
    name: "frontend-app-dev",
    team: "frontend",
    environment: "development",
    resourceTier: "small",
    status: "active",
    createdAt: "2023-01-01T12:00:00Z",
    features: ["istio-injection", "monitoring-basic"],
    owner: { name: "Developer User", email: "dev@company.com" },
    resources: { pods: 12, services: 4, deployments: 6 },
    quota: {
      cpu: { used: "1200m", limit: "2000m", percentage: 60 },
      memory: { used: "2.5Gi", limit: "4Gi", percentage: 62.5 },
      storage: { used: "15Gi", limit: "20Gi", percentage: 75 },
    },
  },
  {
    name: "backend-api-prod",
    team: "backend",
    environment: "production",
    resourceTier: "large",
    status: "active",
    createdAt: "2023-01-10T09:15:00Z",
    features: ["istio-injection", "monitoring-enhanced", "security-scanning"],
    owner: { name: "Backend Lead", email: "backend-lead@company.com" },
    resources: { pods: 45, services: 15, deployments: 20 },
    quota: {
      cpu: { used: "6500m", limit: "8000m", percentage: 81.25 },
      memory: { used: "12Gi", limit: "16Gi", percentage: 75 },
      storage: { used: "85Gi", limit: "100Gi", percentage: 85 },
    },
  },
];

// Demo sections
console.log("📋 1. Service Catalog Discovery\n");
console.log(`✨ Found ${mockTemplates.length} available templates:\n`);

mockTemplates.forEach((template, index) => {
  console.log(`   ${index + 1}. ${template.name} (v${template.version})`);
  console.log(`      📝 ${template.description}`);
  console.log(`      🏷️  Category: ${template.category}`);
  console.log(`      🔧 Tags: ${template.tags.join(", ")}`);
  console.log(
    `      📦 Parameters: ${template.parameters.length} configurable options`,
  );
  console.log("");
});

console.log("🏠 2. Active Namespaces Overview\n");
console.log(`📊 Active Namespaces (${mockNamespaces.length} total):\n`);

mockNamespaces.forEach((ns, index) => {
  console.log(`   ${index + 1}. ✅ ${ns.name}`);
  console.log(`      Team: ${ns.team} | Environment: ${ns.environment}`);
  console.log(`      Resource Tier: ${ns.resourceTier}`);
  console.log(`      Owner: ${ns.owner.name} (${ns.owner.email})`);
  console.log(
    `      Workloads: ${ns.resources.pods} pods, ${ns.resources.services} services`,
  );
  console.log(`      Resource Usage:`);
  console.log(
    `         CPU: ${ns.quota.cpu.used}/${ns.quota.cpu.limit} (${ns.quota.cpu.percentage}%)`,
  );
  console.log(
    `         Memory: ${ns.quota.memory.used}/${ns.quota.memory.limit} (${ns.quota.memory.percentage}%)`,
  );
  console.log(
    `         Storage: ${ns.quota.storage.used}/${ns.quota.storage.limit} (${ns.quota.storage.percentage}%)`,
  );
  console.log(`      Features: ${ns.features.join(", ")}`);
  console.log("");
});

console.log("📊 3. Platform Analytics\n");

const totalTeams = [...new Set(mockNamespaces.map((ns) => ns.team))].length;
const avgCpuUsage = Math.round(
  mockNamespaces.reduce((sum, ns) => sum + ns.quota.cpu.percentage, 0) /
    mockNamespaces.length,
);
const avgMemoryUsage = Math.round(
  mockNamespaces.reduce((sum, ns) => sum + ns.quota.memory.percentage, 0) /
    mockNamespaces.length,
);

console.log(`📈 Platform Statistics:`);
console.log(`   Total Namespaces: ${mockNamespaces.length}`);
console.log(`   Teams: ${totalTeams}`);
console.log(
  `   Resource Utilization: ${avgCpuUsage}% CPU, ${avgMemoryUsage}% Memory`,
);
console.log("");

// Feature adoption
const allFeatures = mockNamespaces.flatMap((ns) => ns.features);
const featureCounts = allFeatures.reduce((acc, feature) => {
  acc[feature] = (acc[feature] || 0) + 1;
  return acc;
}, {});

console.log(`✨ Feature Adoption:`);
Object.entries(featureCounts).forEach(([feature, count]) => {
  console.log(`   ${feature}: ${count} namespaces`);
});
console.log("");

console.log("🎉 Platform API Demo Complete!\n");
console.log("📋 Demo Summary:");
console.log("   ✅ Service catalog with production-ready templates");
console.log("   ✅ Multi-team namespace management");
console.log("   ✅ Resource monitoring and quota management");
console.log("   ✅ Feature adoption tracking");
console.log("   ✅ Real-time platform analytics");
console.log("\n🚀 Platform ready for production use!\n");
