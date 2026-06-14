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
        agents: resolve(__dirname, 'agents.html'),
        'agents/jerryquant': resolve(__dirname, 'agents/jerryquant.html'),
        monerge: resolve(__dirname, 'monerge.html'),
        moncade: resolve(__dirname, 'moncade.html'),
        moncadeGame: resolve(__dirname, 'moncade-game.html'),
        sappy: resolve(__dirname, 'sappy.html'),
        'sappy/sealfolio': resolve(__dirname, 'sappy/sealfolio.html'),
        'sappy/studio': resolve(__dirname, 'sappy/studio.html'),
        'sappy/ecosystem': resolve(__dirname, 'sappy/ecosystem.html'),
        'sappy/community': resolve(__dirname, 'sappy/community.html'),
        'sappy/memes': resolve(__dirname, 'sappy/memes.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('@dynamic-labs')) return 'dynamic';
        }
      }
    }
  }
});
