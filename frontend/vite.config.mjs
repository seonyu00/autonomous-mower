import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setupTests.ts'],
  },
});
