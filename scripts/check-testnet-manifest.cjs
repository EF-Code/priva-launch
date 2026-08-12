const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha256 = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const tonAddress = /^(?:EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/;
const root = path.resolve(__dirname, '..');

function validateTestnetManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Manifest must be an object.');
  if (manifest.network !== 'testnet') throw new Error('Manifest network must be testnet.');
  if (manifest.status !== 'reviewed') throw new Error('Manifest status must be reviewed.');
  for (const field of ['version', 'launchpadAddress', 'verifierAddress', 'jettonMinterAddress', 'gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl', 'metadataUrl']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') throw new Error(`Missing ${field}.`);
  }
  for (const field of ['launchpadAddress', 'verifierAddress', 'jettonMinterAddress']) if (!tonAddress.test(manifest[field])) throw new Error(`${field} must be a friendly TON address.`);
  if (!revision.test(manifest.sourceRevision || '')) throw new Error('sourceRevision must be a full Git SHA.');
  for (const field of ['gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl', 'metadataUrl']) if (!manifest[field].startsWith('https://')) throw new Error(`${field} must use HTTPS.`);
  if (!manifest.codeHashes || typeof manifest.codeHashes !== 'object' || Object.keys(manifest.codeHashes).length === 0) throw new Error('codeHashes must be non-empty.');
  for (const [name, value] of Object.entries(manifest.codeHashes)) if (!sha256.test(value)) throw new Error(`Invalid code hash for ${name}.`);
  if (!manifest.circuit || manifest.circuit.version !== 1 || !sha256.test(manifest.circuit.verificationKeyHash || '')) throw new Error('Circuit must pin v1 verificationKeyHash.');
  if (!manifest.dex || manifest.dex.kind !== 'dedust-v2' || !revision.test(manifest.dex.sourceRevision || '')) throw new Error('DEX must pin DeDust v2 and its source revision.');
  for (const field of ['nativeVaultAddress', 'jettonVaultAddress', 'poolAddress']) {
    if (typeof manifest.dex[field] !== 'string' || manifest.dex[field].trim() === '') throw new Error(`DEX is missing ${field}.`);
    if (!tonAddress.test(manifest.dex[field])) throw new Error(`DEX ${field} must be a friendly TON address.`);
  }
  if (!manifest.dex.codeHashes || typeof manifest.dex.codeHashes !== 'object' || Object.keys(manifest.dex.codeHashes).length === 0) throw new Error('DEX codeHashes must be non-empty.');
  for (const [name, value] of Object.entries(manifest.dex.codeHashes)) if (!sha256.test(value)) throw new Error(`Invalid DEX SHA-256 code hash for ${name}.`);
  return Object.freeze({ ...manifest });
}

function readManifest(candidate) {
  const manifestPath = path.resolve(root, candidate);
  if (!manifestPath.startsWith(`${root}${path.sep}`)) throw new Error('Manifest path must stay within the repository.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return { manifest: validateTestnetManifest(manifest), manifestPath };
}

if (require.main === module) {
  const candidate = process.argv[2];
  if (!candidate) throw new Error('Usage: npm run check:testnet-manifest -- deployment/testnet/reviewed-manifest.json');
  const { manifestPath } = readManifest(candidate);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  console.log(`✓ Testnet manifest is structurally valid (${digest})`);
}

module.exports = { validateTestnetManifest, readManifest };
