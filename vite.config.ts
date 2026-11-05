import { defineConfig } from 'vite';

// Relative base so the build works under any GitHub Pages project path.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: { environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
