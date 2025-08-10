import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ServiceCatalog from './pages/ServiceCatalog';
import ProvisionNamespace from './pages/ProvisionNamespace';
import NamespaceList from './pages/NamespaceList';
import Analytics from './pages/Analytics';

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
  return (
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
  );
}

export default App;
