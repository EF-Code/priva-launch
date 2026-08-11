const assert = require('assert');

async function runGatewayClientTests() {
  const { PrivaGatewayClient } = await import('../src/gateway-client.js');
  const address = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
  const deployment = { mode: 'testnet', gatewayUrl: 'https://gateway.example.test', launchpadAddress: address };
  const calls = [];
  const request = {
    initData: 'auth_date=1&hash=test-hash',
    launchId: 'launch-1',
    launchpadAddress: address,
    recipientAddress: address,
    operation: 'BUY',
    clientNonce: 'nonce-1',
    circuitVersion: 1,
  };
  const client = new PrivaGatewayClient({ endpoint: deployment.gatewayUrl, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        proof: 'proof-boc-base64',
        publicInputs: 'inputs-boc-base64',
        launchId: 'launch-1',
        recipientAddress: address,
        circuitVersion: 1,
        expiryEpoch: Math.floor(Date.now() / 1000) + 300,
      }),
    };
  } });
  const result = await client.requestTestnetPurchaseAuthorization(request, deployment);
  assert.equal(result.proof, 'proof-boc-base64');
  assert.equal(result.publicInputs, 'inputs-boc-base64');
  assert.equal(calls[0].url, 'https://gateway.example.test/v1/purchase-authorizations');
  await assert.rejects(client.requestTestnetPurchaseAuthorization({ ...request, recipientAddress: undefined }, deployment), /recipientAddress/);
  await assert.rejects(client.requestTestnetPurchaseAuthorization(request, { ...deployment, gatewayUrl: 'https://other.example.test' }), /does not match/);
  console.log('✅ Testnet gateway transport tests passed');
}

module.exports = { runGatewayClientTests };
