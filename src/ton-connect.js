import { requireTestnetDeployment } from './deployment-config.js';

/**
 * Lazily creates the TonConnect UI only after a reviewed testnet manifest has
 * been loaded. The dynamic import keeps demo builds free of wallet side
 * effects and makes a missing manifest fail closed.
 */
export async function createTestnetTonConnect(deployment) {
  const manifest = requireTestnetDeployment(deployment);
  if (typeof window === 'undefined') throw new Error('TonConnect is only available in a browser.');
  const { TonConnectUI } = await import('@tonconnect/ui');
  const ui = new TonConnectUI({ manifestUrl: manifest.tonConnectManifestUrl });

  return Object.freeze({
    openModal: () => ui.openModal(),
    closeModal: () => ui.closeModal(),
    disconnect: () => ui.disconnect(),
    sendTransaction: (transaction) => ui.sendTransaction(transaction),
    get wallet() { return ui.wallet; },
    onStatusChange: (listener) => ui.onStatusChange(listener),
  });
}
