import { defineConfig } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readManifest } = require('./scripts/check-testnet-manifest.cjs');

function loadInjectedManifest() {
  const candidate = process.env.PRIVA_TESTNET_MANIFEST_PATH?.trim();
  if (!candidate) return null;
  return readManifest(candidate).manifest;
}

const injectedManifest = loadInjectedManifest();

export default defineConfig({
  // GitHub Pages serves this project below /priva-launch/. Local Vite keeps
  // the root path so the development server remains copy/paste friendly.
  base: process.env.PRIVA_PAGES_BUILD === '1' ? '/priva-launch/' : '/',
  define: {
    // No path means null and keeps the shipped app read-only. A supplied path
    // is validated before Vite can enable wallet actions in the build.
    'globalThis.__PRIVA_TESTNET_MANIFEST__': JSON.stringify(injectedManifest),
  },
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
