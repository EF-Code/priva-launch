import { requireTestnetDeployment } from './deployment-config.js';

const decimal = /^(0|[1-9][0-9]*)$/;

function canonicalDecimal(name, value, { nonZero = false } = {}) {
  if (typeof value !== 'string' || !decimal.test(value) || (nonZero && value === '0')) return null;
  return value;
}

function normalizeLaunch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const launchpadAddress = typeof value.launchpadAddress === 'string' ? value.launchpadAddress.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const symbol = typeof value.symbol === 'string' ? value.symbol.trim() : '';
  const state = value.state === 'active' || value.state === 'closing' ? value.state : null;
  const raised = Number(value.raisedTon);
  const participants = Number(value.participants);
  const ends = typeof value.ends === 'string' ? value.ends.trim() : '';
  const priceNanoTonPerSaleUnit = canonicalDecimal('priceNanoTonPerSaleUnit', value.priceNanoTonPerSaleUnit, { nonZero: true });
  const remainingSaleUnits = canonicalDecimal('remainingSaleUnits', value.remainingSaleUnits);
  const refundGasReserveNanoTon = canonicalDecimal('refundGasReserveNanoTon', value.refundGasReserveNanoTon, { nonZero: true });
  const mintMessageValueNanoTon = canonicalDecimal('mintMessageValueNanoTon', value.mintMessageValueNanoTon, { nonZero: true });
  if (!id || id.length > 128 || !launchpadAddress || !name || !symbol || !state || !Number.isFinite(raised) || raised < 0 || !Number.isSafeInteger(participants) || participants < 0 || !ends || !priceNanoTonPerSaleUnit || !remainingSaleUnits || !refundGasReserveNanoTon || !mintMessageValueNanoTon) return null;
  return Object.freeze({
    id,
    launchpadAddress,
    name: name.slice(0, 80),
    symbol: symbol.slice(0, 24),
    emoji: typeof value.emoji === 'string' && value.emoji.length <= 4 ? value.emoji : '◈',
    raised,
    participants,
    state,
    ends,
    priceNanoTonPerSaleUnit,
    remainingSaleUnits,
    refundGasReserveNanoTon,
    mintMessageValueNanoTon,
  });
}

/** Read-only discovery client. It never invents a launch when the indexer is unavailable. */
export class PrivaIndexerClient {
  constructor({ endpoint, fetchImpl = fetch } = {}) {
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) throw new TypeError('A pinned HTTPS indexer endpoint is required.');
    this.endpoint = endpoint.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async listTestnetLaunches(deployment) {
    const manifest = requireTestnetDeployment(deployment);
    if (this.endpoint !== manifest.indexerUrl.replace(/\/$/, '')) throw new Error('Indexer endpoint does not match the reviewed testnet manifest.');
    const response = await this.fetchImpl(`${this.endpoint}/v1/launches`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Testnet indexer request failed (${response.status}).`);
    const body = await response.json();
    if (!body || !Array.isArray(body.launches) || body.launches.length > 100) throw new Error('Testnet indexer returned an invalid launch list.');
    const launches = body.launches.map(normalizeLaunch).filter(Boolean);
    if (launches.length !== body.launches.length) throw new Error('Testnet indexer returned an invalid launch record.');
    if (launches.some((launch) => launch.launchpadAddress !== manifest.launchpadAddress)) throw new Error('Testnet launch does not match the reviewed launchpad.');
    return Object.freeze(launches);
  }
}
