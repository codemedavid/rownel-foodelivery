import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      input: {
        // The React app.
        main: resolve(__dirname, 'index.html'),
        // The map the Expo app loads in a WebView. It is a separate entry so a
        // phone downloads MapKit and the pins only — not the whole storefront
        // bundle — and so it is served from this origin, which is the only way
        // a domain-pinned MapKit JS token can authorise it.
        mapEmbed: resolve(__dirname, 'map-embed.html'),
      },
    },
  },
});
