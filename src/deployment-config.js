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
