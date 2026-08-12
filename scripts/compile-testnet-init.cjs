const fs = require('fs');
const path = require('path');
const { Address, beginCell } = require('@ton/core');

const candidate = process.argv[2];
if (!candidate) throw new Error('Usage: npm run compile:testnet-init -- deployment/testnet/reviewed-init.json');
const root = path.resolve(__dirname, '..');
const file = path.resolve(root, candidate);
if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Initialization manifest path must stay within the repository.');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (manifest.network !== 'testnet' || manifest.status !== 'reviewed') throw new Error('Only a reviewed testnet initialization manifest may be compiled.');
const buildArtifact = JSON.parse(fs.readFileSync(path.join(root, 'build', 'priva_testnet_launchpad.json'), 'utf8'));
const minterArtifact = JSON.parse(fs.readFileSync(path.join(root, 'build', 'priva_settlement_minter.json'), 'utf8'));
const walletArtifact = JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'ton-token-contract', 'build', 'JettonWallet.compiled.json'), 'utf8'));
const walletLibraryCellHash = require('@ton/core').Cell.fromBoc(Buffer.from(walletArtifact.libraryBoc, 'hex'))[0].hash().toString('hex');
const walletLibraryCell = require('@ton/core').Cell.fromBoc(Buffer.from(walletArtifact.libraryBoc, 'hex'))[0];
const codeCellHash = String(buildArtifact.hash || '').toLowerCase();
if (!/^[a-f0-9]{64}$/.test(codeCellHash)) throw new Error('Acton build artifact has no valid launchpad code-cell hash. Run acton build first.');
if (manifest.launchpadCodeSha256 !== codeCellHash) throw new Error('Manifest launchpadCodeSha256 does not match the current Acton build artifact.');
if (manifest.settlementMinterCodeSha256 !== minterArtifact.codeCellHash) throw new Error('Manifest settlementMinterCodeSha256 does not match the settlement-minter artifact.');
if (manifest.settlementMinterCallbackOpcode !== minterArtifact.callback.opcode) throw new Error('Manifest settlementMinterCallbackOpcode does not match the settlement-minter artifact.');
if (manifest.settlementMinterWalletCodeSha256 !== walletLibraryCellHash) throw new Error('Manifest settlementMinterWalletCodeSha256 does not match the pinned wallet library artifact.');

const u = (value, bits, name) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${name} must be a canonical decimal string.`);
  const parsed = BigInt(value);
  if (parsed >= (1n << BigInt(bits))) throw new Error(`${name} exceeds uint${bits}.`);
  return parsed;
};
const c = (value, name) => u(value, 120, name); // TON Coins is VarUInteger 16, <= 120 bits.
const policy = manifest.policy || {};
const sale = policy.saleTerms || {};
const settlementTerms = beginCell()
  .storeRef(walletLibraryCell)
  .storeCoins(c(sale.walletFundingNanoTon, 'walletFundingNanoTon'))
  .storeCoins(c(sale.mintMessageValueNanoTon, 'mintMessageValueNanoTon'))
  .storeCoins(c(sale.refundGasReserveNanoTon, 'refundGasReserveNanoTon'))
  .endCell();
const saleTerms = beginCell()
  .storeAddress(Address.parse(sale.jettonMinter))
  .storeCoins(c(sale.priceNanoTonPerSaleUnit, 'priceNanoTonPerSaleUnit'))
  .storeUint(u(sale.totalSaleUnits, 64, 'totalSaleUnits'), 64)
  .storeCoins(c(sale.rawJettonPerSaleUnit, 'rawJettonPerSaleUnit'))
  .storeCoins(c(sale.identityCapNanoTon, 'identityCapNanoTon'))
  .storeRef(settlementTerms)
  .endCell();
const policyCell = beginCell()
  .storeUint(u(policy.appDomainHash, 256, 'appDomainHash'), 256)
  .storeUint(u(policy.issuerKeyHash, 256, 'issuerKeyHash'), 256)
  .storeUint(u(policy.launchIdHash, 256, 'launchIdHash'), 256)
  .storeUint(u(policy.maxTokenAgeSec, 32, 'maxTokenAgeSec'), 32)
  .storeUint(u(policy.maxClockSkewSec, 32, 'maxClockSkewSec'), 32)
  .storeUint(u(policy.maxAuthorizationTtlSec, 32, 'maxAuthorizationTtlSec'), 32)
  .storeBit(policy.requirePremium === true)
  .storeRef(saleTerms)
  .endCell();
const settlement = beginCell().storeDict(null).storeDict(null).endCell();
const accounting = beginCell()
  .storeUint(0, 64)
  .storeUint(0, 64)
  .storeCoins(0n)
  .storeCoins(0n)
  .storeDict(null)
  .storeDict(null)
  .storeDict(null)
  .storeRef(settlement)
  .endCell();
const data = beginCell().storeRef(policyCell).storeRef(accounting).endCell();
const result = {
  schemaVersion: 1,
  launchpadCodeCellHash: codeCellHash,
  settlementMinterCodeCellHash: minterArtifact.codeCellHash,
  settlementMinterWalletLibraryCellHash: walletLibraryCellHash,
  initialDataCellHash: data.hash().toString('hex'),
  initialDataBocBase64: data.toBoc().toString('base64'),
  policyCellHash: policyCell.hash().toString('hex'),
  saleTermsCellHash: saleTerms.hash().toString('hex'),
  settlementTermsCellHash: settlementTerms.hash().toString('hex'),
};
if (manifest.initialDataCellHash && manifest.initialDataCellHash !== result.initialDataCellHash) throw new Error('Manifest initialDataCellHash does not match its serialized StateInit data.');
console.log(JSON.stringify(result, null, 2));
