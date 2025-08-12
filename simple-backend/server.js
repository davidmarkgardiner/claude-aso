const express = require("express");
const cors = require("cors");
const k8s = require("@kubernetes/client-node");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Kubernetes client setup
const kc = new k8s.KubeConfig();

// Try to load from specific kubeconfig file first, then fallback to default
try {
  kc.loadFromFile(
    "/Users/davidgardiner/Desktop/repo/cluade-setup/claude-aso/aks-kubeconfig",
  );
  console.log("✅ Loaded kubeconfig from aks-kubeconfig");
} catch (error) {
  console.log("⚠️  Failed to load aks-kubeconfig, trying default...");
  try {
    kc.loadFromDefault();
    console.log("✅ Loaded default kubeconfig");
  } catch (defaultError) {
    console.error("❌ Failed to load any kubeconfig:", defaultError.message);
  }
}

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sRbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);

// In-memory storage for provisioning requests (in real app, use database)
const provisioningRequests = new Map();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get templates (mock data for now)
app.get("/api/platform/catalog/templates", (req, res) => {
  const templates = [
    {
      id: "microservice-api",
      name: "Microservice API",
      version: "2.1.0",
      description:
        "Production-ready REST API microservice with database integration, monitoring, and security features",
      category: "microservice",
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
      ],
      examples: [
        {
          name: "Payment API",
          description: "Payment processing service with PostgreSQL",
        },
      ],
    },
    {
      id: "static-website",
      name: "Static Website",
      version: "1.3.0",
      description:
        "Static website hosting with CDN, SSL, and automated deployments",
      category: "frontend",
      tags: ["react", "nextjs", "static", "cdn", "ssl"],
      author: "Frontend Team",
      parameters: [
        {
          name: "siteName",
          type: "string",
          required: true,
          description: "Name of the static site",
        },
        {
          name: "framework",
          type: "select",
          required: true,
          description: "Frontend framework",
          options: ["react", "nextjs", "vue", "angular"],
        },
      ],
      examples: [
        { name: "Marketing Site", description: "Corporate marketing website" },
      ],
    },
  ];

  res.json(templates);
});

// Request namespace provisioning
app.post("/api/platform/namespaces/request", async (req, res) => {
  try {
    const {
      namespaceName,
      team,
      environment,
      resourceTier,
      networkPolicy,
      features,
      description,
      costCenter,
    } = req.body;

    // Basic validation
    if (!namespaceName || !team) {
      return res.status(400).json({
        error: "Namespace name and team are required",
      });
    }

    // Generate request ID
    const requestId = `req-${Date.now()}`;

    console.log(
      `[${new Date().toISOString()}] Provisioning request: ${requestId} for namespace: ${namespaceName}`,
    );

    // Store request
    const request = {
      requestId,
      namespaceName,
      team,
      environment,
      resourceTier,
      networkPolicy,
      features: features || [],
      description: description || "",
      costCenter: costCenter || "",
      status: "provisioning",
      createdAt: new Date().toISOString(),
      workflowStatus: {
        phase: "Running",
        message: "Creating namespace and setting up resources...",
      },
    };

    provisioningRequests.set(requestId, request);

    // Start provisioning process
    setTimeout(async () => {
      try {
        await provisionNamespace(requestId, request);
      } catch (error) {
        console.error(`Provisioning failed for ${requestId}:`, error);
        const failedRequest = provisioningRequests.get(requestId);
        if (failedRequest) {
          failedRequest.status = "failed";
          failedRequest.errorMessage = error.message;
          failedRequest.completedAt = new Date().toISOString();
          provisioningRequests.set(requestId, failedRequest);
        }
      }
    }, 1000);

    res.json(request);
  } catch (error) {
    console.error("Request processing error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Get provisioning request status
app.get("/api/platform/namespaces/request/:id/status", (req, res) => {
  const requestId = req.params.id;
  const request = provisioningRequests.get(requestId);

  if (!request) {
    return res.status(404).json({
      error: "Request not found",
    });
  }

  res.json(request);
});

// List namespaces for a team
app.get("/api/platform/namespaces/team/:team", async (req, res) => {
  try {
    const team = req.params.team;

    // Get all namespaces with team label
    const response = await k8sApi.listNamespace(
      undefined, // pretty
      undefined, // allowWatchBookmarks
      undefined, // continue
      undefined, // fieldSelector
      `team=${team}`, // labelSelector
    );

    const namespaces = response.body.items.map((ns) => ({
      name: ns.metadata.name,
      team: ns.metadata.labels?.team || "unknown",
      environment: ns.metadata.labels?.environment || "unknown",
      resourceTier: ns.metadata.labels?.["resource-tier"] || "unknown",
      createdAt: ns.metadata.creationTimestamp,
      status: ns.status.phase,
    }));

    res.json(namespaces);
  } catch (error) {
    console.error("Error listing namespaces:", error);
    res.status(500).json({
      error: "Failed to list namespaces",
    });
  }
});

// Function to actually provision namespace in Kubernetes
async function provisionNamespace(requestId, request) {
  const {
    namespaceName,
    team,
    environment,
    resourceTier,
    networkPolicy,
    features,
  } = request;

  console.log(
    `[${new Date().toISOString()}] Starting provisioning for: ${namespaceName}`,
  );

  // Update status
  const currentRequest = provisioningRequests.get(requestId);
  currentRequest.workflowStatus.message = "Creating namespace...";
  provisioningRequests.set(requestId, currentRequest);

  // Create namespace
  const namespaceManifest = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespaceName,
      labels: {
        team: team,
        environment: environment,
        "resource-tier": resourceTier,
        "network-policy": networkPolicy,
        "managed-by": "platform-api",
        "created-by": "namespace-provisioning",
      },
      annotations: {
        "platform.company.com/description": request.description,
        "platform.company.com/cost-center": request.costCenter,
        "platform.company.com/features": features.join(","),
        "platform.company.com/request-id": requestId,
      },
    },
  };

  try {
    await k8sApi.createNamespace(namespaceManifest);
    console.log(`✅ Namespace ${namespaceName} created`);
  } catch (error) {
    if (error.response?.statusCode === 409) {
      console.log(`⚠️  Namespace ${namespaceName} already exists`);
    } else {
      throw error;
    }
  }

  // Create resource quota based on tier
  currentRequest.workflowStatus.message = "Setting up resource quotas...";
  provisioningRequests.set(requestId, currentRequest);

  const resourceLimits = getResourceLimits(resourceTier);
  const quotaManifest = {
    apiVersion: "v1",
    kind: "ResourceQuota",
    metadata: {
      name: "compute-resources",
      namespace: namespaceName,
    },
    spec: {
      hard: resourceLimits,
    },
  };

  try {
    await k8sApi.createNamespacedResourceQuota(namespaceName, quotaManifest);
    console.log(`✅ Resource quota created for ${namespaceName}`);
  } catch (error) {
    if (error.response?.statusCode !== 409) {
      console.error(`❌ Failed to create resource quota: ${error.message}`);
    }
  }

  // Create RBAC for team
  currentRequest.workflowStatus.message = "Setting up RBAC...";
  provisioningRequests.set(requestId, currentRequest);

  const roleManifest = {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "Role",
    metadata: {
      name: `${team}-role`,
      namespace: namespaceName,
    },
    rules: [
      {
        apiGroups: ["*"],
        resources: ["*"],
        verbs: ["*"],
      },
    ],
  };

  const roleBindingManifest = {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "RoleBinding",
    metadata: {
      name: `${team}-binding`,
      namespace: namespaceName,
    },
    subjects: [
      {
        kind: "Group",
        name: `team-${team}`,
        apiGroup: "rbac.authorization.k8s.io",
      },
    ],
    roleRef: {
      kind: "Role",
      name: `${team}-role`,
      apiGroup: "rbac.authorization.k8s.io",
    },
  };

  try {
    await k8sRbacApi.createNamespacedRole(namespaceName, roleManifest);
    await k8sRbacApi.createNamespacedRoleBinding(
      namespaceName,
      roleBindingManifest,
    );
    console.log(`✅ RBAC created for team ${team} in ${namespaceName}`);
  } catch (error) {
    if (error.response?.statusCode !== 409) {
      console.error(`❌ Failed to create RBAC: ${error.message}`);
    }
  }

  // Apply features
  if (features.includes("istio-injection")) {
    currentRequest.workflowStatus.message = "Enabling Istio injection...";
    provisioningRequests.set(requestId, currentRequest);

    try {
      // Add Istio injection label
      await k8sApi.patchNamespace(
        namespaceName,
        {
          metadata: {
            labels: {
              "istio-injection": "enabled",
            },
          },
        },
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { "Content-Type": "application/merge-patch+json" },
        },
      );
      console.log(`✅ Istio injection enabled for ${namespaceName}`);
    } catch (error) {
      console.error(`❌ Failed to enable Istio injection: ${error.message}`);
    }
  }

  // Mark as completed
  currentRequest.status = "completed";
  currentRequest.completedAt = new Date().toISOString();
  currentRequest.workflowStatus = {
    phase: "Succeeded",
    message: "Namespace provisioning completed successfully",
  };
  provisioningRequests.set(requestId, currentRequest);

  console.log(`✅ Provisioning completed for ${namespaceName} (${requestId})`);
}

// Helper function to get resource limits based on tier
function getResourceLimits(tier) {
  const limits = {
    micro: {
      "requests.cpu": "500m",
      "requests.memory": "1Gi",
      "limits.cpu": "1000m",
      "limits.memory": "2Gi",
      persistentvolumeclaims: "5",
      "requests.storage": "10Gi",
    },
    small: {
      "requests.cpu": "1000m",
      "requests.memory": "2Gi",
      "limits.cpu": "2000m",
      "limits.memory": "4Gi",
      persistentvolumeclaims: "10",
      "requests.storage": "20Gi",
    },
    medium: {
      "requests.cpu": "2000m",
      "requests.memory": "4Gi",
      "limits.cpu": "4000m",
      "limits.memory": "8Gi",
      persistentvolumeclaims: "15",
      "requests.storage": "50Gi",
    },
    large: {
      "requests.cpu": "4000m",
      "requests.memory": "8Gi",
      "limits.cpu": "8000m",
      "limits.memory": "16Gi",
      persistentvolumeclaims: "20",
      "requests.storage": "100Gi",
    },
  };

  return limits[tier] || limits.small;
}

app.listen(PORT, () => {
  console.log(`🚀 Simple K8s Backend running on http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /api/platform/catalog/templates`);
  console.log(`   POST /api/platform/namespaces/request`);
  console.log(`   GET  /api/platform/namespaces/request/:id/status`);
  console.log(`   GET  /api/platform/namespaces/team/:team`);
});
