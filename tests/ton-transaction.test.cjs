const assert = require('assert');

async function runTonTransactionTests() {
  const { beginCell } = await import('@ton/core');
  const { buildTestnetBuyTransaction, decodeTestnetBuyPayload, PRIVA_TESTNET_NETWORK } = await import('../src/ton-transaction.js');
  const { TonWalletManager } = await import('../src/ton-wallet.js');
  const address = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
  const deployment = { mode: 'testnet', launchpadAddress: address };
  const empty = beginCell().endCell();
  const proof = beginCell().storeRef(empty).storeRef(empty).storeRef(empty).endCell();
  const publicInputs = beginCell().storeUint(1, 257).endCell();
  const transaction = buildTestnetBuyTransaction({
    deployment,
    queryId: 7n,
    maxValue: 1000000000n,
    recipient: address,
    proof,
    publicInputs,
    value: 1100000000n,
    validUntil: Math.floor(Date.now() / 1000) + 120,
  });
  assert.equal(transaction.network, PRIVA_TESTNET_NETWORK);
  assert.equal(transaction.messages.length, 1);
  const decoded = decodeTestnetBuyPayload(transaction.messages[0].payload);
  assert.equal(decoded.queryId, 7n);
  assert.equal(decoded.maxValue, 1000000000n);
  assert.equal(decoded.recipient, address);
  assert.throws(() => buildTestnetBuyTransaction({ deployment, queryId: 7n, maxValue: 2n, recipient: address, proof, publicInputs, value: 1n, validUntil: Math.floor(Date.now() / 1000) + 120 }), /cover maxValue/);
  assert.throws(() => buildTestnetBuyTransaction({ deployment, queryId: 7n, maxValue: 1n, recipient: address, proof: empty, publicInputs, value: 2n, validUntil: Math.floor(Date.now() / 1000) + 120 }), /three point references/);
  const sent = [];
  const connector = {
    wallet: { account: { address }, device: { appName: 'Test wallet' } },
    openModal: async () => {},
    sendTransaction: async (request) => { sent.push(request); return { boc: 'signed-boc' }; },
    onStatusChange: () => () => {},
  };
  const wallet = new TonWalletManager({ deployment, connector });
  await wallet.connectWallet();
  const submitted = await wallet.sendTransaction(transaction);
  assert.equal(submitted.status, 'submitted');
  assert.equal(sent.length, 1);
  await assert.rejects(wallet.sendTransaction({ ...transaction, messages: [{ ...transaction.messages[0], address: 'EQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }] }), /destination/);
  console.log('✅ TonConnect transaction builder and canonical buy payload tests passed');
}

module.exports = { runTonTransactionTests };
