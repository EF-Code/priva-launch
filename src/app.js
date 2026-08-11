import { BondingCurveEngine } from './bonding-curve.js';
import { deploymentConfig, getDeploymentStatus } from './deployment-config.js';
import { PrivaIndexerClient } from './indexer-client.js';
import { createTestnetTonConnect } from './ton-connect.js';
import { tonWallet } from './ton-wallet.js';

const fixtures = Object.freeze([
  { name: 'Telegram Signal', symbol: 'SIGNAL', emoji: '◉', raised: 61.2, participants: 184, state: 'active', ends: '5h 12m' },
  { name: 'Nullifier Club', symbol: 'NULL', emoji: '∿', raised: 78.8, participants: 317, state: 'closing', ends: '1h 04m' },
  { name: 'Open Network Radio', symbol: 'ONR', emoji: '↗', raised: 22.5, participants: 92, state: 'active', ends: '1d 8h' }
]);

class LaunchpadUI {
  constructor() {
    this.filter = 'all';
    this.query = '';
    this.launches = deploymentConfig.mode === 'testnet' ? [] : fixtures;
    this.connectorPromise = null;
    tonWallet.setDeployment(deploymentConfig);
    this.dialog = document.querySelector('#readinessDialog');
    this.toast = document.querySelector('#toast');
    this.bind();
    this.render();
    void this.loadLaunches();
  }

  bind() {
    document.querySelector('#searchInput').addEventListener('input', ({ target }) => { this.query = target.value.trim().toLowerCase(); this.render(); });
    document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
      this.filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('selected', item === button));
      this.render();
    }));
    document.querySelector('#connectWalletBtn').addEventListener('click', () => this.connectWallet());
    document.querySelector('#openReadinessBtn').addEventListener('click', () => this.openReadiness());
    tonWallet.subscribe(({ isConnected, address }) => {
      const button = document.querySelector('#connectWalletBtn');
      button.textContent = isConnected ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet';
      button.setAttribute('aria-label', isConnected ? `Connected wallet ${address}` : 'Connect wallet');
    });
  }

  async connectWallet() {
    if (deploymentConfig.mode !== 'testnet') {
      this.openReadiness('Wallet connection is locked');
      return;
    }
    try {
      if (!this.connectorPromise) {
        this.connectorPromise = createTestnetTonConnect(deploymentConfig).then((connector) => {
          tonWallet.setConnector(connector);
          return connector;
        });
      }
      await this.connectorPromise;
      const wallet = await tonWallet.connectWallet();
      this.notify(`Connected ${wallet.address}`);
    } catch (error) {
      this.connectorPromise = null;
      this.openReadiness('Wallet connection failed');
      document.querySelector('#dialogText').textContent = error instanceof Error ? error.message : String(error);
    }
  }

  async loadLaunches() {
    if (deploymentConfig.mode !== 'testnet') return;
    try {
      const client = new PrivaIndexerClient({ endpoint: deploymentConfig.indexerUrl });
      this.launches = await client.listTestnetLaunches(deploymentConfig);
    } catch (error) {
      this.launches = [];
      this.notify('No reviewed indexer data is available; the interface remains read-only.');
    }
    this.render();
  }

  openReadiness(title) {
    if (title) document.querySelector('#dialogTitle').textContent = title;
    this.dialog.showModal();
  }

  notify(message) {
    this.toast.textContent = message;
    this.toast.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('visible'), 3600);
  }

  render() {
    const list = this.launches.filter((launch) => (this.filter === 'all' || launch.state === this.filter) && `${launch.name} ${launch.symbol}`.toLowerCase().includes(this.query));
    const grid = document.querySelector('#launchGrid');
    grid.replaceChildren(...list.map((launch) => this.launchCard(launch)));
    if (list.length === 0) grid.append(Object.assign(document.createElement('p'), { className: 'empty-state', textContent: deploymentConfig.mode === 'testnet' ? 'No indexed testnet launches are available.' : 'No testnet fixtures match that search.' }));
    const status = getDeploymentStatus(deploymentConfig);
    document.querySelector('#networkStatus').textContent = status.label;
  }

  launchCard(launch) {
    const progress = BondingCurveEngine.getGraduationPercentage(launch.raised);
    const card = document.createElement('article'); card.className = 'launch-card';
    const top = document.createElement('div'); top.className = 'launch-top';
    const mark = document.createElement('span'); mark.className = 'launch-mark'; mark.textContent = launch.emoji;
    const identity = document.createElement('div'); const name = document.createElement('h3'); name.textContent = launch.name; const symbol = document.createElement('p'); symbol.textContent = `$${launch.symbol}`; identity.append(name, symbol);
    const state = document.createElement('span'); state.className = `state ${launch.state}`; state.textContent = launch.state === 'closing' ? 'Closing soon' : 'Active'; top.append(mark, identity, state);
    const stats = document.createElement('div'); stats.className = 'launch-stats'; stats.innerHTML = `<span><b>${launch.raised.toFixed(1)} TON</b> raised</span><span><b>${launch.participants}</b> participants</span><span><b>${launch.ends}</b> remaining</span>`;
    const meter = document.createElement('div'); meter.className = 'meter'; const fill = document.createElement('i'); fill.style.width = `${progress}%`; meter.append(fill);
    const foot = document.createElement('div'); foot.className = 'launch-foot'; const label = document.createElement('span'); label.textContent = `${progress}% to graduation`; const action = document.createElement('button'); action.className = 'button button-card'; action.type = 'button'; action.textContent = 'View launch'; action.addEventListener('click', () => this.notify(deploymentConfig.mode === 'testnet' ? 'Launch details are read-only until the purchase flow is reviewed.' : 'Read-only testnet preview: indexed launch data is not configured.')); foot.append(label, action);
    card.append(top, stats, meter, foot); return card;
  }
}

new LaunchpadUI();
