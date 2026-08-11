import { Address, beginCell, Cell } from '@ton/core';
import { requireTestnetDeployment } from './deployment-config.js';

export const PRIVA_TESTNET_NETWORK = '-3';
export const PRIVA_TESTNET_BUY_OPCODE = 0x50525642;
const UINT64_MAX = (1n << 64n) - 1n;
const MAX_VALID_UNTIL_SECONDS = 10 * 60;

function asBigInt(name, value) {
  try {
    if (typeof value === 'boolean' || value === null || value === undefined) throw new Error();
    return typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    throw new TypeError(`${name} must be an integer amount.`);
  }
}

function asCell(name, value) {
  if (value instanceof Cell) return value;
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a base64 BoC or Cell.`);
  try {
    const [cell] = Cell.fromBoc(Buffer.from(value, 'base64'));
    return cell;
  } catch {
    throw new TypeError(`${name} must be a valid base64 BoC.`);
  }
}

function requireCanonicalAddress(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a TON address.`);
  try {
    const address = Address.parse(value);
    if (address.workChain !== 0) throw new Error(`${name} must be a basechain address.`);
    return address;
  } catch {
    throw new TypeError(`${name} must be a canonical basechain TON address.`);
  }
}

/**
 * Encode the canonical fixed-price buy body used by priva_testnet_launchpad.
 * This helper only constructs a TonConnect request; it never submits it.
 */
export function buildTestnetBuyTransaction({
  deployment,
  queryId,
  maxValue,
  recipient,
  proof,
  publicInputs,
  value,
  validUntil = Math.floor(Date.now() / 1000) + 300,
}) {
  const manifest = requireTestnetDeployment(deployment);
  const launchpad = requireCanonicalAddress('deployment.launchpadAddress', manifest.launchpadAddress);
  const recipientAddress = requireCanonicalAddress('recipient', recipient);
  const normalizedQueryId = asBigInt('queryId', queryId);
  const normalizedMaxValue = asBigInt('maxValue', maxValue);
  const normalizedValue = asBigInt('value', value);
  const normalizedValidUntil = asBigInt('validUntil', validUntil);
  if (normalizedQueryId < 0n || normalizedQueryId > UINT64_MAX) throw new RangeError('queryId must fit uint64.');
  if (normalizedMaxValue <= 0n) throw new RangeError('maxValue must be positive.');
  if (normalizedValue < normalizedMaxValue) throw new RangeError('value must cover maxValue and settlement reserve.');
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (normalizedValidUntil <= now || normalizedValidUntil > now + BigInt(MAX_VALID_UNTIL_SECONDS)) {
    throw new RangeError('validUntil must be in the next ten minutes.');
  }

  const proofCell = asCell('proof', proof);
  const publicInputsCell = asCell('publicInputs', publicInputs);
  if (proofCell.refs.length !== 3) throw new TypeError('proof must contain exactly three point references.');
  if (publicInputsCell.bits.length === 0 && publicInputsCell.refs.length === 0) throw new TypeError('publicInputs must not be empty.');

  const body = beginCell()
    .storeUint(PRIVA_TESTNET_BUY_OPCODE, 32)
    .storeUint(normalizedQueryId, 64)
    .storeCoins(normalizedMaxValue)
    .storeAddress(recipientAddress)
    .storeRef(proofCell)
    .storeRef(publicInputsCell)
    .endCell();

  return Object.freeze({
    network: PRIVA_TESTNET_NETWORK,
    validUntil: Number(normalizedValidUntil),
    messages: Object.freeze([{
      address: launchpad.toString(),
      amount: normalizedValue.toString(),
      payload: body.toBoc({ idx: false }).toString('base64'),
    }]),
  });
}

export function decodeTestnetBuyPayload(payload) {
  const body = asCell('payload', payload).beginParse();
  if (body.loadUint(32) !== PRIVA_TESTNET_BUY_OPCODE) throw new Error('Payload is not a Priva testnet buy message.');
  return Object.freeze({
    queryId: body.loadUintBig(64),
    maxValue: body.loadCoins(),
    recipient: body.loadAddress().toString(),
    proof: body.loadRef(),
    publicInputs: body.loadRef(),
  });
}
