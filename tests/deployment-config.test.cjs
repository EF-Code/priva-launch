const assert = require('assert');

async function runDeploymentConfigTests() {
  const { parseTestnetManifest, getDeploymentStatus } = await import('../src/deployment-config.js');
  const manifest = { version: 'testnet-1', network: 'testnet', launchpadAddress: 'EQtest', verifierAddress: 'EQverify', gatewayUrl: 'https://gateway.example.test', indexerUrl: 'https://indexer.example.test', tonConnectManifestUrl: 'https://app.example.test/tonconnect-manifest.json', codeHashes: { launchpad: 'a'.repeat(64) }, circuit: { version: 1, verificationKeyHash: 'b'.repeat(64) }, dex: { kind: 'dedust-v2', sourceRevision: 'c'.repeat(40), nativeVaultAddress: 'EQnative', jettonVaultAddress: 'EQjetton', poolAddress: 'EQpool', codeHashes: { nativeVault: 'd'.repeat(64) } } };
  const parsed = parseTestnetManifest(manifest);
  assert.equal(parsed.mode, 'testnet');
  assert.equal(getDeploymentStatus(parsed).enabled, true);
  assert.throws(() => parseTestnetManifest({ ...manifest, network: 'mainnet' }), /testnet/);
  assert.throws(() => parseTestnetManifest({ ...manifest, gatewayUrl: 'http://gateway.example.test' }), /HTTPS/);
  assert.throws(() => parseTestnetManifest({ ...manifest, codeHashes: {} }), /codeHashes/);
  console.log('✅ Testnet manifest validation tests passed');
}

module.exports = { runDeploymentConfigTests };
