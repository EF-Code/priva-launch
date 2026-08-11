import { requireLiveDeployment, requireTestnetDeployment } from './deployment-config.js';

function requireText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required.`);
}

function validatePurchaseRequest(request, manifest) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('Purchase authorization request must be an object.');
  for (const field of ['initData', 'launchId', 'launchpadAddress', 'recipientAddress', 'clientNonce']) requireText(field, request[field]);
  if (request.launchpadAddress !== manifest.launchpadAddress) throw new Error('Authorization launchpad does not match the reviewed manifest.');
  if (request.operation !== 'BUY') throw new Error('Only the BUY operation is supported.');
  if (request.circuitVersion !== 1 && request.circuitVersion !== 'priva_purchase_auth/v1') throw new Error('Unsupported purchase circuit version.');
}

function validatePurchaseResponse(response, request) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Gateway returned an invalid authorization envelope.');
  for (const field of ['proof', 'publicInputs']) requireText(`response.${field}`, response[field]);
  if (response.launchId !== request.launchId) throw new Error('Gateway proof launch ID does not match the request.');
  if (response.recipientAddress !== request.recipientAddress) throw new Error('Gateway proof recipient does not match the request.');
  if (response.circuitVersion !== 1 && response.circuitVersion !== 'priva_purchase_auth/v1') throw new Error('Gateway proof circuit version is not pinned.');
  const expiryEpoch = Number(response.expiryEpoch);
  if (!Number.isSafeInteger(expiryEpoch) || expiryEpoch <= Math.floor(Date.now() / 1000)) throw new Error('Gateway proof is missing a future expiry.');
  return Object.freeze({ ...response, expiryEpoch });
}

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
    return validatePurchaseResponse(await response.json(), request);
  }

  /**
   * Testnet-only authorization transport. This sends no wallet transaction;
   * callers must still render the resulting bound fields for user review and
   * wait for an independently-indexed chain confirmation after broadcast.
   */
  async requestTestnetPurchaseAuthorization(request, deployment) {
    const manifest = requireTestnetDeployment(deployment);
    if (this.endpoint !== manifest.gatewayUrl.replace(/\/$/, '')) throw new Error('Gateway endpoint does not match the reviewed testnet manifest.');
    validatePurchaseRequest(request, manifest);
    const response = await this.fetchImpl(`${this.endpoint}/v1/purchase-authorizations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`Testnet gateway authorization failed (${response.status}).`);
    return validatePurchaseResponse(await response.json(), request);
  }
}
