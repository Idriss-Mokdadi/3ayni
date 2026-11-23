import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const webRoot = resolve(import.meta.dirname, 'web');

export default defineConfig({
  root: webRoot,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        patient: resolve(webRoot, 'index.html'),
        caregiver: resolve(webRoot, 'caregiver.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  test: {
    root: import.meta.dirname,
    include: ['test/**/*.test.js'],
  },
});
