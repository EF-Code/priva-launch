/**
 * Priva - demo identity state
 *
 * This module deliberately does not authenticate Telegram users, generate a
 * zero-knowledge proof, or provide Sybil resistance. It exists only to let the
 * interface demonstrate a future identity-gated flow without implying proof.
 */

export class PrivaDemoIdentity {
  constructor() {
    this.isDemoIdentityActive = false;
    this.demoIdentity = null;
  }

  /**
   * Enable an in-memory identity for UI exploration only.
   * @returns {Promise<{isDemoActive: boolean, demoIdentity: string}>}
   */
  async enableDemoIdentity() {
    this.isDemoIdentityActive = true;
    this.demoIdentity = 'demo-identity-local-only';

    return {
      isDemoActive: true,
      demoIdentity: this.demoIdentity
    };
  }

  /**
   * Apply the UI's illustrative buy cap. This is not an on-chain control.
   * @param {number} requestedTonAmount
   * @returns {boolean}
   */
  canSimulateBuyAmount(requestedTonAmount) {
    if (!this.isDemoIdentityActive) return false;
    return requestedTonAmount <= 50;
  }
}

export const zkAuth = new PrivaDemoIdentity();
