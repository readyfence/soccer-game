import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Safari often refuses IPv6-only `localhost`. Listen on all interfaces so
// http://127.0.0.1:5173 and http://localhost:5173 both work.
//
// Two pages: the game's website at / and the game itself at /play/.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, 'index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    hmr: {
      protocol: 'ws',
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});
