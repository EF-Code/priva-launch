const assert = require('assert');

async function runIndexerClientTests() {
  const { PrivaIndexerClient } = await import('../src/indexer-client.js');
  const address = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
  const deployment = { mode: 'testnet', indexerUrl: 'https://indexer.example.test', launchpadAddress: address };
  const client = new PrivaIndexerClient({
    endpoint: deployment.indexerUrl,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ launches: [{ id: 'one', launchpadAddress: address, name: 'One', symbol: 'ONE', state: 'active', raisedTon: 2.5, participants: 4, ends: '1h', priceNanoTonPerSaleUnit: '85000000', remainingSaleUnits: '1000', refundGasReserveNanoTon: '5000000', mintMessageValueNanoTon: '50000000' }] }),
    }),
  });
  const launches = await client.listTestnetLaunches(deployment);
  assert.equal(launches[0].id, 'one');
  assert.equal(launches[0].raised, 2.5);
  await assert.rejects(new PrivaIndexerClient({ endpoint: deployment.indexerUrl, fetchImpl: async () => ({ ok: true, json: async () => ({ launches: [{ name: 'broken' }] }) }) }).listTestnetLaunches(deployment), /invalid launch record/);
  await assert.rejects(new PrivaIndexerClient({ endpoint: deployment.indexerUrl, fetchImpl: async () => ({ ok: true, json: async () => ({ launches: [{ id: 'wrong', launchpadAddress: 'EQ111111111111111111111111111111111111111111111111', name: 'Wrong', symbol: 'WRONG', state: 'active', raisedTon: 1, participants: 1, ends: '1h', priceNanoTonPerSaleUnit: '1', remainingSaleUnits: '1', refundGasReserveNanoTon: '1', mintMessageValueNanoTon: '1' }] }) }) }).listTestnetLaunches(deployment), /does not match/);
  await assert.rejects(client.listTestnetLaunches({ ...deployment, indexerUrl: 'https://other.example.test' }), /does not match/);
  console.log('✅ Testnet indexer client validation tests passed');
}

module.exports = { runIndexerClientTests };
