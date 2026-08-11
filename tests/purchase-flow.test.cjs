const assert = require('assert');

async function runPurchaseFlowTests() {
  const { beginCell } = await import('@ton/core');
  const { calculatePurchaseValue, prepareTestnetPurchase } = await import('../src/purchase-flow.js');
  const address = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
  const deployment = { mode: 'testnet', launchpadAddress: address, gatewayUrl: 'https://gateway.example.test' };
  const launch = {
    id: 'launch-1',
    launchpadAddress: address,
    priceNanoTonPerSaleUnit: '85000000',
    remainingSaleUnits: '1000',
    refundGasReserveNanoTon: '5000000',
    mintMessageValueNanoTon: '50000000',
  };
  const quote = calculatePurchaseValue({ launch, saleUnits: '10' });
  assert.equal(quote.maxValue, 850000000n);
  assert.equal(quote.value, 855000000n);
  assert.throws(() => calculatePurchaseValue({ launch, saleUnits: '1001' }), /remaining supply/);
  const empty = beginCell().endCell();
  const proof = beginCell().storeRef(empty).storeRef(empty).storeRef(empty).endCell().toBoc({ idx: false }).toString('base64');
  const publicInputs = beginCell().storeUint(1, 8).endCell().toBoc({ idx: false }).toString('base64');
  const nowEpoch = Math.floor(Date.now() / 1000);
  const gatewayClient = {
    requestTestnetPurchaseAuthorization: async (request, manifest) => {
      assert.equal(request.launchpadAddress, manifest.launchpadAddress);
      assert.equal(request.operation, 'BUY');
      return { proof, publicInputs, launchId: request.launchId, recipientAddress: request.recipientAddress, circuitVersion: 1, expiryEpoch: nowEpoch + 240 };
    },
  };
  const prepared = await prepareTestnetPurchase({
    deployment,
    launch,
    saleUnits: '10',
    recipientAddress: address,
    initData: 'auth_date=1&hash=signed',
    clientNonce: 'a'.repeat(64),
    gatewayClient,
    nowEpoch,
  });
  assert.equal(prepared.request.launchId, 'launch-1');
  assert.equal(prepared.saleUnits, 10n);
  assert.equal(prepared.maxValue, 850000000n);
  assert.equal(prepared.transaction.messages.length, 1);
  await assert.rejects(prepareTestnetPurchase({ ...prepared, deployment, launch: { ...launch, launchpadAddress: 'EQ111111111111111111111111111111111111111111111111' } }), /does not match/);
  console.log('✅ Testnet purchase authorization and explicit transaction preparation tests passed');
}

module.exports = { runPurchaseFlowTests };
