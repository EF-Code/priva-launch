import { requireTestnetDeployment } from './deployment-config.js';

function normalizeLaunch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const symbol = typeof value.symbol === 'string' ? value.symbol.trim() : '';
  const state = value.state === 'active' || value.state === 'closing' ? value.state : null;
  const raised = Number(value.raisedTon);
  const participants = Number(value.participants);
  const ends = typeof value.ends === 'string' ? value.ends.trim() : '';
  if (!name || !symbol || !state || !Number.isFinite(raised) || raised < 0 || !Number.isSafeInteger(participants) || participants < 0 || !ends) return null;
  return Object.freeze({
    id: typeof value.id === 'string' ? value.id : `${name}:${symbol}`,
    name: name.slice(0, 80),
    symbol: symbol.slice(0, 24),
    emoji: typeof value.emoji === 'string' && value.emoji.length <= 4 ? value.emoji : '◈',
    raised,
    participants,
    state,
    ends,
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
    return Object.freeze(launches);
  }
}
