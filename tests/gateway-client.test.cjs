const assert = require('assert');

async function runGatewayClientTests() {
  const { PrivaGatewayClient } = await import('../src/gateway-client.js');
  const deployment = { mode: 'testnet', gatewayUrl: 'https://gateway.example.test' };
  const calls = [];
  const client = new PrivaGatewayClient({ endpoint: deployment.gatewayUrl, fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ proof: 'testnet-proof' }) }; } });
  const result = await client.requestTestnetPurchaseAuthorization({ launchId: 'launch-1', recipient: 'EQrecipient' }, deployment);
  assert.equal(result.proof, 'testnet-proof');
  assert.equal(calls[0].url, 'https://gateway.example.test/v1/purchase-authorizations');
  await assert.rejects(client.requestTestnetPurchaseAuthorization({ launchId: 'launch-1' }, deployment), /recipient/);
  await assert.rejects(client.requestTestnetPurchaseAuthorization({ launchId: 'launch-1', recipient: 'EQrecipient' }, { ...deployment, gatewayUrl: 'https://other.example.test' }), /does not match/);
  console.log('✅ Testnet gateway transport tests passed');
}

module.exports = { runGatewayClientTests };
