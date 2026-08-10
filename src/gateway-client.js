import { requireLiveDeployment } from './deployment-config.js';

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
}
