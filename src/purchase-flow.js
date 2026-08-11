import { requireTestnetDeployment } from './deployment-config.js';
import { PrivaGatewayClient } from './gateway-client.js';
import { buildTestnetBuyTransaction } from './ton-transaction.js';

const decimal = /^(0|[1-9][0-9]*)$/;
const MAX_COINS = 1n << 120n;
// `clientNonce` is a public circuit field, not an arbitrary 256-bit blob.
// Keep the browser-generated value canonical so the gateway does not have to
// reduce or reinterpret a nonce after it has been bound into the proof.
const BLS12_381_SCALAR_FIELD = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;

function requireText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required.`);
  return value.trim();
}

function requireRawText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required.`);
  return value;
}

function decimalBigInt(name, value, { nonZero = false } = {}) {
  const text = requireText(name, value);
  if (!decimal.test(text) || (nonZero && text === '0')) throw new TypeError(`${name} must be a canonical decimal string.`);
  const result = BigInt(text);
  if (result >= MAX_COINS) throw new RangeError(`${name} exceeds the TON coin limit.`);
  return result;
}

function unitsBigInt(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new TypeError('saleUnits must be an integer.');
  return decimalBigInt('saleUnits', String(value), { nonZero: true });
}

/** Generate a 32-byte request nonce; there is no insecure fallback. */
export function createClientNonce(randomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)) {
  if (typeof randomValues !== 'function') throw new Error('Secure browser randomness is required for a purchase nonce.');
  for (;;) {
    const bytes = new Uint8Array(32);
    randomValues(bytes);
    const value = BigInt(`0x${Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('')}`);
    if (value > 0n && value < BLS12_381_SCALAR_FIELD) return value.toString(16).padStart(64, '0');
  }
}

export function calculatePurchaseValue({ launch, saleUnits }) {
  if (!launch || typeof launch !== 'object' || Array.isArray(launch)) throw new TypeError('A reviewed launch record is required.');
  const units = unitsBigInt(saleUnits);
  const remaining = decimalBigInt('launch.remainingSaleUnits', launch.remainingSaleUnits);
  if (units > remaining) throw new RangeError('Requested sale units exceed the indexed remaining supply.');
  const price = decimalBigInt('launch.priceNanoTonPerSaleUnit', launch.priceNanoTonPerSaleUnit, { nonZero: true });
  const reserve = decimalBigInt('launch.refundGasReserveNanoTon', launch.refundGasReserveNanoTon, { nonZero: true });
  const minimum = decimalBigInt('launch.mintMessageValueNanoTon', launch.mintMessageValueNanoTon, { nonZero: true });
  const maxValue = price * units;
  if (maxValue >= MAX_COINS || maxValue < minimum) throw new RangeError('Requested value is outside the reviewed sale bounds.');
  const value = maxValue + reserve;
  if (value >= MAX_COINS) throw new RangeError('Requested transaction value exceeds the TON coin limit.');
  return Object.freeze({ units, maxValue, reserve, value });
}

/**
 * Request a gateway proof and build the exact one-message transaction. This
 * function never calls TonConnect; the caller must present the returned
 * transaction for a second, explicit wallet approval.
 */
export async function prepareTestnetPurchase({
  deployment,
  launch,
  saleUnits,
  recipientAddress,
  initData,
  gatewayClient = null,
  clientNonce = null,
  nowEpoch = Math.floor(Date.now() / 1000),
}) {
  const manifest = requireTestnetDeployment(deployment);
  if (!launch || launch.launchpadAddress !== manifest.launchpadAddress) throw new Error('Indexed launch does not match the reviewed launchpad.');
  const recipient = requireText('recipientAddress', recipientAddress);
  const signedInitData = requireRawText('initData', initData);
  const nonce = clientNonce == null ? createClientNonce() : requireText('clientNonce', clientNonce);
  if (!/^[a-f0-9]{64}$/.test(nonce)) throw new TypeError('clientNonce must be a 32-byte lowercase hexadecimal value.');
  const quote = calculatePurchaseValue({ launch, saleUnits });
  const request = Object.freeze({
    initData: signedInitData,
    launchId: requireText('launch.id', launch.id),
    launchpadAddress: manifest.launchpadAddress,
    recipientAddress: recipient,
    operation: 'BUY',
    clientNonce: nonce,
    circuitVersion: 1,
  });
  const client = gatewayClient || new PrivaGatewayClient({ endpoint: manifest.gatewayUrl });
  const authorization = await client.requestTestnetPurchaseAuthorization(request, manifest);
  const expiryEpoch = Number(authorization.expiryEpoch);
  if (!Number.isSafeInteger(expiryEpoch) || expiryEpoch <= nowEpoch) throw new Error('Gateway authorization has expired.');
  const validUntil = Math.min(expiryEpoch, nowEpoch + 300);
  const queryId = BigInt(`0x${nonce.slice(0, 16)}`);
  const transaction = buildTestnetBuyTransaction({
    deployment: manifest,
    queryId,
    maxValue: quote.maxValue,
    recipient,
    proof: authorization.proof,
    publicInputs: authorization.publicInputs,
    value: quote.value,
    validUntil,
  });
  return Object.freeze({ request, authorization, transaction, queryId, saleUnits: quote.units, maxValue: quote.maxValue, value: quote.value });
}
