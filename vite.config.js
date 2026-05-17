import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/dynamic-api': {
        target: 'https://app.dynamicauth.com/api/v0',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/dynamic-api/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
