import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import ServiceCatalog from "./pages/ServiceCatalog";
import ProvisionNamespace from "./pages/ProvisionNamespace";
import NamespaceList from "./pages/NamespaceList";
import Analytics from "./pages/Analytics";
import {
  loadRuntimeConfig,
  validateConfig,
  getConfig,
} from "./config/environment";
import LoadingSpinner from "./components/LoadingSpinner";
import ErrorBoundary from "./components/ErrorBoundary";

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load runtime configuration
        await loadRuntimeConfig();

        // Validate configuration
        const config = getConfig();
        const errors = validateConfig(config);

        if (errors.length > 0) {
          console.error("Configuration validation errors:", errors);
          setConfigError(`Configuration errors: ${errors.join(", ")}`);
          return;
        }

        console.log("App initialized with configuration:", {
          environment: config.environment,
          authEnabled: config.authEnabled,
          apiUrl: config.apiUrl.replace(/\/[^/]*$/, "/***"), // Mask sensitive parts
        });

        setConfigLoaded(true);
      } catch (error) {
        console.error("Failed to initialize app:", error);
        setConfigError("Failed to load application configuration");
      }
    };

    initializeApp();
  }, []);

  if (configError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Configuration Error
            </h1>
            <p className="text-gray-600 mb-4">{configError}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!configLoaded) {
    return <LoadingSpinner />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/catalog" element={<ServiceCatalog />} />
              <Route path="/provision" element={<ProvisionNamespace />} />
              <Route path="/namespaces" element={<NamespaceList />} />
              <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </Layout>
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
