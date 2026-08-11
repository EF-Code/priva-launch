const assert = require('assert');

async function runIndexerClientTests() {
  const { PrivaIndexerClient } = await import('../src/indexer-client.js');
  const deployment = { mode: 'testnet', indexerUrl: 'https://indexer.example.test' };
  const client = new PrivaIndexerClient({
    endpoint: deployment.indexerUrl,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ launches: [{ id: 'one', name: 'One', symbol: 'ONE', state: 'active', raisedTon: 2.5, participants: 4, ends: '1h' }] }),
    }),
  });
  const launches = await client.listTestnetLaunches(deployment);
  assert.equal(launches[0].id, 'one');
  assert.equal(launches[0].raised, 2.5);
  await assert.rejects(new PrivaIndexerClient({ endpoint: deployment.indexerUrl, fetchImpl: async () => ({ ok: true, json: async () => ({ launches: [{ name: 'broken' }] }) }) }).listTestnetLaunches(deployment), /invalid launch record/);
  await assert.rejects(client.listTestnetLaunches({ ...deployment, indexerUrl: 'https://other.example.test' }), /does not match/);
  console.log('✅ Testnet indexer client validation tests passed');
}

module.exports = { runIndexerClientTests };
