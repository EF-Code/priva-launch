import { requireLiveDeployment, requireTestnetDeployment } from './deployment-config.js';

/**
 * Builds the narrowly scoped proof request a live client may send to the
 * configured issuer gateway. It is unused in demo mode by design.
 */
export class PrivaGatewayClient {
  constructor({ endpoint, fetchImpl = fetch } = {}) {
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      throw new TypeError('A pinned HTTPS gateway endpoint is required.');
    }
    this.endpoint = endpoint.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async requestPurchaseAuthorization(request, deployment) {
    requireLiveDeployment(deployment);
    const response = await this.fetchImpl(`${this.endpoint}/v1/purchase-authorizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`Gateway authorization failed (${response.status}).`);
    return response.json();
  }

  /**
   * Testnet-only authorization transport. This sends no wallet transaction;
   * callers must still render the resulting bound fields for user review and
   * wait for an independently-indexed chain confirmation after broadcast.
   */
  async requestTestnetPurchaseAuthorization(request, deployment) {
    const manifest = requireTestnetDeployment(deployment);
    if (this.endpoint !== manifest.gatewayUrl.replace(/\/$/, '')) throw new Error('Gateway endpoint does not match the reviewed testnet manifest.');
    if (!request || typeof request !== 'object' || typeof request.recipient !== 'string' || typeof request.launchId !== 'string') {
      throw new TypeError('Testnet authorization requires a launchId and recipient.');
    }
    const response = await this.fetchImpl(`${this.endpoint}/v1/purchase-authorizations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`Testnet gateway authorization failed (${response.status}).`);
    return response.json();
  }
}
