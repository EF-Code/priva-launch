const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha256 = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const candidate = process.argv[2];
if (!candidate) throw new Error('Usage: npm run check:testnet-manifest -- deployment/testnet/reviewed-manifest.json');
const root = path.resolve(__dirname, '..');
const manifestPath = path.resolve(root, candidate);
if (!manifestPath.startsWith(`${root}${path.sep}`)) throw new Error('Manifest path must stay within the repository.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.network !== 'testnet') throw new Error('Manifest network must be testnet.');
for (const field of ['version', 'launchpadAddress', 'verifierAddress', 'gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl']) {
  if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') throw new Error(`Missing ${field}.`);
}
if (!revision.test(manifest.sourceRevision || '')) throw new Error('sourceRevision must be a full Git SHA.');
for (const field of ['gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl']) if (!manifest[field].startsWith('https://')) throw new Error(`${field} must use HTTPS.`);
if (!manifest.codeHashes || typeof manifest.codeHashes !== 'object' || Object.keys(manifest.codeHashes).length === 0) throw new Error('codeHashes must be non-empty.');
for (const [name, value] of Object.entries(manifest.codeHashes)) if (!sha256.test(value)) throw new Error(`Invalid code hash for ${name}.`);
if (!manifest.circuit || manifest.circuit.version !== 1 || !sha256.test(manifest.circuit.verificationKeyHash || '')) throw new Error('Circuit must pin v1 verificationKeyHash.');
const digest = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
console.log(`✓ Testnet manifest is structurally valid (${digest})`);
