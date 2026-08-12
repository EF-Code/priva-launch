const assert = require('assert');
const { validateTestnetManifest } = require('../scripts/check-testnet-manifest.cjs');

async function runDeploymentConfigTests() {
  const { parseTestnetManifest, getDeploymentStatus } = await import('../src/deployment-config.js');
  const address = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
  const manifest = { version: 'testnet-1', network: 'testnet', status: 'reviewed', sourceRevision: '0123456789abcdef0123456789abcdef01234567', launchpadAddress: address, verifierAddress: address, jettonMinterAddress: address, gatewayUrl: 'https://gateway.example.test', indexerUrl: 'https://indexer.example.test', tonConnectManifestUrl: 'https://app.example.test/tonconnect-manifest.json', metadataUrl: 'https://app.example.test/testnet/v1/metadata.json', codeHashes: { launchpad: 'a'.repeat(64) }, circuit: { version: 1, verificationKeyHash: 'b'.repeat(64) }, dex: { kind: 'dedust-v2', sourceRevision: 'c'.repeat(40), nativeVaultAddress: address, jettonVaultAddress: address, poolAddress: address, codeHashes: { nativeVault: 'd'.repeat(64) } } };
  const parsed = parseTestnetManifest(manifest);
  assert.equal(parsed.mode, 'testnet');
  assert.equal(getDeploymentStatus(parsed).enabled, true);
  assert.throws(() => parseTestnetManifest({ ...manifest, network: 'mainnet' }), /testnet/);
  assert.throws(() => parseTestnetManifest({ ...manifest, status: 'draft' }), /reviewed/);
  assert.throws(() => parseTestnetManifest({ ...manifest, launchpadAddress: 'EQtest' }), /friendly TON address/);
  assert.throws(() => parseTestnetManifest({ ...manifest, gatewayUrl: 'http://gateway.example.test' }), /HTTPS/);
  assert.throws(() => parseTestnetManifest({ ...manifest, codeHashes: {} }), /codeHashes/);
  assert.deepEqual(validateTestnetManifest(manifest), manifest);
  assert.throws(() => validateTestnetManifest({ ...manifest, dex: undefined }), /DEX/);
  console.log('✅ Testnet manifest validation tests passed');
}

module.exports = { runDeploymentConfigTests };
