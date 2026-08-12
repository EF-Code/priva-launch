#!/usr/bin/env node

/**
 * Derive the exact settlement-minter StateInit data from a real admin wallet
 * and the pinned public metadata URL.  This command is intentionally
 * read-only: it does not contact TON, sign anything, or write a manifest.
 * Store its JSON output outside the repository with restrictive permissions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Address, Cell, beginCell, contractAddress } from '@ton/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = path.join(root, 'build', 'priva_settlement_minter.json');
const walletArtifactPath = path.join(root, 'vendor', 'ton-token-contract', 'build', 'JettonWallet.compiled.json');

function usage() {
  console.error('Usage: npm run create:testnet-minter-init -- <INITIAL_ADMIN_ADDRESS> <HTTPS_METADATA_URL>');
  process.exitCode = 2;
}

const [adminInput, metadataInput] = process.argv.slice(2);
if (!adminInput || !metadataInput) usage();
if (!adminInput || !metadataInput) process.exit(2);

let admin;
try {
  admin = Address.parse(adminInput);
} catch (error) {
  throw new Error(`INITIAL_ADMIN_ADDRESS must be a valid TON address: ${error instanceof Error ? error.message : String(error)}`);
}
if (admin.workChain !== 0) throw new Error('INITIAL_ADMIN_ADDRESS must use workchain 0.');

let metadata;
try {
  metadata = new URL(metadataInput);
} catch {
  throw new Error('HTTPS_METADATA_URL must be an absolute URL.');
}
if (metadata.protocol !== 'https:') throw new Error('HTTPS_METADATA_URL must use HTTPS.');
if (metadata.username || metadata.password || metadata.search || metadata.hash) {
  throw new Error('HTTPS_METADATA_URL must not contain credentials, query parameters, or a fragment.');
}

if (!fs.existsSync(artifactPath)) throw new Error('Missing build/priva_settlement_minter.json; run npm run compile:settlement-minter first.');
if (!fs.existsSync(walletArtifactPath)) throw new Error('Missing pinned JettonWallet artifact.');

const minterArtifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const walletArtifact = JSON.parse(fs.readFileSync(walletArtifactPath, 'utf8'));
if (typeof minterArtifact.codeBoc64 !== 'string' || minterArtifact.codeBoc64.length === 0) throw new Error('Minter artifact has no codeBoc64.');
if (typeof walletArtifact.libraryBoc !== 'string' || walletArtifact.libraryBoc.length === 0) throw new Error('JettonWallet artifact has no libraryBoc.');

const metadataCell = beginCell().storeStringRefTail(metadata.toString()).endCell();
const walletLibrary = Cell.fromBoc(Buffer.from(walletArtifact.libraryBoc, 'hex'))[0];
const code = Cell.fromBoc(Buffer.from(minterArtifact.codeBoc64, 'base64'))[0];
const data = beginCell()
  .storeCoins(0)
  .storeAddress(admin)
  .storeAddress(null)
  .storeRef(walletLibrary)
  .storeRef(metadataCell)
  .storeBit(0)
  .endCell();
const address = contractAddress(0, { code, data });

const result = {
  schemaVersion: 1,
  network: 'testnet',
  initialAdminAddress: admin.toString({ urlSafe: true, bounceable: true, testOnly: true }),
  initialAdminRawAddress: admin.toRawString(),
  metadataUrl: metadata.toString(),
  minterAddress: address.toString({ urlSafe: true, bounceable: true, testOnly: true }),
  minterRawAddress: address.toRawString(),
  codeCellHash: code.hash().toString('hex'),
  dataCellHash: data.hash().toString('hex'),
  walletLibraryCellHash: walletLibrary.hash().toString('hex'),
  metadataCellHash: metadataCell.hash().toString('hex'),
  dataBocBase64: data.toBoc({ idx: false }).toString('base64'),
  dataBocHex: data.toBoc({ idx: false }).toString('hex'),
};

console.log(JSON.stringify(result, null, 2));
