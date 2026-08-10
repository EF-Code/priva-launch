/**
 * Deployment capability gate.
 *
 * The frontend remains demo-only until a reviewed deployment manifest is
 * supplied at build time. This module intentionally contains no addresses or
 * fallback endpoint: an empty configuration must disable live interaction.
 */
export const deploymentConfig = Object.freeze({
  mode: 'demo',
  manifestVersion: null,
  launchpadAddress: null,
  verifierAddress: null,
  jettonMasterCodeHash: null,
  tonConnectManifestUrl: null
});

const sha256 = /^[a-f0-9]{64}$/;

/** Validates immutable inputs for a testnet-only interface build. */
export function parseTestnetManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('Deployment manifest must be an object.');
  if (manifest.network !== 'testnet') throw new Error('Only a reviewed testnet manifest may enable this interface.');
  for (const field of ['version', 'launchpadAddress', 'verifierAddress', 'gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl']) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') throw new Error(`Deployment manifest is missing ${field}.`);
  }
  for (const endpoint of ['gatewayUrl', 'indexerUrl', 'tonConnectManifestUrl']) {
    let url;
    try { url = new URL(manifest[endpoint]); } catch { throw new Error(`Deployment manifest ${endpoint} must be an HTTPS URL.`); }
    if (url.protocol !== 'https:') throw new Error(`Deployment manifest ${endpoint} must be an HTTPS URL.`);
  }
  if (!manifest.codeHashes || typeof manifest.codeHashes !== 'object' || Array.isArray(manifest.codeHashes) || Object.keys(manifest.codeHashes).length === 0) throw new Error('Deployment manifest must pin non-empty codeHashes.');
  for (const [name, digest] of Object.entries(manifest.codeHashes)) if (!sha256.test(digest)) throw new Error(`Invalid SHA-256 code hash for ${name}.`);
  if (!manifest.circuit || manifest.circuit.version !== 1 || !sha256.test(manifest.circuit.verificationKeyHash || '')) throw new Error('Deployment manifest must pin the version-1 verification key hash.');
  if (!manifest.dex || manifest.dex.kind !== 'dedust-v2' || !/^[a-f0-9]{40}$/.test(manifest.dex.sourceRevision || '')) throw new Error('Deployment manifest must pin the reviewed DeDust v2 source revision.');
  for (const field of ['nativeVaultAddress', 'jettonVaultAddress', 'poolAddress']) if (typeof manifest.dex[field] !== 'string' || manifest.dex[field].trim() === '') throw new Error(`Deployment manifest DEX is missing ${field}.`);
  if (!manifest.dex.codeHashes || typeof manifest.dex.codeHashes !== 'object' || Object.keys(manifest.dex.codeHashes).length === 0) throw new Error('Deployment manifest DEX must pin code hashes.');
  for (const [name, digest] of Object.entries(manifest.dex.codeHashes)) if (!sha256.test(digest)) throw new Error(`Invalid DEX SHA-256 code hash for ${name}.`);
  return Object.freeze({ mode: 'testnet', ...manifest });
}

export function getDeploymentStatus(config = deploymentConfig) {
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
