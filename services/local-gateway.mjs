#!/usr/bin/env node

/**
 * Loopback-only Priva proof gateway.
 *
 * This service is deliberately not a deployment endpoint. It requires an
 * explicit local mode, binds only to 127.0.0.1, and refuses to start without
 * real operator-supplied Telegram/issuer policy. The issuer secret and bot
 * token are read from the process environment and are never returned by an
 * endpoint or written to logs.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Address } from '@ton/core';
import { proofToMessageCell } from '../vendor/zk-tele-auth/node_modules/export-ton-verifier/dist/index.js';
import { ZkTeleAuthGateway } from '../vendor/zk-tele-auth/dist/gateway/server.js';
import { assertFieldElement } from '../vendor/zk-tele-auth/dist/sdk/poseidon.js';
import { toBasechainAddressLimbs } from '../vendor/zk-tele-auth/dist/sdk/ton-address-binding.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultArtifactsDir = path.join(root, 'vendor', 'zk-tele-auth', 'artifacts');
const GROTH16_TOLK_MESSAGE_OP = 993839639;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_UINT32 = 0xffff_ffff;

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required.`);
  return value.trim();
}

function decimal(name, value, { nonZero = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || (nonZero && value === '0')) {
    throw new Error(`${name} must be a canonical${nonZero ? ' non-zero' : ''} decimal.`);
  }
  return value;
}

function positiveSafeInteger(name, value, fallback) {
  const candidate = value == null || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > MAX_UINT32) {
    throw new Error(`${name} must be an integer in 1..2^32-1.`);
  }
  return candidate;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  if (value === '1' || value.toLowerCase() === 'true') return true;
  if (value === '0' || value.toLowerCase() === 'false') return false;
  throw new Error('PRIVA_REQUIRE_PREMIUM must be true/false or 1/0.');
}

function parseBasechainAddress(name, value) {
  try {
    const address = Address.parse(value);
    if (address.workChain !== 0) throw new Error(`${name} must use workchain 0.`);
    return address;
  } catch (error) {
    throw new Error(`${name} must be a canonical basechain TON address: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadConfig() {
  if (process.env.PRIVA_GATEWAY_MODE !== 'local') {
    throw new Error('Set PRIVA_GATEWAY_MODE=local; this service refuses non-local mode.');
  }

  const launchpad = parseBasechainAddress('PRIVA_LAUNCHPAD_ADDRESS', required('PRIVA_LAUNCHPAD_ADDRESS'));
  const launchpadAddress = launchpad.toRawString();
  const launchId = required('PRIVA_LAUNCH_ID');
  if (launchId.length > 128) throw new Error('PRIVA_LAUNCH_ID must be at most 128 characters.');

  const issuerSecret = decimal('PRIVA_ISSUER_SECRET', required('PRIVA_ISSUER_SECRET'), { nonZero: true });
  assertFieldElement(BigInt(issuerSecret), 'PRIVA_ISSUER_SECRET');

  const appDomain = required('PRIVA_APP_DOMAIN').toLowerCase().trim();
  const launchIdHash = decimal('PRIVA_LAUNCH_ID_HASH', required('PRIVA_LAUNCH_ID_HASH'), { nonZero: true });
  assertFieldElement(BigInt(launchIdHash), 'PRIVA_LAUNCH_ID_HASH');

  const corsOrigin = process.env.PRIVA_CORS_ORIGIN?.trim() || 'http://localhost:5173';
  let parsedOrigin;
  try {
    parsedOrigin = new URL(corsOrigin);
  } catch {
    throw new Error('PRIVA_CORS_ORIGIN must be an absolute HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
    throw new Error('PRIVA_CORS_ORIGIN must be an origin without a path, query, or fragment.');
  }

  const host = process.env.PRIVA_GATEWAY_HOST?.trim() || '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('The local gateway only binds to loopback addresses.');
  }

  const port = Number(process.env.PRIVA_GATEWAY_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PRIVA_GATEWAY_PORT must be a valid TCP port.');

  return Object.freeze({
    botToken: required('TELEGRAM_BOT_TOKEN'),
    issuerSecret,
    appDomain,
    launchId,
    launchIdHash,
    launchpadAddress,
    launchpadLimbs: toBasechainAddressLimbs(launchpad),
    maxTokenAgeSec: positiveSafeInteger('PRIVA_MAX_TOKEN_AGE_SEC', process.env.PRIVA_MAX_TOKEN_AGE_SEC, 3600),
    maxAuthorizationTtlSec: positiveSafeInteger('PRIVA_MAX_AUTHORIZATION_TTL_SEC', process.env.PRIVA_MAX_AUTHORIZATION_TTL_SEC, 300),
    requirePremium: parseBoolean(process.env.PRIVA_REQUIRE_PREMIUM, false),
    corsOrigin,
    host,
    port,
    artifactsDir: process.env.ZK_TELE_AUTH_ARTIFACTS_DIR?.trim() || defaultArtifactsDir,
  });
}

function readBody(request, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    let rejected = false;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (rejected) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > limit) {
        rejected = true;
        const error = new Error('request body too large');
        error.statusCode = 413;
        reject(error);
        request.resume();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (!rejected) resolve(body);
    });
    request.on('error', reject);
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
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Vary', 'Origin');
  return true;
}

function requireString(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required.`);
  return value.trim();
}

function nonceToField(nonce) {
  if (!/^[a-f0-9]{64}$/.test(nonce)) throw new Error('clientNonce must be 32-byte lowercase hexadecimal.');
  const value = BigInt(`0x${nonce}`);
  assertFieldElement(value, 'clientNonce');
  return value.toString();
}

function authorizationExpiry(body, now, maxTtl) {
  const raw = body.expiryEpoch == null ? now + maxTtl : Number(body.expiryEpoch);
  if (!Number.isSafeInteger(raw) || raw <= now || raw - now > maxTtl) {
    throw new Error('expiryEpoch must be in the configured local authorization window.');
  }
  return raw;
}

function splitProofMessage(message) {
  const payload = message.beginParse();
  if (payload.loadUint(32) !== GROTH16_TOLK_MESSAGE_OP) throw new Error('Unexpected Groth16 message opcode.');
  const proof = payload.loadRef();
  const publicInputs = payload.loadRef();
  payload.endParse();
  if (proof.bits.length !== 0 || proof.refs.length !== 3) throw new Error('Generated proof cell has an invalid shape.');
  if (publicInputs.bits.length === 0 && publicInputs.refs.length === 0) throw new Error('Generated public-input cell is empty.');
  return { proof, publicInputs };
}

async function authorize(body, config, gateway) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('request body must be a JSON object.');
  const initData = requireString('initData', body.initData);
  if (body.operation !== 'BUY') throw new Error('only BUY authorizations are supported.');
  if (body.circuitVersion !== 1 && body.circuitVersion !== 'priva_purchase_auth/v1') throw new Error('unsupported purchase circuit version.');
  if (requireString('launchId', body.launchId) !== config.launchId) throw new Error('launchId does not match local gateway policy.');

  const launchpad = parseBasechainAddress('launchpadAddress', requireString('launchpadAddress', body.launchpadAddress));
  if (launchpad.toRawString() !== config.launchpadAddress) throw new Error('launchpadAddress does not match local gateway policy.');
  const recipient = parseBasechainAddress('recipientAddress', requireString('recipientAddress', body.recipientAddress));
  const nonce = nonceToField(requireString('clientNonce', body.clientNonce));
  const now = Math.floor(Date.now() / 1000);
  const expiryEpoch = authorizationExpiry(body, now, config.maxAuthorizationTtlSec);
  const recipientLimbs = toBasechainAddressLimbs(recipient);

  const result = await gateway.handlePrivaPurchaseAuthorization(initData, {
    launchIdHash: config.launchIdHash,
    launchpadAddressHi: config.launchpadLimbs.addressHi,
    launchpadAddressLo: config.launchpadLimbs.addressLo,
    recipientAddressHi: recipientLimbs.addressHi,
    recipientAddressLo: recipientLimbs.addressLo,
    clientNonce: nonce,
    expiryEpoch,
    operation: 'BUY',
    circuitVersion: 1,
  });

  const message = await proofToMessageCell({
    proof: result.proofPayload.proof,
    publicSignals: result.proofPayload.publicSignals,
    protocol: 'groth16',
    lang: 'tolk',
  });
  const { proof, publicInputs } = splitProofMessage(message);
  return Object.freeze({
    proof: proof.toBoc({ idx: false }).toString('base64'),
    publicInputs: publicInputs.toBoc({ idx: false }).toString('base64'),
    launchId: config.launchId,
    recipientAddress: body.recipientAddress,
    circuitVersion: 1,
    expiryEpoch,
  });
}

export function createLocalGatewayServer(config, gateway) {
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
      jsonResponse(response, 200, { service: 'priva-gateway', mode: 'local', configured: true, circuitVersion: 1 });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/purchase-authorizations') {
      jsonResponse(response, 404, { error: 'not found' });
      return;
    }
    try {
      const raw = await readBody(request);
      const body = JSON.parse(raw || '{}');
      jsonResponse(response, 200, await authorize(body, config, gateway));
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : error?.message?.startsWith('prover busy') ? 429 : 400;
      if (status >= 500) console.error('[local-gateway] request failed');
      jsonResponse(response, status, { error: error instanceof Error ? error.message : 'request failed' });
    }
  });
}

export function startLocalGateway() {
  const config = loadConfig();
  const gateway = new ZkTeleAuthGateway({
    botToken: config.botToken,
    issuerSecret: config.issuerSecret,
    appDomain: config.appDomain,
    maxTokenAgeSec: config.maxTokenAgeSec,
    requirePremium: config.requirePremium,
    corsOrigin: config.corsOrigin,
    maxBodyBytes: MAX_BODY_BYTES,
    maxConcurrentProofs: 2,
    artifactOpts: { artifactsDir: config.artifactsDir },
  });
  const server = createLocalGatewayServer(config, gateway);
  server.listen(config.port, config.host, () => {
    console.log(`Priva local gateway listening on http://${config.host}:${config.port}`);
    console.log(`CORS origin restricted to ${config.corsOrigin}`);
    console.log(`Circuit artifacts loaded from ${config.artifactsDir}`);
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    startLocalGateway();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
