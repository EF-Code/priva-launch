import { deploymentConfig, requireTestnetDeployment } from './deployment-config.js';
import { buildTestnetBuyTransaction } from './ton-transaction.js';

/**
 * Wallet boundary for Priva.
 *
 * The default instance stays in demo mode. A real connector can only be used
 * when a reviewed testnet manifest is supplied and the connector was created
 * from that manifest's pinned TonConnect URL.
 */
export class TonWalletManager {
  constructor({ deployment = deploymentConfig, connector = null } = {}) {
    this.deployment = deployment;
    this.connector = null;
    this.unsubscribeConnector = null;
    this.isConnected = false;
    this.walletAddress = null;
    this.walletName = null;
    this.listeners = new Set();
    if (connector) this.setConnector(connector);
  }

  setDeployment(deployment) {
    this.deployment = deployment;
    if (deployment?.mode !== 'testnet') this.disconnect();
  }

  setConnector(connector) {
    if (!connector || typeof connector.openModal !== 'function' || typeof connector.sendTransaction !== 'function') {
      throw new TypeError('A TonConnect connector with openModal and sendTransaction is required.');
    }
    this.unsubscribeConnector?.();
    this.connector = connector;
    this.unsubscribeConnector = typeof connector.onStatusChange === 'function'
      ? connector.onStatusChange((wallet) => this.applyWallet(wallet))
      : null;
    this.applyWallet(connector.wallet);
  }

  async connectWallet(walletType = 'Tonkeeper') {
    if (this.deployment?.mode !== 'testnet') {
      // Demo-only behavior is retained for design previews, but the returned
      // address is deliberately unusable and never reaches a transaction.
      const address = `demo-${walletType.toLowerCase()}-local-only`;
      this.applyWallet({ account: { address }, device: { appName: walletType } });
      return { address, walletName: walletType, demo: true };
    }
    requireTestnetDeployment(this.deployment);
    if (!this.connector) throw new Error('TonConnect is unavailable until a reviewed testnet connector is configured.');
    await this.connector.openModal();
    this.applyWallet(this.connector.wallet);
    if (!this.walletAddress) throw new Error('Wallet connection was not established.');
    return { address: this.walletAddress, walletName: this.walletName, demo: false };
  }

  disconnect() {
    if (this.deployment?.mode === 'testnet') this.connector?.disconnect?.();
    this.applyWallet(null);
  }

  async sendTestnetBuy(params) {
    const transaction = buildTestnetBuyTransaction({ deployment: this.deployment, ...params });
    return this.sendTransaction(transaction);
  }

  async sendTransaction(transaction) {
    requireTestnetDeployment(this.deployment);
    if (!this.connector) throw new Error('TonConnect is unavailable until a reviewed testnet connector is configured.');
    if (!this.walletAddress) throw new Error('Connect a testnet wallet before requesting a transaction.');
    if (!transaction || transaction.network !== '-3' || !Array.isArray(transaction.messages) || transaction.messages.length !== 1) {
      throw new Error('Only one canonical Priva testnet transaction may be submitted.');
    }
    const [message] = transaction.messages;
    if (message.address !== this.deployment.launchpadAddress) {
      throw new Error('Transaction destination does not match the reviewed launchpad.');
    }
    const result = await this.connector.sendTransaction(transaction);
    return Object.freeze({ result, status: 'submitted', address: this.walletAddress });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  applyWallet(wallet) {
    this.isConnected = Boolean(wallet?.account?.address);
    this.walletAddress = wallet?.account?.address || null;
    this.walletName = wallet?.device?.appName || wallet?.name || null;
    this.notifyListeners();
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      listener({
        isConnected: this.isConnected,
        address: this.walletAddress,
        walletName: this.walletName,
      });
    }
  }
}

export const tonWallet = new TonWalletManager();
