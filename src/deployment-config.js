/**
 * Deployment capability gate.
 *
 * The frontend remains demo-only until a reviewed deployment manifest is
 * supplied at build time. This module intentionally contains no addresses or
 * fallback endpoint: an empty configuration must disable live interaction.
 */
const demoDeploymentConfig = Object.freeze({
  mode: 'demo',
  network: 'testnet',
  manifestVersion: null,
  sourceRevision: null,
  launchpadAddress: null,
  verifierAddress: null,
  gatewayUrl: null,
  indexerUrl: null,
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
  for (const field of ['version', 'launchpadAddress', 'verifierAddress', 'gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') throw new Error(`Deployment manifest is missing ${field}.`);
  }
  for (const field of ['launchpadAddress', 'verifierAddress']) if (!tonAddress.test(manifest[field])) throw new Error(`Deployment manifest ${field} must be a friendly TON address.`);
  for (const endpoint of ['gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl']) {
    let url;
    try { url = new URL(manifest[endpoint]); } catch { throw new Error(`Deployment manifest ${endpoint} must be an HTTPS URL.`); }
    if (url.protocol !== 'https:') throw new Error(`Deployment manifest ${endpoint} must be an HTTPS URL.`);
  }
  if (!manifest.codeHashes || typeof manifest.codeHashes !== 'object' || Array.isArray(manifest.codeHashes) || Object.keys(manifest.codeHashes).length === 0) throw new Error('Deployment manifest must pin non-empty codeHashes.');
  for (const [name, digest] of Object.entries(manifest.codeHashes)) if (!sha256.test(digest)) throw new Error(`Invalid SHA-256 code hash for ${name}.`);
  if (!manifest.circuit || manifest.circuit.version !== 1 || !sha256.test(manifest.circuit.verificationKeyHash || '')) throw new Error('Deployment manifest must pin the version-1 verification key hash.');
  if (!manifest.dex || manifest.dex.kind !== 'dedust-v2' || !/^[a-f0-9]{40}$/.test(manifest.dex.sourceRevision || '')) throw new Error('Deployment manifest must pin the reviewed DeDust v2 source revision.');
  for (const field of ['nativeVaultAddress', 'jettonVaultAddress', 'poolAddress']) {
    if (typeof manifest.dex[field] !== 'string' || manifest.dex[field].trim() === '') throw new Error(`Deployment manifest DEX is missing ${field}.`);
    if (!tonAddress.test(manifest.dex[field])) throw new Error(`Deployment manifest DEX ${field} must be a friendly TON address.`);
  }
  if (!manifest.dex.codeHashes || typeof manifest.dex.codeHashes !== 'object' || Object.keys(manifest.dex.codeHashes).length === 0) throw new Error('Deployment manifest DEX must pin code hashes.');
  for (const [name, digest] of Object.entries(manifest.dex.codeHashes)) if (!sha256.test(digest)) throw new Error(`Invalid DEX SHA-256 code hash for ${name}.`);
  return Object.freeze({ mode: 'testnet', ...manifest });
}

function loadRuntimeDeployment() {
  // The host must inject this object at build/deploy time. There is no URL,
  // query-string, local-storage, or user-entered fallback that can enable it.
  const candidate = typeof globalThis !== 'undefined' ? globalThis.__PRIVA_TESTNET_MANIFEST__ : null;
  if (candidate == null) return demoDeploymentConfig;
  try {
    return parseTestnetManifest(candidate);
  } catch (error) {
    return Object.freeze({ ...demoDeploymentConfig, manifestError: error instanceof Error ? error.message : String(error) });
  }
}

export const deploymentConfig = loadRuntimeDeployment();

export function getDeploymentStatus(config = deploymentConfig) {
  if (config.manifestError) return { enabled: false, label: 'Manifest rejected; read-only mode' };
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
    typeof config.verifierAddress === 'string' &&
    typeof config.jettonMasterCodeHash === 'string' &&
    typeof config.tonConnectManifestUrl === 'string';
}

export function requireLiveDeployment(config = deploymentConfig) {
  if (!isLiveDeploymentReady(config)) {
    throw new Error('Live wallet interaction is disabled until a reviewed deployment manifest is configured.');
  }
  return config;
}
