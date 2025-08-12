import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Environment variable configuration
  envPrefix: "VITE_",

  // Build configuration
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          router: ["react-router-dom"],
          http: ["axios", "@tanstack/react-query"],
        },
      },
    },
  },

  // Development server configuration
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy API calls to backend in development
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Preview server configuration (for built app)
  preview: {
    port: 4173,
    host: true,
  },
});
