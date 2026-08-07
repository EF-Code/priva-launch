/**
 * Priva - demo wallet selection state
 *
 * This module does not use TonConnect, access a wallet, request signatures, or
 * submit transactions. It must not be used as a transaction adapter.
 */

export class TonWalletManager {
  constructor() {
    this.isConnected = false;
    this.walletAddress = null;
    this.walletName = null;
    this.listeners = new Set();
  }

  /**
   * Select a cosmetic demo wallet for UI exploration.
   * @returns {Promise<{address: string, walletName: string}>}
   */
  async connectWallet(walletType = 'Tonkeeper') {
    const address = `demo-${walletType.toLowerCase()}-local-only`;
    this.isConnected = true;
    this.walletAddress = address;
    this.walletName = walletType;
    this.notifyListeners();

    return { address, walletName: walletType };
  }

  disconnect() {
    this.isConnected = false;
    this.walletAddress = null;
    this.walletName = null;
    this.notifyListeners();
  }

  async sendTransaction() {
    throw new Error('Transaction submission is disabled: Priva is a demo-only prototype.');
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      listener({
        isConnected: this.isConnected,
        address: this.walletAddress,
        walletName: this.walletName
      });
    }
  }
}

export const tonWallet = new TonWalletManager();
