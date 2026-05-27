import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

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
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        monerge: resolve(__dirname, 'monerge.html'),
        moncade: resolve(__dirname, 'moncade.html'),
        moncadeGame: resolve(__dirname, 'moncade-game.html')
      }
    }
  }
});
