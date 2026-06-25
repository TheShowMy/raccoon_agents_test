/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
