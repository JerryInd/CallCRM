import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '');
    },
  };
}

const apiTarget = process.env.VITE_API_TARGET;
const proxy = apiTarget
  ? {
      '/api': apiTarget,
      '/ws': { target: apiTarget, ws: true },
    }
  : undefined;

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  server: proxy ? { proxy, host: true } : { host: true },
  preview: proxy ? { proxy, host: true } : { host: true },
  build: {
    outDir: 'dist',
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory') || id.includes('internmap') || id.includes('delaunator') || id.includes('robust-predicates')) return 'vendor-charts';
          if (id.includes('lodash')) return 'vendor-lodash';
          return 'vendor';
        },
      },
    },
  },
});
