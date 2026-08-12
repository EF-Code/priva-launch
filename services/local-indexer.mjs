#!/usr/bin/env node

/**
 * Read-through indexer boundary.
 *
 * Local mode is loopback-only. Render mode is an explicit public testnet
 * proxy profile and requires an HTTPS upstream; neither mode contains launch
 * fixtures. Without an upstream it returns 503, which keeps the UI read-only
 * instead of inventing chain state. The upstream is expected to be a
 * separately operated indexer that derives records from confirmed TON
 * testnet transactions.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Address } from '@ton/core';

const MAX_BODY_BYTES = 16 * 1024;

function parseAddress(value) {
  try {
    const address = Address.parse(value);
    if (address.workChain !== 0) throw new Error('workchain must be 0');
    return address;
  } catch {
    throw new Error('PRIVA_LAUNCHPAD_ADDRESS must be a basechain TON address.');
  }
}

function loadConfig() {
  const mode = process.env.PRIVA_INDEXER_MODE?.trim();
  if (!['local', 'render'].includes(mode)) throw new Error('Set PRIVA_INDEXER_MODE=local or render.');
  const publicMode = mode === 'render';
  const host = process.env.PRIVA_INDEXER_HOST?.trim() || (publicMode ? '0.0.0.0' : '127.0.0.1');
  if (publicMode && host !== '0.0.0.0') throw new Error('Render indexer must bind to 0.0.0.0.');
  if (!publicMode && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('The local indexer only binds to loopback addresses.');
  const port = Number(process.env.PRIVA_INDEXER_PORT || process.env.PORT || (publicMode ? 10000 : 8788));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PRIVA_INDEXER_PORT must be a valid TCP port.');
  const corsOrigin = process.env.PRIVA_CORS_ORIGIN?.trim() || 'http://localhost:5173';
  const upstream = process.env.PRIVA_INDEXER_UPSTREAM?.trim() || null;
  if (publicMode && !upstream) throw new Error('Render indexer requires PRIVA_INDEXER_UPSTREAM over HTTPS.');
  if (upstream) {
    const url = new URL(upstream);
    const local = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname);
    if (!['https:', ...(local ? ['http:'] : [])].includes(url.protocol)) throw new Error('PRIVA_INDEXER_UPSTREAM must use HTTPS unless it targets loopback.');
    if (url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
  }
  const launchpad = process.env.PRIVA_LAUNCHPAD_ADDRESS?.trim();
  if (publicMode && !launchpad) throw new Error('Render indexer requires PRIVA_LAUNCHPAD_ADDRESS.');
  const launchpadRaw = launchpad ? parseAddress(launchpad).toRawString() : null;
  if (publicMode) {
    let origin;
    try { origin = new URL(corsOrigin); } catch { throw new Error('PRIVA_CORS_ORIGIN must be an absolute HTTPS origin.'); }
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Render indexer CORS origin must be an HTTPS origin without a path.');
  }
  return Object.freeze({ mode, host, port, corsOrigin, upstream, launchpadRaw });
}

function jsonResponse(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function setCors(request, response, origin) {
  const requestOrigin = request.headers.origin;
  if (requestOrigin && requestOrigin !== origin) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Vary', 'Origin');
  return true;
}

function safeNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function validDecimal(value, { nonZero = false } = {}) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && (!nonZero || value !== '0');
}

function validateLaunches(body, config) {
  if (!body || !Array.isArray(body.launches) || body.launches.length > 100) throw new Error('upstream returned an invalid launch list.');
  if (!config.launchpadRaw) throw new Error('PRIVA_LAUNCHPAD_ADDRESS is required before serving launch data.');
  return body.launches.map((launch) => {
    if (!launch || typeof launch !== 'object') throw new Error('upstream returned an invalid launch record.');
    let launchAddress;
    try { launchAddress = Address.parse(launch.launchpadAddress); } catch { throw new Error('upstream returned an invalid launch address.'); }
    if (launchAddress.workChain !== 0 || launchAddress.toRawString() !== config.launchpadRaw) throw new Error('upstream launch does not match the configured launchpad.');
    if (typeof launch.id !== 'string' || launch.id.trim() === '' || launch.id.length > 128) throw new Error('upstream returned an invalid launch ID.');
    if (typeof launch.name !== 'string' || launch.name.trim() === '' || typeof launch.symbol !== 'string' || launch.symbol.trim() === '') throw new Error('upstream returned invalid launch labels.');
    if (!['active', 'closing'].includes(launch.state) || safeNumber(launch.raisedTon) === null || !Number.isSafeInteger(launch.participants) || launch.participants < 0 || typeof launch.ends !== 'string' || launch.ends.trim() === '') throw new Error('upstream returned invalid launch status.');
    for (const [name, nonZero] of [['priceNanoTonPerSaleUnit', true], ['remainingSaleUnits', false], ['refundGasReserveNanoTon', true], ['mintMessageValueNanoTon', true]]) {
      if (!validDecimal(launch[name], { nonZero })) throw new Error(`upstream returned invalid ${name}.`);
    }
    return launch;
  });
}

async function upstreamJson(config, pathname) {
  if (!config.upstream) throw Object.assign(new Error('local indexer upstream is not configured'), { statusCode: 503 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${config.upstream}${pathname}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw Object.assign(new Error(`indexer upstream returned ${response.status}`), { statusCode: 502 });
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function createLocalIndexerServer(config) {
  return http.createServer(async (request, response) => {
    if (!setCors(request, response, config.corsOrigin)) {
      jsonResponse(response, 403, { error: 'origin not allowed' });
      return;
    }
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/healthz') {
      jsonResponse(response, 200, { service: 'priva-indexer', mode: config.mode, upstreamConfigured: Boolean(config.upstream) });
      return;
    }
    if (request.method !== 'GET') {
      jsonResponse(response, 405, { error: 'method not allowed' });
      return;
    }
    try {
      if (request.url === '/v1/launches') {
        const body = await upstreamJson(config, '/v1/launches');
        jsonResponse(response, 200, { launches: validateLaunches(body, config) });
        return;
      }
      const match = request.url?.match(/^\/v1\/purchases\/([0-9]+)$/);
      if (match) {
        const body = await upstreamJson(config, `/v1/purchases/${match[1]}`);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('upstream returned an invalid purchase record.');
        jsonResponse(response, 200, body);
        return;
      }
      jsonResponse(response, 404, { error: 'not found' });
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
      jsonResponse(response, status, { error: error instanceof Error ? error.message : 'indexer request failed' });
    }
  });
}

export function startLocalIndexer() {
  const config = loadConfig();
  const server = createLocalIndexerServer(config);
  server.listen(config.port, config.host, () => {
    console.log(`Priva ${config.mode} indexer listening on http://${config.host}:${config.port}`);
    console.log(`Upstream configured: ${config.upstream ? 'yes' : 'no (read-only 503 until configured)'}`);
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    startLocalIndexer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
