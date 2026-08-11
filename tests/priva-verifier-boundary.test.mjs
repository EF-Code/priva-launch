/**
 * Emulator proof-check for the standalone testnet verifier candidate.
 *
 * This deliberately tests only the cryptographic envelope. The launchpad
 * lifecycle remains the authorization boundary for recipient, policy,
 * nullifier, sale, and refund state.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const zkRequire = createRequire(path.join(root, 'vendor/zk-tele-auth/package.json'));
const {
  beginCell,
  Cell,
  contractAddress,
  SendMode,
  toNano,
} = zkRequire('@ton/core');
const { Blockchain } = zkRequire('@ton/sandbox');
const { proofToMessageCell } = zkRequire('export-ton-verifier');
const {
  PrivaPurchaseAuthProofGenerator,
  toBasechainAddressLimbs,
} = await import(path.join(root, 'vendor/zk-tele-auth/dist/sdk/index.js'));

function hasExitCode(result, exitCode) {
  return result.transactions.some((transaction) =>
    transaction.description.type === 'generic' &&
    transaction.description.computePhase.type === 'vm' &&
    transaction.description.computePhase.exitCode === exitCode,
  );
}

class RawVerifierCandidate {
  constructor(code, data) {
    this.init = { code, data };
    this.address = contractAddress(0, this.init);
  }

  async send(provider, via, body, value) {
    return provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }
}

const artifact = JSON.parse(
  fs.readFileSync(path.join(root, 'build/priva_purchase_auth_verifier_boundary.json'), 'utf8'),
);
const code = Cell.fromBoc(Buffer.from(artifact.code_boc64, 'base64'))[0];
const data = beginCell().endCell();
const candidate = new RawVerifierCandidate(code, data);
const blockchain = await Blockchain.create();
blockchain.now = Math.floor(Date.now() / 1000);
const deployer = await blockchain.treasury('priva-verifier-boundary-deployer', {
  balance: toNano('10'),
});
const candidateContract = blockchain.openContract(candidate);

await candidateContract.send(deployer.getSender(), beginCell().endCell(), toNano('1'));

const recipient = await blockchain.treasury('priva-verifier-boundary-recipient', {
  balance: toNano('10'),
});
const launchpadLimbs = toBasechainAddressLimbs(candidate.address);
const recipientLimbs = toBasechainAddressLimbs(recipient.address);
const now = blockchain.now;
const proofPayload = await PrivaPurchaseAuthProofGenerator.generateProof({
  userId: 424242,
  authDate: now - 5,
  isPremium: true,
  appDomain: 'testnet.priva.example',
  currentTimestamp: now,
  maxTokenAgeSec: 3600,
  isPremiumRequired: true,
  issuerSecret: '1892374981273498127349812734981273498',
  launchIdHash: '123456789012345678901234567890',
  launchpadAddressHi: launchpadLimbs.addressHi,
  launchpadAddressLo: launchpadLimbs.addressLo,
  recipientAddressHi: recipientLimbs.addressHi,
  recipientAddressLo: recipientLimbs.addressLo,
  clientNonce: '1',
  expiryEpoch: now + 300,
  circuitVersion: 1,
});
const proofBody = await proofToMessageCell({
  proof: proofPayload.proof,
  publicSignals: proofPayload.publicSignals,
  protocol: 'groth16',
  lang: 'tolk',
});

const accepted = await candidateContract.send(deployer.getSender(), proofBody, toNano('0.1'));
assert.ok(accepted.transactions.some((transaction) => transaction.description.type === 'generic' && transaction.description.computePhase.type === 'vm' && transaction.description.computePhase.exitCode === 0));

const underfunded = await candidateContract.send(deployer.getSender(), proofBody, toNano('0.01'));
assert.ok(hasExitCode(underfunded, 261), 'underfunded proof must be rejected');

const malformed = await candidateContract.send(
  deployer.getSender(),
  beginCell().storeUint(0xdeadbeef, 32).endCell(),
  toNano('0.1'),
);
assert.ok(hasExitCode(malformed, 258), 'unknown proof envelope must be rejected');

console.log('✓ real Groth16 proof accepted by the synchronous testnet verifier candidate');
console.log('✓ underfunded and malformed proof envelopes rejected');
console.log(`candidate=${candidate.address}`);
