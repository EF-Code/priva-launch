/**
 * Deployment capability gate.
 *
 * The frontend remains unconfigured until a reviewed deployment manifest is
 * supplied at build time. This module intentionally contains no addresses or
 * fallback endpoint: an empty configuration must disable live interaction.
 */
const unconfiguredDeploymentConfig = Object.freeze({
  mode: 'unconfigured',
  network: 'testnet',
  manifestVersion: null,
  sourceRevision: null,
  launchpadAddress: null,
  verifier: null,
  jettonMinterAddress: null,
  gatewayUrl: null,
  indexerUrl: null,
  metadataUrl: null,
  jettonMasterCodeHash: null,
  tonConnectManifestUrl: null,
  manifestError: null,
});

const sha256 = /^[a-f0-9]{64}$/;
const revision = /^[a-f0-9]{40}$/;
const tonAddress = /^(?:EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/;

/** Validates immutable inputs for a testnet-only interface build. */
export function parseTestnetManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('Deployment manifest must be an object.');
  if (manifest.network !== 'testnet') throw new Error('Only a reviewed testnet manifest may enable this interface.');
  if (manifest.status !== 'reviewed') throw new Error('Deployment manifest must have status "reviewed".');
  if (!revision.test(manifest.sourceRevision || '')) throw new Error('Deployment manifest sourceRevision must be a full Git SHA.');
  for (const field of ['version', 'launchpadAddress', 'jettonMinterAddress', 'gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl', 'metadataUrl']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') throw new Error(`Deployment manifest is missing ${field}.`);
  }
  for (const field of ['launchpadAddress', 'jettonMinterAddress']) if (!tonAddress.test(manifest[field])) throw new Error(`Deployment manifest ${field} must be a friendly TON address.`);
  for (const endpoint of ['gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl', 'metadataUrl']) {
    let url;
    try { url = new URL(manifest[endpoint]); } catch { throw new Error(`Deployment manifest ${endpoint} must be an HTTPS URL.`); }
    if (url.protocol !== 'https:') throw new Error(`Deployment manifest ${endpoint} must be an HTTPS URL.`);
  }
  if (!manifest.codeHashes || typeof manifest.codeHashes !== 'object' || Array.isArray(manifest.codeHashes) || Object.keys(manifest.codeHashes).length === 0) throw new Error('Deployment manifest must pin non-empty codeHashes.');
  for (const [name, digest] of Object.entries(manifest.codeHashes)) if (!sha256.test(digest)) throw new Error(`Invalid SHA-256 code hash for ${name}.`);
  if (!sha256.test(manifest.codeHashes.launchpad || '')) throw new Error('Deployment manifest must pin codeHashes.launchpad.');
  validateVerifier(manifest.verifier, manifest.codeHashes.launchpad);
  if (!manifest.circuit || manifest.circuit.version !== 1 || !sha256.test(manifest.circuit.verificationKeyHash || '')) throw new Error('Deployment manifest must pin the version-1 verification key hash.');
  validateDex(manifest.dex);
  return Object.freeze({ mode: 'testnet', ...manifest });
}

function loadRuntimeDeployment() {
  // The host must inject this object at build/deploy time. There is no URL,
  // query-string, local-storage, or user-entered fallback that can enable it.
  const candidate = typeof globalThis !== 'undefined' ? globalThis.__PRIVA_TESTNET_MANIFEST__ : null;
  if (candidate == null) return unconfiguredDeploymentConfig;
  try {
    return parseTestnetManifest(candidate);
  } catch (error) {
    return Object.freeze({ ...unconfiguredDeploymentConfig, manifestError: error instanceof Error ? error.message : String(error) });
  }
}

export const deploymentConfig = loadRuntimeDeployment();

export function getDeploymentStatus(config = deploymentConfig) {
  if (config.manifestError) return { enabled: false, label: 'Manifest rejected; read-only mode' };
  if (config.mode === 'testnet' && config.dex?.kind === 'none') return { enabled: true, label: 'Reviewed fixed-price testnet manifest loaded' };
  return config.mode === 'testnet' ? { enabled: true, label: 'Reviewed testnet manifest loaded' } : { enabled: false, label: 'Manifest required' };
}

export function requireTestnetDeployment(config = deploymentConfig) {
  if (config.mode !== 'testnet') throw new Error('Testnet interaction is disabled until a reviewed testnet manifest is configured.');
  return config;
}

export function isLiveDeploymentReady(config = deploymentConfig) {
  return config.mode === 'live' &&
    typeof config.manifestVersion === 'string' &&
    typeof config.launchpadAddress === 'string' &&
    config.verifier &&
    typeof config.jettonMasterCodeHash === 'string' &&
    typeof config.tonConnectManifestUrl === 'string';
}

function validateVerifier(verifier, launchpadCodeHash) {
  if (!verifier || typeof verifier !== 'object' || Array.isArray(verifier)) throw new Error('Deployment manifest is missing verifier descriptor.');
  if (verifier.mode === 'inlined') {
    if (!sha256.test(verifier.sourceSha256 || '')) throw new Error('Deployment manifest inlined verifier sourceSha256 must be a SHA-256 digest.');
    if (!sha256.test(verifier.launchpadCodeHash || '')) throw new Error('Deployment manifest inlined verifier launchpadCodeHash must be a SHA-256 digest.');
    if (verifier.launchpadCodeHash !== launchpadCodeHash) throw new Error('Deployment manifest inlined verifier launchpadCodeHash must equal codeHashes.launchpad.');
    if ('address' in verifier) throw new Error('Deployment manifest inlined verifier must not declare an address.');
    return;
  }
  if (verifier.mode === 'standalone') {
    if (!tonAddress.test(verifier.address || '')) throw new Error('Deployment manifest standalone verifier address must be a friendly TON address.');
    if (!sha256.test(verifier.codeHash || '')) throw new Error('Deployment manifest standalone verifier codeHash must be a SHA-256 digest.');
    return;
  }
  throw new Error('Deployment manifest verifier mode must be "inlined" or "standalone".');
}

function validateDex(dex) {
  if (!dex || typeof dex !== 'object' || Array.isArray(dex)) throw new Error('Deployment manifest is missing DEX descriptor.');
  if (dex.kind === 'none') {
    for (const field of Object.keys(dex)) if (!['kind', 'migration', 'reason'].includes(field)) throw new Error(`Deployment manifest no-DEX profile cannot declare ${field}.`);
    if (dex.migration !== 'disabled') throw new Error('Deployment manifest no-DEX profile must set migration to disabled.');
    if (dex.reason !== 'fixed-price-testnet-sale') throw new Error('Deployment manifest no-DEX profile must use reason fixed-price-testnet-sale.');
    return;
  }
  if (dex.kind !== 'dedust-v2' || !revision.test(dex.sourceRevision || '')) throw new Error('Deployment manifest must pin the reviewed DeDust v2 source revision.');
  for (const field of ['nativeVaultAddress', 'jettonVaultAddress', 'poolAddress']) {
    if (typeof dex[field] !== 'string' || dex[field].trim() === '') throw new Error(`Deployment manifest DEX is missing ${field}.`);
    if (!tonAddress.test(dex[field])) throw new Error(`Deployment manifest DEX ${field} must be a friendly TON address.`);
  }
  if (!dex.codeHashes || typeof dex.codeHashes !== 'object' || Object.keys(dex.codeHashes).length === 0) throw new Error('Deployment manifest DEX must pin code hashes.');
  for (const [name, digest] of Object.entries(dex.codeHashes)) if (!sha256.test(digest)) throw new Error(`Invalid DEX SHA-256 code hash for ${name}.`);
}

export function requireLiveDeployment(config = deploymentConfig) {
  if (!isLiveDeploymentReady(config)) {
    throw new Error('Live wallet interaction is disabled until a reviewed deployment manifest is configured.');
  }
  return config;
}
