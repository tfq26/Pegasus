import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tauri-apps': fileURLToPath(new URL('../../node_modules/@tauri-apps', import.meta.url)),
    },
  },
  build: {
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // Enable minification
    minify: 'esbuild',
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - cached separately from app code
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'chart-vendor': ['chart.js', 'vue-chartjs'],
          'ui-vendor': ['radix-vue', 'reka-ui'],
        },
        // Add content hash to filenames for cache busting
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 600,
  },
  // Development server configuration
  server: {
    host: 'localhost',
    proxy: [
      // ── Python (AI, auth, billing, admin, data CRUD, cloud, experimental, operations, support) ──
      {
        context: [
          '/ai',
          '/auth', '/billing',
          '/api/admin', '/api/cloud-auth', '/api/cloud-provision',
          '/api/experimental', '/api/config', '/api/payment',
          '/api/users', '/api/kusto-ingest',
          '/operations', '/settings', '/feedback',
          '/create-checkout-session', '/create-portal-session',
          '/create-token-checkout-session', '/create-storage-checkout-session',
          '/subscription-status', '/sync-subscription', '/sync-payments',
          '/payments', '/usage', '/support',
          '/socket.io',
          '/upload',
          '/chats',
          '/dashboards',
          '/dashboard',
          '/queries',
          '/query-sessions',
          '/shared',
        ],
        target: 'http://localhost:8090',
        changeOrigin: true,
        ws: true,
      },
      // ── Rust (data-plane computation API) ──
      {
        context: ['/api', '/query', '/schema',
                   '/spaces', '/connections',
                   '/files', '/v1'],
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    ],
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', 'chart.js'],
  },
})
