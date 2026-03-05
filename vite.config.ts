/// <reference types="vitest/config" />
// ABOUTME: Vite build configuration for the Svelte app.
// ABOUTME: Configures Svelte plugin, Tailwind CSS, and Vitest test environment.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  test: {
    include: ['tests/app/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/app/setup.ts'],
  },
});
