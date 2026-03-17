/// <reference types="vitest/config" />
// ABOUTME: Vite build configuration for the Svelte app.
// ABOUTME: Configures Svelte plugin, Tailwind CSS, Vitest test environment, and WASM loading.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm(), tailwindcss(), svelte(), svelteTesting()],
  test: {
    include: ['tests/app/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/app/setup.ts'],
  },
});
