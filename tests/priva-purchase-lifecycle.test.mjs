/**
 * Real-proof controlled-testnet lifecycle evidence.
 *
 * This test deliberately uses the checked-in Acton launchpad build, the
 * reviewed settlement-minter/wallet artifacts, and a real Groth16 proof. It
 * is a diagnostic gate, not deployment authorization: live deployment still
 * requires an independent review of the fork, code hash, gas reserve, and
 * reviewed initialization manifest.
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
  Dictionary,
  SendMode,
  toNano,
} = zkRequire('@ton/core');
const { Blockchain } = zkRequire('@ton/sandbox');
const { proofToMessageCell } = zkRequire('export-ton-verifier');

const {
  NullifierDeriver,
  PrivaPurchaseAuthProofGenerator,
  PrivaPurchaseAuthProofVerifier,
  toBasechainAddressLimbs,
} = await import(path.join(root, 'vendor/zk-tele-auth/dist/sdk/index.js'));

const MINTER_CHANGE_ADMIN_OPCODE = 0x6501f354;
const MINTER_CLAIM_ADMIN_OPCODE = 0xfb88e119;
const LAUNCHPAD_BUY_OPCODE = 0x50525642;
const MINT_FAILURE_OPCODE = 0x50525646;

const DOMAIN = 'testnet.priva.example';
const ISSUER_SECRET = '1892374981273498127349812734981273498';
const LAUNCH_ID_HASH = '123456789012345678901234567890';
const MAX_TOKEN_AGE = 3600;
const MAX_CLOCK_SKEW = 300;
const MAX_AUTH_TTL = 600;
const PRICE = 1_000_000_000n;
const RAW_JETTON_PER_UNIT = 1_000_000_000n;
const IDENTITY_CAP = 2_000_000_000n;
const WALLET_FUNDING = 50_000_000n;
const MINT_MESSAGE_VALUE = 200_000_000n;
const REFUND_GAS_RESERVE = 50_000_000n;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function cellFromHex(hex) {
  return Cell.fromBoc(Buffer.from(hex, 'hex'))[0];
}

function cellFromBase64(value) {
  return Cell.fromBoc(Buffer.from(value, 'base64'))[0];
}

function accountId(address) {
  return BigInt(`0x${address.hash.toString('hex')}`);
}

class RawContract {
  constructor(address, init = undefined) {
    this.address = address;
    this.init = init;
  }

  async sendDeploy(provider, via, value) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendBody(provider, via, body, value) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }
}

class JettonMinterContract extends RawContract {
  async sendChangeAdmin(provider, via, queryId, nextAdmin) {
    return this.sendBody(provider, via, beginCell()
      .storeUint(MINTER_CHANGE_ADMIN_OPCODE, 32)
      .storeUint(queryId, 64)
      .storeAddress(nextAdmin)
      .endCell(), toNano('0.2'));
  }

  async sendClaimAdmin(provider, via, queryId) {
    return this.sendBody(provider, via, beginCell()
      .storeUint(MINTER_CLAIM_ADMIN_OPCODE, 32)
      .storeUint(queryId, 64)
      .endCell(), toNano('0.2'));
  }

  async getJettonData(provider) {
    const result = await provider.get('get_jetton_data', []);
    return {
      totalSupply: result.stack.readBigNumber(),
      mintable: result.stack.readBoolean(),
      admin: result.stack.readAddressOpt(),
      content: result.stack.readCell(),
      walletCode: result.stack.readCell(),
    };
  }

  async getNextAdmin(provider) {
    return (await provider.get('get_next_admin_address', [])).stack.readAddressOpt();
  }

  async getWalletAddress(provider, owner) {
    return (await provider.get('get_wallet_address', [{
      type: 'slice',
      cell: beginCell().storeAddress(owner).endCell(),
    }])).stack.readAddress();
  }
}

class LaunchpadContract extends RawContract {
  async sendBuy(provider, via, queryId, maxValue, recipient, proof, publicInputs, value) {
    const body = beginCell()
      .storeUint(LAUNCHPAD_BUY_OPCODE, 32)
      .storeUint(queryId, 64)
      .storeCoins(maxValue)
      .storeAddress(recipient)
      .storeRef(proof)
      .storeRef(publicInputs)
      .endCell();
    return this.sendBody(provider, via, body, value);
  }

  async sendClaimAdmin(provider, via, queryId) {
    return this.sendBody(provider, via, beginCell()
      .storeUint(0x50525641, 32)
      .storeUint(queryId, 64)
      .endCell(), toNano('0.3'));
  }

  async sendRefundClaim(provider, via, queryId, value = toNano('0.2')) {
    return this.sendBody(provider, via, beginCell()
      .storeUint(0x50525652, 32)
      .storeUint(queryId, 64)
      .endCell(), value);
  }

  async sendMintFailure(provider, via, queryId, jettonAmount, value = toNano('0.1')) {
    return this.sendBody(provider, via, beginCell()
      .storeUint(MINT_FAILURE_OPCODE, 32)
      .storeUint(queryId, 64)
      .storeCoins(jettonAmount)
      .endCell(), value);
  }

  async getAccounting(provider) {
    const result = await provider.get('getPrivaTestnetAccounting', []);
    return {
      soldSaleUnits: result.stack.readBigNumber(),
      pendingSaleUnits: result.stack.readBigNumber(),
      acceptedNanoTon: result.stack.readBigNumber(),
      pendingAcceptedNanoTon: result.stack.readBigNumber(),
    };
  }

  async getQueryState(provider, queryId) {
    return (await provider.get('getPrivaTestnetQueryState', [{ type: 'int', value: BigInt(queryId) }])).stack.readNumber();
  }

  async getQueryUsed(provider, queryId) {
    return (await provider.get('getPrivaTestnetQueryUsed', [{ type: 'int', value: BigInt(queryId) }])).stack.readBoolean();
  }
}

function buildLaunchpadData({ minter, walletCode, appDomainHash, issuerKeyHash }) {
  const settlementTerms = beginCell()
    .storeRef(walletCode)
    .storeCoins(WALLET_FUNDING)
    .storeCoins(MINT_MESSAGE_VALUE)
    .storeCoins(REFUND_GAS_RESERVE)
    .endCell();
  const saleTerms = beginCell()
    .storeAddress(minter)
    .storeCoins(PRICE)
    .storeUint(100, 64)
    .storeCoins(RAW_JETTON_PER_UNIT)
    .storeCoins(IDENTITY_CAP)
    .storeRef(settlementTerms)
    .endCell();
  const policy = beginCell()
    .storeUint(BigInt(appDomainHash), 256)
    .storeUint(BigInt(issuerKeyHash), 256)
    .storeUint(BigInt(LAUNCH_ID_HASH), 256)
    .storeUint(MAX_TOKEN_AGE, 32)
    .storeUint(MAX_CLOCK_SKEW, 32)
    .storeUint(MAX_AUTH_TTL, 32)
    .storeBit(1)
    .storeRef(saleTerms)
    .endCell();
  const settlement = beginCell().storeDict(null).storeDict(null).endCell();
  const accounting = beginCell()
    .storeUint(0, 64)
    .storeUint(0, 64)
    .storeCoins(0)
    .storeCoins(0)
    .storeDict(null)
    .storeDict(null)
    .storeDict(null)
    .storeRef(settlement)
    .endCell();
  return beginCell().storeRef(policy).storeRef(accounting).endCell();
}

function splitProofMessage(message) {
  const slice = message.beginParse();
  assert.equal(slice.loadUint(32), 0x3b3cca17, 'proof envelope opcode');
  return { proof: slice.loadRef(), publicInputs: slice.loadRef() };
}

async function loadArtifacts() {
  const minter = readJson('build/priva_settlement_minter.json');
  const wallet = readJson('vendor/ton-token-contract/build/JettonWallet.compiled.json');
  return {
    minterCode: cellFromBase64(minter.codeBoc64),
    walletCode: cellFromHex(wallet.hex),
    walletLibrary: cellFromHex(wallet.libraryBoc),
    minterArtifact: minter,
  };
}

async function makeProof({ now, launchpad, recipient, clientNonce }) {
  const launchpadLimbs = toBasechainAddressLimbs(launchpad);
  const recipientLimbs = toBasechainAddressLimbs(recipient);
  const proofPayload = await PrivaPurchaseAuthProofGenerator.generateProof({
    userId: 424242,
    authDate: now - 5,
    isPremium: true,
    appDomain: DOMAIN,
    currentTimestamp: now,
    maxTokenAgeSec: MAX_TOKEN_AGE,
    isPremiumRequired: true,
    issuerSecret: ISSUER_SECRET,
    launchIdHash: LAUNCH_ID_HASH,
    launchpadAddressHi: launchpadLimbs.addressHi,
    launchpadAddressLo: launchpadLimbs.addressLo,
    recipientAddressHi: recipientLimbs.addressHi,
    recipientAddressLo: recipientLimbs.addressLo,
    clientNonce: String(clientNonce),
    expiryEpoch: now + 300,
    circuitVersion: 1,
  });
  const issuerKeyHash = await NullifierDeriver.deriveIssuerKeyHash(ISSUER_SECRET);
  const selfCheck = await PrivaPurchaseAuthProofVerifier.verifyProof(proofPayload, {
    expectedAppDomain: DOMAIN,
    expectedIssuerKeyHash: issuerKeyHash,
    maxTokenAgeSec: MAX_TOKEN_AGE,
    requirePremium: true,
    expectedLaunchIdHash: LAUNCH_ID_HASH,
    expectedLaunchpadAddressHi: launchpadLimbs.addressHi,
    expectedLaunchpadAddressLo: launchpadLimbs.addressLo,
    expectedRecipientAddressHi: recipientLimbs.addressHi,
    expectedRecipientAddressLo: recipientLimbs.addressLo,
    maxAuthorizationTtlSec: MAX_AUTH_TTL,
    expectedCircuitVersion: 1,
  });
  assert.equal(selfCheck.isValid, true, selfCheck.error);
  return {
    ...splitProofMessage(await proofToMessageCell({
      proof: proofPayload.proof,
      publicSignals: proofPayload.publicSignals,
      protocol: 'groth16',
      lang: 'tolk',
    })),
    payload: proofPayload,
  };
}

async function setup({ claimAdmin, withWalletLibrary = true }) {
  const artifacts = await loadArtifacts();
  const blockchain = await Blockchain.create();
  blockchain.now = Math.floor(Date.now() / 1000);
  const libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
  libs.set(BigInt(`0x${artifacts.walletCode.hash().toString('hex')}`), artifacts.walletCode);
  blockchain.libs = withWalletLibrary
    ? beginCell().storeDictDirect(libs).endCell()
    : beginCell().storeDict(null).endCell();

  const deployer = await blockchain.treasury(`priva-real-lifecycle-deployer-${claimAdmin ? 'success' : 'bounce'}`, { balance: toNano('100') });
  const buyer = await blockchain.treasury(`priva-real-lifecycle-buyer-${claimAdmin ? 'success' : 'bounce'}`, { balance: toNano('100') });
  const metadata = beginCell().storeStringRefTail('https://ef-code.github.io/priva-launch/testnet/v1/metadata.json').endCell();
  const minterData = beginCell()
    .storeCoins(0)
    .storeAddress(deployer.address)
    .storeAddress(null)
    .storeRef(artifacts.walletLibrary)
    .storeRef(metadata)
    .storeBit(0)
    .endCell();
  const minterInit = { code: artifacts.minterCode, data: minterData };
  const minterAddress = contractAddress(0, minterInit);
  const minter = blockchain.openContract(new JettonMinterContract(minterAddress, minterInit));
  await minter.sendDeploy(deployer.getSender(), toNano('5'));

  const appDomainHash = await NullifierDeriver.hashAppDomain(DOMAIN);
  const issuerKeyHash = await NullifierDeriver.deriveIssuerKeyHash(ISSUER_SECRET);
  const launchpadData = buildLaunchpadData({
    minter: minter.address,
    walletCode: artifacts.walletLibrary,
    appDomainHash,
    issuerKeyHash,
  });
  const launchpadInit = { code: cellFromBase64(readJson('build/priva_testnet_launchpad.json').code_boc64), data: launchpadData };
  const launchpadAddress = contractAddress(0, launchpadInit);
  const launchpad = blockchain.openContract(new LaunchpadContract(launchpadAddress, launchpadInit));
  await launchpad.sendDeploy(deployer.getSender(), toNano('10'));

  if (claimAdmin) {
    await minter.sendChangeAdmin(deployer.getSender(), 1, launchpad.address);
    await launchpad.sendClaimAdmin(deployer.getSender(), 2);
    const minterState = await minter.getJettonData();
    assert.equal(minterState.admin.toString(), launchpad.address.toString());
    assert.equal(await minter.getNextAdmin(), null);
  }

  return { blockchain, deployer, buyer, minter, launchpad, artifacts };
}

async function runSuccessLifecycle() {
  const scenario = await setup({ claimAdmin: true });
  const { blockchain, buyer, minter, launchpad } = scenario;
  const now = blockchain.now;
  const proof = await makeProof({ now, launchpad: launchpad.address, recipient: buyer.address, clientNonce: 1 });
  const maxValue = PRICE;
  const buyValue = maxValue + REFUND_GAS_RESERVE + toNano('0.1');
  const result = await launchpad.sendBuy(
    buyer.getSender(),
    1001,
    maxValue,
    buyer.address,
    proof.proof,
    proof.publicInputs,
    buyValue,
  );
  assert.ok(result.transactions.length >= 3, 'buy should include launchpad, minter and wallet transactions');
  assert.ok(result.transactions.some((tx) => tx.address === accountId(launchpad.address)), 'launchpad transaction must be present in trace');
  assert.equal(await launchpad.getQueryUsed(1001), true);

  const walletAddress = await minter.getWalletAddress(buyer.address);
  const walletCode = (await minter.getJettonData()).walletCode;
  assert.equal(walletCode.hash().toString('hex'), scenario.artifacts.walletLibrary.hash().toString('hex'));
  const wallet = blockchain.openContract(new RawContract(walletAddress));
  const walletProvider = blockchain.provider(wallet.address);
  const walletData = await walletProvider.get('get_wallet_data', []);
  const jettonBalance = walletData.stack.readBigNumber();
  assert.equal(jettonBalance, RAW_JETTON_PER_UNIT);
  const minterAfter = await minter.getJettonData();
  assert.equal(minterAfter.totalSupply, RAW_JETTON_PER_UNIT);

  const accounting = await launchpad.getAccounting();
  assert.equal(accounting.soldSaleUnits, 1n);
  assert.equal(accounting.pendingSaleUnits, 0n);
  assert.equal(accounting.acceptedNanoTon, PRICE);
  assert.equal(accounting.pendingAcceptedNanoTon, 0n);
  assert.equal(await launchpad.getQueryState(1001), 2, 'excesses should leave only an excess refund claim');
  const refund = await launchpad.sendRefundClaim(buyer.getSender(), 1001);
  assert.ok(refund.transactions.some((tx) => tx.address === accountId(launchpad.address)), 'refund claim must execute on launchpad');
  assert.equal(await launchpad.getQueryState(1001), 3, 'refund is marked sent before the outbound transfer');
  const duplicateRefund = await launchpad.sendRefundClaim(buyer.getSender(), 1001);
  assert.ok(duplicateRefund.transactions.some((tx) => tx.description?.computePhase?.exitCode === 925), 'duplicate refund claim must be rejected');
  console.log('✓ real Groth16 proof -> settlement minter -> actual wallet -> authenticated excesses finalizes sale');
  console.log(`  launchpad=${launchpad.address} minter=${minter.address} wallet=${walletAddress}`);
  return scenario;
}

async function runDirectBounceLifecycle() {
  const scenario = await setup({ claimAdmin: false });
  const { blockchain, buyer, minter, launchpad } = scenario;
  const proof = await makeProof({ now: blockchain.now, launchpad: launchpad.address, recipient: buyer.address, clientNonce: 2 });
  const result = await launchpad.sendBuy(
    buyer.getSender(),
    2002,
    PRICE,
    buyer.address,
    proof.proof,
    proof.publicInputs,
    PRICE + REFUND_GAS_RESERVE + toNano('0.1'),
  );
  assert.ok(result.transactions.some((tx) => tx.inMessageBounced || tx.description?.computePhase?.exitCode === 73), 'settlement minter should reject a mint from a non-admin launchpad');
  const accounting = await launchpad.getAccounting();
  assert.equal(accounting.soldSaleUnits, 0n);
  assert.equal(accounting.pendingSaleUnits, 0n, 'direct mint bounce releases the reservation');
  assert.equal(await launchpad.getQueryState(2002), 2, 'direct mint bounce creates a refund claim');
  const minterAfter = await minter.getJettonData();
  assert.equal(minterAfter.totalSupply, 0n);
  const attacker = await blockchain.treasury('priva-real-lifecycle-refund-attacker', { balance: toNano('10') });
  const forgedRefund = await launchpad.sendRefundClaim(attacker.getSender(), 2002);
  assert.ok(forgedRefund.transactions.some((tx) => tx.description?.computePhase?.exitCode === 926), 'refund claims are sender-bound');
  console.log('✓ real Groth16 proof -> settlement minter admin rejection -> authenticated direct-bounce refund path');
  return scenario;
}

async function runDownstreamBounceLifecycle() {
  const scenario = await setup({ claimAdmin: true, withWalletLibrary: false });
  const { blockchain, buyer, minter, launchpad } = scenario;
  const proof = await makeProof({ now: blockchain.now, launchpad: launchpad.address, recipient: buyer.address, clientNonce: 4 });
  const result = await launchpad.sendBuy(
    buyer.getSender(),
    4004,
    PRICE,
    buyer.address,
    proof.proof,
    proof.publicInputs,
    PRICE + REFUND_GAS_RESERVE + toNano('0.1'),
  );
  const callbackDelivered = result.transactions.some((tx) => {
    if (tx.address !== accountId(launchpad.address) || !tx.inMessage?.body) return false;
    const body = tx.inMessage.body.beginParse();
    return body.remainingBits >= 32 && body.preloadUint(32) === MINT_FAILURE_OPCODE;
  });
  assert.equal(callbackDelivered, true, 'missing wallet library must reach the launchpad callback');
  const accounting = await launchpad.getAccounting();
  assert.equal(accounting.soldSaleUnits, 0n);
  assert.equal(accounting.pendingSaleUnits, 0n, 'downstream callback releases the reservation');
  assert.equal(accounting.acceptedNanoTon, 0n);
  assert.equal(accounting.pendingAcceptedNanoTon, 0n);
  assert.equal(await launchpad.getQueryState(4004), 2, 'authenticated downstream callback creates a refund claim');
  assert.equal((await minter.getJettonData()).totalSupply, 0n, 'supply rollback accompanies the callback');
  console.log('✓ real Groth16 proof -> wallet bounce -> authenticated minter callback -> refund state');
}

async function runPolicyAndCallbackGuards() {
  const scenario = await setup({ claimAdmin: true });
  const { blockchain, buyer, launchpad } = scenario;
  const proof = await makeProof({ now: blockchain.now, launchpad: launchpad.address, recipient: buyer.address, clientNonce: 3 });
  const wrongRecipient = await blockchain.treasury('priva-real-lifecycle-wrong-recipient', { balance: toNano('10') });
  const result = await launchpad.sendBuy(
    buyer.getSender(),
    3003,
    PRICE,
    wrongRecipient.address,
    proof.proof,
    proof.publicInputs,
    PRICE + REFUND_GAS_RESERVE + toNano('0.1'),
  );
  assert.ok(result.transactions.some((tx) => tx.description?.computePhase?.exitCode === 908), 'recipient binding must be enforced on-chain');
  const forged = await launchpad.sendMintFailure(buyer.getSender(), 9999, RAW_JETTON_PER_UNIT);
  assert.ok(forged.transactions.some((tx) => tx.description?.computePhase?.exitCode === 924), 'forged terminal callback must be rejected');
  console.log('✓ real proof policy binding rejects recipient substitution and forged failure callback');
}

async function main() {
  const success = await runSuccessLifecycle();
  await runDirectBounceLifecycle();
  await runDownstreamBounceLifecycle();
  await runPolicyAndCallbackGuards();
  const minterArtifact = readJson('build/priva_settlement_minter.json');
  assert.equal(minterArtifact.callback.opcode, '0x50525646');
  assert.equal(minterArtifact.callback.responseMustEqualAdmin, true);
  assert.equal(minterArtifact.callback.upgradeDisabled, true);
  console.log(`SETTLEMENT MINTER CANDIDATE: ${minterArtifact.codeCellHash}`);
  console.log('DEPLOYMENT GATE: independent fork review, live testnet initialization evidence, and signed release approvals remain required');
  console.log(`Evidence candidate launchpad: ${success.launchpad.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
