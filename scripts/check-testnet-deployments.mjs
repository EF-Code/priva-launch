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

function hexFromBase64(value) {
  return Buffer.from(value, 'base64').toString('hex');
}

async function getJson(pathname) {
  await throttle();
  const target = new URL(`${apiRoot}${pathname}`);
  if (target.protocol !== 'https:') throw new Error('PRIVA_TESTNET_CHAIN_API must use HTTPS.');
  const body = await new Promise((resolve, reject) => {
    const request = https.get(target, { family: 4, headers: { Accept: 'application/json', 'User-Agent': 'priva-testnet-deployment-check/1.0' } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(text)); } catch { reject(new Error('invalid JSON response')); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    request.on('error', reject);
  }).catch((error) => {
    throw new Error(`Chain API request failed for ${pathname}: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!body?.ok) throw new Error(body?.error || 'TON Center returned ok=false');
  return body.result;
}

async function accountState(deployment, name) {
  const raw = rawAddress(deployment.rawAddress, `${name}.rawAddress`);
  const result = await getJson(`/getAddressInformation?address=${encodeURIComponent(raw)}`);
  if (result.state !== 'active') throw new Error(`${name} is not active (state=${result.state}).`);
  const code = Cell.fromBoc(Buffer.from(result.code, 'base64'))[0];
  const data = Cell.fromBoc(Buffer.from(result.data, 'base64'))[0];
  const codeCellHash = code.hash().toString('hex');
  const dataCellHash = data.hash().toString('hex');
  if (codeCellHash !== deployment.codeCellHash) throw new Error(`${name} code hash mismatch: expected ${deployment.codeCellHash}, got ${codeCellHash}.`);
  if (dataCellHash !== deployment.dataCellHash) throw new Error(`${name} data hash mismatch: expected ${deployment.dataCellHash}, got ${dataCellHash}.`);
  return { result, codeCellHash, dataCellHash };
}

async function hasTransaction(raw, expectedHex) {
  let lt;
  for (let page = 0; page < 50; page += 1) {
    // Public TON Center endpoints commonly rate-limit larger history pages;
    // one transaction per request is slower but deterministic and bounded.
    const query = new URLSearchParams({ address: raw, limit: '1' });
    if (lt) query.set('lt', lt);
    const transactions = await getJson(`/getTransactions?${query}`);
    for (const transaction of transactions || []) {
      const actual = hexFromBase64(transaction.transaction_id?.hash || '');
      if (actual === expectedHex) return transaction;
    }
    const last = transactions?.at(-1);
    if (!last?.transaction_id?.lt || transactions.length === 0) break;
    lt = last.transaction_id.lt;
  }
  throw new Error(`Recorded transaction ${expectedHex} was not found for ${raw}.`);
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
const minterRaw = rawAddress(minter.rawAddress, 'settlementMinter.rawAddress');
const launchpadRaw = rawAddress(launchpad.rawAddress, 'launchpad.rawAddress');
const minterState = await accountState(minter, 'settlementMinter');
const launchpadState = await accountState(launchpad, 'launchpad');
// Acton reports the external submission hash; TON Center's account history
// exposes the resulting account transaction hash. Verify the latter here.
const minterTx = verifyTransactions ? await hasTransaction(minterRaw, minter.accountTransactionHash) : null;
const launchpadTx = verifyTransactions ? await hasTransaction(launchpadRaw, launchpad.accountTransactionHash) : null;
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
