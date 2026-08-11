import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this project below /priva-launch/. Local Vite keeps
  // the root path so the development server remains copy/paste friendly.
  base: process.env.PRIVA_PAGES_BUILD === '1' ? '/priva-launch/' : '/',
  server: {
    proxy: {
      '/local-gateway': {
        target: 'http://127.0.0.1:8787',
        rewrite: (url) => url.replace(/^\/local-gateway/, ''),
      },
      '/local-indexer': {
        target: 'http://127.0.0.1:8788',
        rewrite: (url) => url.replace(/^\/local-indexer/, ''),
      },
    },
  },
});
