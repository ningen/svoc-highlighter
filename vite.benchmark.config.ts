import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: true,
    outDir: 'benchmark/.vite',
    rollupOptions: {
      input: resolve(import.meta.dirname, 'benchmark/harness.html'),
    },
  },
});
