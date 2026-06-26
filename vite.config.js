/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/three(\/|$)/.test(id)) return 'three';
          if (/\/src\/lib\/macos(\/|$)/.test(id)) return 'macOS';
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
