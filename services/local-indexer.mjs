#!/usr/bin/env node

/**
 * Read-through indexer boundary.
 *
 * Local mode is loopback-only. Render mode is an explicit public testnet
 * profile. It can either proxy an HTTPS upstream or, when no upstream is
 * configured, derive the fixed-price testnet discovery record directly from
 * the deployed launchpad's getters and confirmed TON Center messages. Neither
 * mode accepts browser-provided launch state or contains fixture records.
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
  const chainApiValue = process.env.PRIVA_CHAIN_API?.trim() || (publicMode ? 'https://testnet.toncenter.com/api/v3' : null);
  const chainApi = chainApiValue ? chainApiValue.replace(/\/$/, '') : null;
  if (publicMode && !/^https:\/\//.test(chainApi)) throw new Error('Render indexer PRIVA_CHAIN_API must use HTTPS.');
  const direct = publicMode && !upstream;
  if (direct) {
    for (const name of ['PRIVA_LAUNCH_ID', 'PRIVA_LAUNCH_NAME', 'PRIVA_LAUNCH_SYMBOL', 'PRIVA_LAUNCH_ENDS', 'PRIVA_PRICE_NANOTON', 'PRIVA_TOTAL_SALE_UNITS', 'PRIVA_REFUND_GAS_RESERVE_NANOTON', 'PRIVA_MINT_MESSAGE_VALUE_NANOTON']) {
      if (!process.env[name]?.trim()) throw new Error(`Render direct indexer requires ${name}.`);
    }
    if (!validDecimal(process.env.PRIVA_PRICE_NANOTON, { nonZero: true })) throw new Error('PRIVA_PRICE_NANOTON must be a canonical non-zero decimal.');
    if (!validDecimal(process.env.PRIVA_TOTAL_SALE_UNITS)) throw new Error('PRIVA_TOTAL_SALE_UNITS must be a canonical decimal.');
    if (!validDecimal(process.env.PRIVA_REFUND_GAS_RESERVE_NANOTON, { nonZero: true })) throw new Error('PRIVA_REFUND_GAS_RESERVE_NANOTON must be a canonical non-zero decimal.');
    if (!validDecimal(process.env.PRIVA_MINT_MESSAGE_VALUE_NANOTON, { nonZero: true })) throw new Error('PRIVA_MINT_MESSAGE_VALUE_NANOTON must be a canonical non-zero decimal.');
  }
  return Object.freeze({
    mode, host, port, corsOrigin, upstream, launchpadAddress: launchpad || null, launchpadRaw, chainApi, direct,
    launchId: process.env.PRIVA_LAUNCH_ID?.trim() || null,
    launchName: process.env.PRIVA_LAUNCH_NAME?.trim() || null,
    launchSymbol: process.env.PRIVA_LAUNCH_SYMBOL?.trim() || null,
    launchEnds: process.env.PRIVA_LAUNCH_ENDS?.trim() || null,
    priceNanoTonPerSaleUnit: process.env.PRIVA_PRICE_NANOTON?.trim() || null,
    totalSaleUnits: process.env.PRIVA_TOTAL_SALE_UNITS?.trim() || null,
    refundGasReserveNanoTon: process.env.PRIVA_REFUND_GAS_RESERVE_NANOTON?.trim() || null,
    mintMessageValueNanoTon: process.env.PRIVA_MINT_MESSAGE_VALUE_NANOTON?.trim() || null,
  });
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

function asDecimal(value) {
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return BigInt(value).toString(10);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

async function readLaunchpadAccounting(config) {
  if (!config.chainApi) return null;
  const response = await fetch(`${config.chainApi}/runGetMethod`, {
    method: 'POST',
    headers: { ...chainApiHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: config.launchpadRaw, method: 'getPrivaTestnetAccounting', stack: [] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error(`chain API returned ${response.status}`), { statusCode: 502 });
  const body = await response.json();
  const stack = body?.stack || body?.result?.stack;
  if (!Array.isArray(stack) || stack.length !== 4) throw Object.assign(new Error('chain API returned an invalid launchpad accounting stack'), { statusCode: 502 });
  const values = stack.map((entry) => asDecimal(entry?.value ?? entry?.[1]));
  if (values.some((value) => value === null)) throw Object.assign(new Error('chain API returned a non-numeric launchpad accounting value'), { statusCode: 502 });
  return { soldSaleUnits: values[0], pendingSaleUnits: values[1], acceptedNanoTon: values[2], pendingAcceptedNanoTon: values[3] };
}

function chainApiHeaders(config) {
  const headers = { Accept: 'application/json' };
  if (process.env.PRIVA_CHAIN_API_KEY?.trim()) headers['X-API-Key'] = process.env.PRIVA_CHAIN_API_KEY.trim();
  return headers;
}

async function readBuyParticipants(config) {
  const query = new URLSearchParams({ destination: config.launchpadRaw, opcode: '0x50525642', direction: 'in', limit: '1000', sort: 'asc' });
  const response = await fetch(`${config.chainApi}/messages?${query}`, { headers: chainApiHeaders(config), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Object.assign(new Error(`chain API returned ${response.status}`), { statusCode: 502 });
  const body = await response.json();
  if (!Array.isArray(body?.messages)) throw Object.assign(new Error('chain API returned an invalid message list'), { statusCode: 502 });
  if (body.messages.length >= 1000) throw Object.assign(new Error('chain message limit reached; participant count is not bounded'), { statusCode: 502 });
  const sources = new Set();
  for (const message of body.messages) {
    const source = message?.source;
    if (typeof source !== 'string' || source.trim() === '') throw Object.assign(new Error('chain message is missing its source address'), { statusCode: 502 });
    try { sources.add(Address.parse(source).toRawString()); } catch { throw Object.assign(new Error('chain message has an invalid source address'), { statusCode: 502 }); }
  }
  return sources.size;
}

async function buildDirectLaunch(config) {
  const accounting = await readLaunchpadAccounting(config);
  const participants = await readBuyParticipants(config);
  const remaining = BigInt(config.totalSaleUnits) - BigInt(accounting.soldSaleUnits) - BigInt(accounting.pendingSaleUnits);
  if (remaining < 0n) throw Object.assign(new Error('chain accounting exceeds the configured sale allocation'), { statusCode: 502 });
  return {
    id: config.launchId,
    launchpadAddress: config.launchpadAddress,
    name: config.launchName,
    symbol: config.launchSymbol,
    emoji: '◈',
    state: 'active',
    ends: config.launchEnds,
    raisedTon: Number(accounting.acceptedNanoTon) / 1_000_000_000,
    participants,
    priceNanoTonPerSaleUnit: config.priceNanoTonPerSaleUnit,
    remainingSaleUnits: remaining.toString(),
    refundGasReserveNanoTon: config.refundGasReserveNanoTon,
    mintMessageValueNanoTon: config.mintMessageValueNanoTon,
  };
}

async function readQueryState(config, queryId) {
  const response = await fetch(`${config.chainApi}/runGetMethod`, {
    method: 'POST',
    headers: { ...chainApiHeaders(config), 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: config.launchpadRaw, method: 'getPrivaTestnetQueryState', stack: [{ type: 'num', value: queryId }] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error(`chain API returned ${response.status}`), { statusCode: 502 });
  const body = await response.json();
  const stack = body?.stack || body?.result?.stack;
  const value = stack?.[0]?.value ?? stack?.[0]?.[1];
  const state = asDecimal(value);
  if (state === null) throw Object.assign(new Error('chain API returned an invalid query state'), { statusCode: 502 });
  return state;
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
      jsonResponse(response, 200, { service: 'priva-indexer', mode: config.mode, upstreamConfigured: Boolean(config.upstream), chainConfigured: Boolean(config.chainApi) });
      return;
    }
    if (request.method !== 'GET') {
      jsonResponse(response, 405, { error: 'method not allowed' });
      return;
    }
    try {
      if (request.url === '/v1/launches') {
        if (config.direct) {
          jsonResponse(response, 200, { launches: [await buildDirectLaunch(config)] });
          return;
        }
        const body = await upstreamJson(config, '/v1/launches');
        const launches = validateLaunches(body, config);
        const accounting = await readLaunchpadAccounting(config);
        if (accounting && launches.length === 1) {
          const launch = { ...launches[0] };
          launch.raisedTon = Number(accounting.acceptedNanoTon) / 1_000_000_000;
          const remainingSaleUnits = BigInt(launch.remainingSaleUnits) - BigInt(accounting.soldSaleUnits) - BigInt(accounting.pendingSaleUnits);
          if (remainingSaleUnits < 0n) throw Object.assign(new Error('chain accounting exceeds the upstream sale allocation'), { statusCode: 502 });
          launch.remainingSaleUnits = remainingSaleUnits.toString();
          jsonResponse(response, 200, { launches: [launch] });
          return;
        }
        jsonResponse(response, 200, { launches });
        return;
      }
      const match = request.url?.match(/^\/v1\/purchases\/([0-9]+)$/);
      if (match) {
        if (config.direct) {
          jsonResponse(response, 200, { queryId: match[1], state: await readQueryState(config, match[1]) });
          return;
        }
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
    console.log(`Data source: ${config.direct ? 'direct TON chain' : config.upstream ? 'configured upstream' : 'none (read-only 503)'}`);
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
