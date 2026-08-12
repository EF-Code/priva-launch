#!/usr/bin/env node
/*
 * Loopback-only HTTPS relay for Acton's local TON Connect page.
 *
 * Acton 1.0.0 serves HTTP and hard-codes the Acton documentation manifest.
 * Brave/Tonkeeper correctly rejects that origin mismatch. This relay serves
 * the same page over a locally trusted HTTPS certificate, advertises the
 * matching loopback origin, and forwards only Acton's TON Connect API routes.
 * It is a development diagnostic, not a public proxy or deployment service.
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const actonPage = option('--acton-page');
const actonPort = Number(option('--acton-port', '52258'));
const port = Number(option('--port', '52259'));
const certDir = option('--cert-dir', process.env.PRIVA_TONCONNECT_CERT_DIR ||
  path.join(os.homedir(), '.local', 'state', 'priva', 'tonconnect-dev'));
if (!actonPage || !/^\/[A-Za-z0-9_-]+$/.test(actonPage)) {
  throw new Error('Usage: node scripts/tonconnect-https-relay.mjs --acton-page /ACTON_PAGE_TOKEN [--acton-port 52258] [--port 52259]');
}
if (!Number.isInteger(actonPort) || actonPort < 1024 || actonPort > 65535) throw new Error('--acton-port must be 1024..65535');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be 1024..65535');

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  throw new Error(`Missing ${keyPath} or ${certPath}; run npm run tonconnect:cert -- --install-nss first.`);
}

const actonHost = '127.0.0.1';
const origin = `https://127.0.0.1:${port}`;
const manifest = JSON.stringify({
  url: origin,
  name: 'Priva local TON Connect test',
  iconUrl: 'https://ef-code.github.io/priva-launch/icon.png',
});

function writeError(res, status, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(message);
}

function forward(req, res, requestPath) {
  const headers = { ...req.headers, host: `${actonHost}:${actonPort}` };
  delete headers.connection;
  delete headers['content-length'];
  const upstream = http.request({ host: actonHost, port: actonPort, method: req.method, path: requestPath, headers }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', (error) => writeError(res, 502, `Acton relay error: ${error.message}`));
  req.pipe(upstream);
}

async function page(res) {
  try {
    const response = await fetch(`http://${actonHost}:${actonPort}${actonPage}`);
    if (!response.ok) {
      writeError(res, response.status, `Acton page returned HTTP ${response.status}`);
      return;
    }
    const html = await response.text();
    const rewritten = html
      .replace('https://ton-blockchain.github.io/acton/tonconnect-manifest.json', `${origin}/tonconnect-manifest.json`)
      .replaceAll('https://ton-blockchain.github.io/acton/logo.png', 'https://ef-code.github.io/priva-launch/icon.png')
      .replaceAll('Acton TON Connect', 'Priva local TON Connect');
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self' https: wss:",
    });
    res.end(rewritten);
  } catch (error) {
    writeError(res, 502, `Acton page relay error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (req, res) => {
  const requestUrl = new URL(req.url ?? '/', origin);
  if (requestUrl.pathname === '/tonconnect-manifest.json' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(manifest);
    return;
  }
  if (requestUrl.pathname === actonPage && req.method === 'GET') {
    void page(res);
    return;
  }
  if (requestUrl.pathname.startsWith('/api/')) {
    forward(req, res, `${requestUrl.pathname}${requestUrl.search}`);
    return;
  }
  writeError(res, 404, 'Local TON Connect relay route not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`HTTPS TON Connect relay: ${origin}${actonPage}`);
  console.log(`Manifest: ${origin}/tonconnect-manifest.json`);
  console.log('Scope: 127.0.0.1 only; no transaction logic is added.');
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
