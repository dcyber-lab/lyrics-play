import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative base + hash routing: works at a domain root or under /repo/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [svelte()],
});
