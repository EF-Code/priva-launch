#!/usr/bin/env node

/**
 * Verify externally operated HTTPS dependencies named by a real reviewed
 * testnet manifest. This performs read-only GETs and never sends a wallet or
 * contract transaction.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readManifest } = require('./check-testnet-manifest.cjs');
const candidate = process.argv[2] || 'deployment/testnet/reviewed-manifest.json';
const { manifest } = readManifest(candidate);

const privateHost = /^(?:localhost|127(?:\.[0-9]+){3}|::1|0\.0\.0\.0|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.)$/i;
const timeoutMs = 8000;

function endpoint(base, suffix) {
  return `${base.replace(/\/$/, '')}${suffix}`;
}

function requirePublicHttps(name, value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  if (privateHost.test(url.hostname)) throw new Error(`${name} must not target a loopback or private host.`);
  return url;
}

async function get(url, name, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'application/json, image/png, image/x-icon', ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}.`);
    return response;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${name} timed out after ${timeoutMs}ms.`);
    throw new Error(`${name} is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

const appManifestUrl = requirePublicHttps('tonConnectManifestUrl', manifest.tonConnectManifestUrl);
const metadataUrl = requirePublicHttps('metadataUrl', manifest.metadataUrl);
requirePublicHttps('gatewayUrl', manifest.gatewayUrl);
requirePublicHttps('indexerUrl', manifest.indexerUrl);

const appOrigin = appManifestUrl.origin;
const expectedAppUrl = new URL('.', appManifestUrl).toString().replace(/\/$/, '');
const tonConnectResponse = await get(manifest.tonConnectManifestUrl, 'TonConnect manifest', { Origin: appOrigin });
const tonConnect = await tonConnectResponse.json();
if (!tonConnect || typeof tonConnect !== 'object' || typeof tonConnect.url !== 'string' || tonConnect.url.replace(/\/$/, '') !== expectedAppUrl) throw new Error('TonConnect manifest url must equal the public app URL.');
if (typeof tonConnect.iconUrl !== 'string' || !tonConnect.iconUrl.startsWith('https://')) throw new Error('TonConnect manifest iconUrl must be HTTPS.');
const iconResponse = await get(tonConnect.iconUrl, 'TonConnect icon');
if (!/^image\/(png|x-icon|vnd\.microsoft\.icon)$/i.test(iconResponse.headers.get('content-type') || '')) throw new Error('TonConnect icon must be PNG or ICO.');

const metadataResponse = await get(manifest.metadataUrl, 'Jetton metadata');
const metadata = await metadataResponse.json();
if (!metadata || typeof metadata !== 'object' || typeof metadata.name !== 'string' || typeof metadata.symbol !== 'string' || metadata.decimals === undefined) {
  throw new Error('Jetton metadata is missing name, symbol, or decimals.');
}

for (const [name, base] of [['gatewayUrl', manifest.gatewayUrl], ['indexerUrl', manifest.indexerUrl]]) {
  const response = await get(endpoint(base, '/healthz'), `${name} health`, { Origin: appOrigin });
  const body = await response.json();
  if (!body || typeof body !== 'object') throw new Error(`${name} health response is not JSON.`);
}

console.log(`✓ Public testnet endpoints passed (${manifest.sourceRevision})`);
console.log(`  appOrigin=${appOrigin}`);
console.log(`  metadata=${metadataUrl.origin}${metadataUrl.pathname}`);
