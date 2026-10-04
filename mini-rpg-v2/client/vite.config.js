import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so the build works when served from any folder
  build: { outDir: 'dist', emptyOutDir: true },
});
