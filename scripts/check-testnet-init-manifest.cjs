const fs = require('fs');
const path = require('path');

const candidate = process.argv[2];
if (!candidate) throw new Error('Usage: npm run check:testnet-init -- deployment/testnet/reviewed-init.json');
const root = path.resolve(__dirname, '..');
const file = path.resolve(root, candidate);
if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Initialization manifest path must stay within the repository.');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const decimal = /^(0|[1-9][0-9]*)$/;
const sha256 = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const tonAddress = /^(?:[EU]Q|kQ)[A-Za-z0-9_-]{46}$/;

function requireString(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing ${name}.`);
}
function requireDecimal(name, value, { nonZero = false } = {}) {
  if (typeof value !== 'string' || !decimal.test(value) || (nonZero && value === '0')) throw new Error(`${name} must be a canonical${nonZero ? ' non-zero' : ''} decimal string.`);
}

if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Initialization manifest must be an object.');
if (manifest.network !== 'testnet') throw new Error('Initialization manifest network must be testnet.');
if (manifest.status !== 'reviewed') throw new Error('Initialization manifest must have status "reviewed".');
if (!revision.test(manifest.sourceRevision || '')) throw new Error('sourceRevision must be a full Git SHA.');
if (!sha256.test(manifest.launchpadCodeSha256 || '')) throw new Error('launchpadCodeSha256 must be a SHA-256 digest.');
if (!sha256.test(manifest.initialDataCellHash || '')) throw new Error('initialDataCellHash must be a TON cell hash digest.');
if (!manifest.circuit || manifest.circuit.version !== 1 || !sha256.test(manifest.circuit.verificationKeySha256 || '')) throw new Error('Circuit must pin version 1 and its verification-key SHA-256.');
if (!manifest.review || !Array.isArray(manifest.review.approvals) || manifest.review.approvals.length < 2) throw new Error('At least two independent public review approvals are required.');
for (const approval of manifest.review.approvals) {
  requireString('review.approvals[].reviewer', approval?.reviewer);
  requireString('review.approvals[].evidenceUrl', approval?.evidenceUrl);
  if (!approval.evidenceUrl.startsWith('https://')) throw new Error('Review evidence URLs must use HTTPS.');
}
const policy = manifest.policy;
if (!policy || typeof policy !== 'object') throw new Error('Missing policy.');
for (const name of ['appDomainHash', 'issuerKeyHash', 'launchIdHash']) requireDecimal(`policy.${name}`, policy[name], { nonZero: true });
for (const name of ['maxTokenAgeSec', 'maxClockSkewSec', 'maxAuthorizationTtlSec']) requireDecimal(`policy.${name}`, policy[name], { nonZero: true });
if (typeof policy.requirePremium !== 'boolean') throw new Error('policy.requirePremium must be boolean.');
const sale = policy.saleTerms;
if (!sale || typeof sale !== 'object') throw new Error('Missing policy.saleTerms.');
if (!tonAddress.test(sale.jettonMinter || '')) throw new Error('policy.saleTerms.jettonMinter must be a friendly TON address.');
for (const name of ['priceNanoTonPerSaleUnit', 'totalSaleUnits', 'rawJettonPerSaleUnit', 'identityCapNanoTon', 'walletFundingNanoTon', 'mintMessageValueNanoTon']) requireDecimal(`policy.saleTerms.${name}`, sale[name], { nonZero: true });
if (BigInt(sale.mintMessageValueNanoTon) < BigInt(sale.walletFundingNanoTon)) throw new Error('mintMessageValueNanoTon must cover walletFundingNanoTon.');

console.log('✓ Reviewed testnet initialization manifest is structurally valid');
