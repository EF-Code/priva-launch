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
  for (const field of ['version', 'launchpadAddress', 'jettonMinterAddress', 'gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl', 'metadataUrl']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') throw new Error(`Missing ${field}.`);
  }
  for (const field of ['launchpadAddress', 'jettonMinterAddress']) if (!tonAddress.test(manifest[field])) throw new Error(`${field} must be a friendly TON address.`);
  if (!revision.test(manifest.sourceRevision || '')) throw new Error('sourceRevision must be a full Git SHA.');
  for (const field of ['gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl', 'metadataUrl']) if (!manifest[field].startsWith('https://')) throw new Error(`${field} must use HTTPS.`);
  if (!manifest.codeHashes || typeof manifest.codeHashes !== 'object' || Object.keys(manifest.codeHashes).length === 0) throw new Error('codeHashes must be non-empty.');
  for (const [name, value] of Object.entries(manifest.codeHashes)) if (!sha256.test(value)) throw new Error(`Invalid code hash for ${name}.`);
  if (!sha256.test(manifest.codeHashes.launchpad || '')) throw new Error('codeHashes.launchpad must pin the deployed launchpad code hash.');
  validateVerifier(manifest.verifier, manifest.codeHashes.launchpad);
  if (!manifest.circuit || manifest.circuit.version !== 1 || !sha256.test(manifest.circuit.verificationKeyHash || '')) throw new Error('Circuit must pin v1 verificationKeyHash.');
  validateDex(manifest.dex);
  return Object.freeze({ ...manifest });
}

/**
 * A fixed-price testnet sale is intentionally allowed to ship without a DEX
 * migration target. This is an explicit policy choice, not a missing field:
 * the launchpad must not claim graduated trading or send value to an
 * unverified adapter. DeDust remains supported only when every downstream
 * address, hash, and source revision is present.
 */
function validateDex(dex) {
  if (!dex || typeof dex !== 'object' || Array.isArray(dex)) throw new Error('Missing DEX descriptor.');
  if (dex.kind === 'none') {
    for (const field of Object.keys(dex)) if (!['kind', 'migration', 'reason'].includes(field)) throw new Error(`No-DEX profile cannot declare ${field}.`);
    if (dex.migration !== 'disabled') throw new Error('A no-DEX testnet profile must set migration to disabled.');
    if (dex.reason !== 'fixed-price-testnet-sale') throw new Error('A no-DEX testnet profile must use reason fixed-price-testnet-sale.');
    return;
  }
  if (dex.kind !== 'dedust-v2' || !revision.test(dex.sourceRevision || '')) throw new Error('DEX must pin DeDust v2 and its source revision.');
  for (const field of ['nativeVaultAddress', 'jettonVaultAddress', 'poolAddress']) {
    if (typeof dex[field] !== 'string' || dex[field].trim() === '') throw new Error(`DEX is missing ${field}.`);
    if (!tonAddress.test(dex[field])) throw new Error(`DEX ${field} must be a friendly TON address.`);
  }
  if (!dex.codeHashes || typeof dex.codeHashes !== 'object' || Object.keys(dex.codeHashes).length === 0) throw new Error('DEX codeHashes must be non-empty.');
  for (const [name, value] of Object.entries(dex.codeHashes)) if (!sha256.test(value)) throw new Error(`Invalid DEX SHA-256 code hash for ${name}.`);
}

/**
 * The current launchpad composes the verifier core directly into its code.
 * A standalone verifier address is only valid when a separately deployed
 * authorizer contract is actually used by the launchpad; a proof-checking
 * boundary candidate must never be presented as that authorizer.
 */
function validateVerifier(verifier, launchpadCodeHash) {
  if (!verifier || typeof verifier !== 'object' || Array.isArray(verifier)) throw new Error('Missing verifier descriptor.');
  if (verifier.mode === 'inlined') {
    if (!sha256.test(verifier.sourceSha256 || '')) throw new Error('Inlined verifier sourceSha256 must be a SHA-256 digest.');
    if (!sha256.test(verifier.launchpadCodeHash || '')) throw new Error('Inlined verifier launchpadCodeHash must be a SHA-256 digest.');
    if (verifier.launchpadCodeHash !== launchpadCodeHash) throw new Error('Inlined verifier launchpadCodeHash must equal codeHashes.launchpad.');
    if ('address' in verifier) throw new Error('An inlined verifier must not declare a verifier address.');
    return;
  }
  if (verifier.mode === 'standalone') {
    if (!tonAddress.test(verifier.address || '')) throw new Error('Standalone verifier address must be a friendly TON address.');
    if (!sha256.test(verifier.codeHash || '')) throw new Error('Standalone verifier codeHash must be a SHA-256 digest.');
    return;
  }
  throw new Error('Verifier mode must be "inlined" or "standalone".');
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

module.exports = { validateTestnetManifest, readManifest, validateVerifier, validateDex };
