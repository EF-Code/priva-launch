#!/usr/bin/env node

/**
 * Read-only verification of the recorded testnet deployments.
 *
 * This command never signs, broadcasts, or uses a private credential. It
 * compares the observed record with fresh TON Center account/transaction
 * responses and decodes only the immutable/public StateInit data.
 */

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Address, Cell } from '@ton/core';

// Some development hosts have unreachable IPv6 routes while the public TON
// endpoint remains reachable over IPv4. Prefer IPv4 without disabling it.
dns.setDefaultResultOrder('ipv4first');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliArgs = process.argv.slice(2);
const candidate = cliArgs.find((arg) => !arg.startsWith('--')) || 'deployment/testnet/observed-deployments.json';
const file = path.resolve(root, candidate);
if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Deployment record path must stay within the repository.');
const record = JSON.parse(fs.readFileSync(file, 'utf8'));
if (record.network !== 'testnet' || record.status !== 'observed-testnet') throw new Error('Only an observed testnet deployment record may be checked.');

const apiRoot = (process.env.PRIVA_TESTNET_CHAIN_API || 'https://testnet.toncenter.com/api/v2').replace(/\/$/, '');
const timeoutMs = 15000;
const verifyTransactions = cliArgs.includes('--with-transactions') || process.env.PRIVA_CHECK_TRANSACTIONS === '1';
let nextRequestAt = 0;

async function throttle() {
  const waitMs = nextRequestAt - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  nextRequestAt = Date.now() + 1100;
}

function rawAddress(value, name) {
  try {
    const address = Address.parse(value);
    if (address.workChain !== 0) throw new Error('workchain must be 0');
    return address.toRawString();
  } catch (error) {
    throw new Error(`${name} is not a valid basechain address: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function testnetAddress(value, name) {
  try {
    const address = Address.parse(value);
    if (address.workChain !== 0) throw new Error('workchain must be 0');
    return address.toString({ urlSafe: true, bounceable: true, testOnly: true });
  } catch (error) {
    throw new Error(`${name} is not a valid basechain address: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function hexFromBase64(value) {
  return Buffer.from(value, 'base64').toString('hex');
}

async function getJson(pathname, attempt = 0) {
  await throttle();
  const target = new URL(`${apiRoot}${pathname}`);
  if (target.protocol !== 'https:') throw new Error('PRIVA_TESTNET_CHAIN_API must use HTTPS.');
  const body = await new Promise((resolve, reject) => {
    const request = https.get(target, { family: 4, headers: { Accept: 'application/json', 'User-Agent': 'priva-testnet-deployment-check/1.0' } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          const error = new Error(`HTTP ${response.statusCode}`);
          error.code = response.statusCode === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR';
          error.retryAfterMs = Number(response.headers['retry-after']) > 0 ? Number(response.headers['retry-after']) * 1000 : 3000;
          return reject(error);
        }
        try { resolve(JSON.parse(text)); } catch { reject(new Error('invalid JSON response')); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    request.on('error', reject);
  }).catch(async (error) => {
    if (error?.code === 'RATE_LIMIT' && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(error.retryAfterMs || 3000, 10000)));
      return getJson(pathname, attempt + 1);
    }
    throw new Error(`Chain API request failed for ${pathname}: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!body?.ok) throw new Error(body?.error || 'TON Center returned ok=false');
  return body.result;
}

async function accountState(deployment, name) {
  const raw = rawAddress(deployment.rawAddress, `${name}.rawAddress`);
  const friendly = testnetAddress(deployment.address, `${name}.address`);
  // TON Center has intermittently returned the uninitialized state for these
  // testnet accounts when queried by raw `0:<hash>` notation. Use the pinned
  // friendly testnet address for the request, while still validating that the
  // recorded raw address is the same account.
  if (raw !== Address.parse(friendly).toRawString()) throw new Error(`${name}.address and rawAddress refer to different accounts.`);
  const result = await getJson(`/getAddressInformation?address=${encodeURIComponent(friendly)}`);
  if (result.state !== 'active') throw new Error(`${name} is not active (state=${result.state}).`);
  const code = Cell.fromBoc(Buffer.from(result.code, 'base64'))[0];
  const data = Cell.fromBoc(Buffer.from(result.data, 'base64'))[0];
  const codeCellHash = code.hash().toString('hex');
  const dataCellHash = data.hash().toString('hex');
  if (codeCellHash !== deployment.codeCellHash) throw new Error(`${name} code hash mismatch: expected ${deployment.codeCellHash}, got ${codeCellHash}.`);
  if (dataCellHash !== deployment.dataCellHash) throw new Error(`${name} data hash mismatch: expected ${deployment.dataCellHash}, got ${dataCellHash}.`);
  return { result, codeCellHash, dataCellHash };
}

async function hasTransaction(address, expectedHex) {
  let lt;
  let hash;
  for (let page = 0; page < 50; page += 1) {
    // Public TON Center endpoints commonly rate-limit larger history pages;
    // one transaction per request is slower but deterministic and bounded.
    const query = new URLSearchParams({ address, limit: '1' });
    if (lt && hash) {
      // TON Center requires the cursor pair, not `lt` alone.
      query.set('lt', lt);
      query.set('hash', hash);
    }
    const transactions = await getJson(`/getTransactions?${query}`);
    for (const transaction of transactions || []) {
      const actual = hexFromBase64(transaction.transaction_id?.hash || '');
      if (actual === expectedHex) return transaction;
    }
    const last = transactions?.at(-1);
    if (!last?.transaction_id?.lt || transactions.length === 0) break;
    lt = last.transaction_id.lt;
    hash = last.transaction_id.hash;
  }
  throw new Error(`Recorded transaction ${expectedHex} was not found for ${address}.`);
}

function decodeMinterData(data) {
  const slice = data.beginParse();
  slice.loadCoins();
  const admin = slice.loadAddressAny();
  const nextAdmin = slice.loadAddressAny();
  slice.loadRef();
  slice.loadRef();
  const adminLocked = slice.loadBit();
  return {
    admin: admin ? admin.toString({ urlSafe: true, bounceable: true, testOnly: true }) : null,
    nextAdmin: nextAdmin ? nextAdmin.toString({ urlSafe: true, bounceable: true, testOnly: true }) : null,
    adminLocked,
  };
}

const minter = record.settlementMinter;
const launchpad = record.launchpad;
if (!record.verifier || record.verifier.mode !== 'inlined') throw new Error('Deployment record must describe the current verifier as inlined.');
if (!/^[a-f0-9]{64}$/.test(record.verifier.sourceSha256 || '')) throw new Error('Deployment record verifier.sourceSha256 must be a lowercase SHA-256 digest.');
if (!/^[a-f0-9]{64}$/.test(record.verifier.launchpadCodeHash || '')) throw new Error('Deployment record verifier.launchpadCodeHash must be a lowercase SHA-256 digest.');
if (record.verifier.launchpadCodeHash !== launchpad.codeCellHash) throw new Error('Deployment record inlined verifier hash does not match the launchpad code hash.');
const verifierSourcePath = path.join(root, 'vendor', 'zk-tele-auth', 'contracts', 'priva_purchase_auth_verifier.tolk');
if (!fs.existsSync(verifierSourcePath)) throw new Error(`Pinned verifier source is missing: ${verifierSourcePath}`);
const verifierSourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(verifierSourcePath)).digest('hex');
if (verifierSourceSha256 !== record.verifier.sourceSha256) throw new Error(`Pinned verifier source hash mismatch: expected ${record.verifier.sourceSha256}, got ${verifierSourceSha256}.`);
if (!record.tonConnect || record.tonConnect.appUrl !== 'https://ef-code.github.io/priva-launch' || record.tonConnect.manifestUrl !== 'https://ef-code.github.io/priva-launch/tonconnect-manifest.json' || record.tonConnect.origin !== 'https://ef-code.github.io') {
  throw new Error('Deployment record TonConnect origin/manifest binding is invalid.');
}
const minterFriendly = testnetAddress(minter.address, 'settlementMinter.address');
const launchpadFriendly = testnetAddress(launchpad.address, 'launchpad.address');
const minterState = await accountState(minter, 'settlementMinter');
const launchpadState = await accountState(launchpad, 'launchpad');
// Acton reports the external submission hash; TON Center's account history
// exposes the resulting account transaction hash. Verify the latter here.
const minterTx = verifyTransactions ? await hasTransaction(minterFriendly, minter.accountTransactionHash) : null;
const launchpadTx = verifyTransactions ? await hasTransaction(launchpadFriendly, launchpad.accountTransactionHash) : null;
const minterData = decodeMinterData(Cell.fromBoc(Buffer.from(minterState.result.data, 'base64'))[0]);
const expectedFinalAdmin = record.adminHandoff?.finalAdminAddress;
if (!expectedFinalAdmin) throw new Error('Deployment record is missing adminHandoff.finalAdminAddress.');
if (minterData.admin !== expectedFinalAdmin) throw new Error(`Minter admin mismatch: expected ${expectedFinalAdmin}, got ${minterData.admin}.`);
if (minterData.nextAdmin !== null || minterData.adminLocked !== true) throw new Error('Minter admin handoff is not final (next_admin must be null and admin_locked must be true).');

console.log(JSON.stringify({
  network: 'testnet',
  apiRoot,
  transactionVerification: verifyTransactions ? 'included-account-transaction-checked' : 'not-requested (use --with-transactions for bounded history checks)',
  settlementMinter: {
    address: minter.address,
    state: minterState.result.state,
    codeCellHash: minterState.codeCellHash,
    dataCellHash: minterState.dataCellHash,
    broadcastTransactionHash: minter.broadcastTransactionHash,
    accountTransactionHash: minter.accountTransactionHash,
    deploymentTransactionFound: verifyTransactions ? Boolean(minterTx) : null,
    admin: minterData.admin,
    nextAdmin: minterData.nextAdmin,
    adminLocked: minterData.adminLocked,
  },
  launchpad: {
    address: launchpad.address,
    state: launchpadState.result.state,
    codeCellHash: launchpadState.codeCellHash,
    dataCellHash: launchpadState.dataCellHash,
    broadcastTransactionHash: launchpad.broadcastTransactionHash,
    accountTransactionHash: launchpad.accountTransactionHash,
    deploymentTransactionFound: verifyTransactions ? Boolean(launchpadTx) : null,
  },
}, null, 2));
