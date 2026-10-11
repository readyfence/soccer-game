import { defineConfig } from 'vite';

// Safari often refuses IPv6-only `localhost`. Listen on all interfaces so
// http://127.0.0.1:5173 and http://localhost:5173 both work.
export default defineConfig({
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
