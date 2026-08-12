const assert = require('assert/strict');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const address = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

function launch(script, env) {
  const child = spawn(process.execPath, [path.join(root, script)], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function waitFor(url, child, getOutput) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`service exited before readiness: ${getOutput()}`);
    try {
      const response = await fetch(url);
      return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`service did not become ready: ${getOutput()}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function runGatewayTest() {
  const service = launch('services/local-gateway.mjs', {
    PRIVA_GATEWAY_MODE: 'local',
    TELEGRAM_BOT_TOKEN: 'unit-test-token',
    PRIVA_ISSUER_SECRET: '123',
    PRIVA_APP_DOMAIN: 'local.test',
    PRIVA_LAUNCH_ID: 'local-launch-v1',
    PRIVA_LAUNCH_ID_HASH: '1',
    PRIVA_LAUNCHPAD_ADDRESS: address,
    PRIVA_CORS_ORIGIN: 'http://localhost:5173',
    PRIVA_GATEWAY_PORT: '18787',
    ZK_TELE_AUTH_ARTIFACTS_DIR: path.join(root, 'vendor/zk-tele-auth/artifacts'),
  });
  try {
    const health = await waitFor('http://127.0.0.1:18787/healthz', service.child, service.getOutput);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { service: 'priva-gateway', mode: 'local', configured: true, circuitVersion: 1 });

    const malformed = await fetch('http://127.0.0.1:18787/v1/purchase-authorizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: '{}',
    });
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).error, /initData/);

    const foreign = await fetch('http://127.0.0.1:18787/healthz', { headers: { Origin: 'https://attacker.invalid' } });
    assert.equal(foreign.status, 403);
  } finally {
    await stop(service.child);
  }
}

async function runRenderGatewayModeTest() {
  const service = launch('services/local-gateway.mjs', {
    PRIVA_GATEWAY_MODE: 'render',
    PRIVA_GATEWAY_HOST: '0.0.0.0',
    PRIVA_GATEWAY_PORT: '18789',
    TELEGRAM_BOT_TOKEN: 'unit-test-token',
    PRIVA_ISSUER_SECRET: '123',
    PRIVA_APP_DOMAIN: 'ef-code.github.io',
    PRIVA_LAUNCH_ID: 'local-launch-v1',
    PRIVA_LAUNCH_ID_HASH: '1',
    PRIVA_LAUNCHPAD_ADDRESS: address,
    PRIVA_CORS_ORIGIN: 'https://ef-code.github.io',
    ZK_TELE_AUTH_ARTIFACTS_DIR: path.join(root, 'vendor/zk-tele-auth/artifacts'),
  });
  try {
    const health = await waitFor('http://127.0.0.1:18789/healthz', service.child, service.getOutput);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { service: 'priva-gateway', mode: 'render', configured: true, circuitVersion: 1 });
  } finally {
    await stop(service.child);
  }
}

async function runIndexerTest() {
  const service = launch('services/local-indexer.mjs', {
    PRIVA_INDEXER_MODE: 'local',
    PRIVA_INDEXER_PORT: '18788',
    PRIVA_CORS_ORIGIN: 'http://localhost:5173',
    PRIVA_LAUNCHPAD_ADDRESS: address,
  });
  try {
    const health = await waitFor('http://127.0.0.1:18788/healthz', service.child, service.getOutput);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { service: 'priva-indexer', mode: 'local', upstreamConfigured: false, chainConfigured: false });

    const launches = await fetch('http://127.0.0.1:18788/v1/launches');
    assert.equal(launches.status, 503);
    assert.match((await launches.json()).error, /upstream/);
  } finally {
    await stop(service.child);
  }
}

async function runRenderIndexerConfigTest() {
  const service = launch('services/local-indexer.mjs', {
    PRIVA_INDEXER_MODE: 'render',
    PRIVA_INDEXER_HOST: '0.0.0.0',
    PRIVA_CORS_ORIGIN: 'https://ef-code.github.io',
    PRIVA_LAUNCHPAD_ADDRESS: address,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`render indexer did not fail closed: ${service.getOutput()}`)), 8000);
    service.child.once('exit', (code) => {
      clearTimeout(timer);
      assert.equal(code, 1);
      assert.match(service.getOutput(), /requires PRIVA_LAUNCH_ID/);
      resolve();
    });
  });
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function runDirectIndexerTest() {
  const chain = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url?.startsWith('/messages?')) {
      response.end(JSON.stringify({ messages: [{ source: address }, { source: address }] }));
      return;
    }
    if (request.url === '/runGetMethod') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        const requestBody = JSON.parse(body);
        if (requestBody.method === 'getPrivaTestnetAccounting') {
          response.end(JSON.stringify({ stack: [{ value: '0x2' }, { value: '0x1' }, { value: '0x12a05f200' }, { value: '0x0' }] }));
          return;
        }
        if (requestBody.method === 'getPrivaTestnetQueryState') {
          response.end(JSON.stringify({ stack: [{ value: '0x2' }] }));
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ error: 'unknown getter' }));
      });
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await listen(chain, 18790);
  const { Address } = await import('@ton/core');
  const { createLocalIndexerServer } = await import('../services/local-indexer.mjs');
  const launchpadRaw = Address.parse(address).toRawString();
  const indexer = createLocalIndexerServer(Object.freeze({
    mode: 'render',
    host: '127.0.0.1',
    port: 18791,
    corsOrigin: 'https://ef-code.github.io',
    upstream: null,
    launchpadAddress: address,
    launchpadRaw,
    chainApi: 'http://127.0.0.1:18790',
    direct: true,
    launchId: 'direct-test-launch',
    launchName: 'Direct Test Launch',
    launchSymbol: 'DTL',
    launchEnds: 'test window',
    priceNanoTonPerSaleUnit: '85',
    totalSaleUnits: '1000000000',
    refundGasReserveNanoTon: '50000000',
    mintMessageValueNanoTon: '200000000',
  }));
  await listen(indexer, 18791);
  try {
    const launches = await fetch('http://127.0.0.1:18791/v1/launches');
    assert.equal(launches.status, 200);
    const body = await launches.json();
    assert.equal(body.launches.length, 1);
    assert.equal(body.launches[0].raisedTon, 5);
    assert.equal(body.launches[0].participants, 1);
    assert.equal(body.launches[0].remainingSaleUnits, '999999997');

    const purchase = await fetch('http://127.0.0.1:18791/v1/purchases/7');
    assert.deepEqual(await purchase.json(), { queryId: '7', state: '2' });
  } finally {
    await new Promise((resolve) => indexer.close(resolve));
    await new Promise((resolve) => chain.close(resolve));
  }
}

Promise.all([runGatewayTest(), runRenderGatewayModeTest(), runIndexerTest(), runRenderIndexerConfigTest(), runDirectIndexerTest()])
  .then(() => console.log('✅ Local gateway/indexer boundary tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
