const assert = require('assert/strict');
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
    assert.deepEqual(await health.json(), { service: 'priva-indexer', mode: 'local', upstreamConfigured: false });

    const launches = await fetch('http://127.0.0.1:18788/v1/launches');
    assert.equal(launches.status, 503);
    assert.match((await launches.json()).error, /upstream/);
  } finally {
    await stop(service.child);
  }
}

Promise.all([runGatewayTest(), runIndexerTest()])
  .then(() => console.log('✅ Local gateway/indexer boundary tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
