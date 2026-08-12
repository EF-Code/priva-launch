import { BondingCurveEngine } from './bonding-curve.js';
import { deploymentConfig, getDeploymentStatus } from './deployment-config.js';
import { PrivaGatewayClient } from './gateway-client.js';
import { PrivaIndexerClient } from './indexer-client.js';
import { calculatePurchaseValue, prepareTestnetPurchase } from './purchase-flow.js';
import { telegramApp } from './telegram-app.js';
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
    this.activeLaunch = null;
    this.pendingPurchase = null;
    this.purchaseBusy = false;
    tonWallet.setDeployment(deploymentConfig);
    this.dialog = document.querySelector('#readinessDialog');
    this.toast = document.querySelector('#toast');
    this.bind();
    this.bindPurchaseDialog();
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

  bindPurchaseDialog() {
    this.purchaseDialog = document.querySelector('#purchaseDialog');
    this.purchaseForm = document.querySelector('#purchaseForm');
    this.purchaseForm.addEventListener('submit', (event) => this.submitPurchase(event));
    document.querySelectorAll('#purchaseCancel, #purchaseCancelAction').forEach((button) => button.addEventListener('click', () => this.closePurchase()));
    document.querySelector('#purchaseUnits').addEventListener('input', () => this.updatePurchaseQuote());
    this.purchaseDialog.addEventListener('cancel', () => this.resetPurchase());
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

  openPurchase(launch) {
    if (deploymentConfig.mode !== 'testnet') {
      this.notify('Read-only demo: no wallet transaction is available.');
      return;
    }
    this.activeLaunch = launch;
    this.pendingPurchase = null;
    document.querySelector('#purchaseLaunchName').textContent = `${launch.name} ($${launch.symbol})`;
    document.querySelector('#purchaseLaunchId').textContent = `Launch ${launch.id}`;
    const units = document.querySelector('#purchaseUnits');
    units.value = '1';
    units.max = launch.remainingSaleUnits;
    units.disabled = false;
    document.querySelector('#purchaseStatus').textContent = 'Connect your testnet wallet, then request a Telegram-bound proof.';
    const submit = document.querySelector('#purchaseSubmit');
    submit.textContent = 'Request proof and review';
    submit.disabled = false;
    this.updatePurchaseQuote();
    this.purchaseDialog.showModal();
  }

  resetPurchase() {
    this.activeLaunch = null;
    this.pendingPurchase = null;
    this.purchaseBusy = false;
    this.purchaseForm?.reset();
  }

  closePurchase() {
    this.purchaseDialog.close();
    this.resetPurchase();
  }

  updatePurchaseQuote() {
    const quote = document.querySelector('#purchaseQuote');
    const submit = document.querySelector('#purchaseSubmit');
    if (!this.activeLaunch || this.pendingPurchase) return;
    try {
      const result = calculatePurchaseValue({ launch: this.activeLaunch, saleUnits: document.querySelector('#purchaseUnits').value });
      quote.textContent = `${formatNanoTon(result.maxValue)} TON sale value + ${formatNanoTon(result.reserve)} TON refund reserve = ${formatNanoTon(result.value)} TON wallet request`;
      submit.disabled = false;
    } catch (error) {
      quote.textContent = error instanceof Error ? error.message : String(error);
      submit.disabled = true;
    }
  }

  async submitPurchase(event) {
    event.preventDefault();
    if (this.purchaseBusy || !this.activeLaunch) return;
    this.purchaseBusy = true;
    const submit = document.querySelector('#purchaseSubmit');
    const status = document.querySelector('#purchaseStatus');
    try {
      if (this.pendingPurchase) {
        status.textContent = 'Opening the wallet for your explicit approval…';
        submit.disabled = true;
        await tonWallet.sendTransaction(this.pendingPurchase.transaction);
        status.textContent = 'Wallet accepted the request. Wait for an independently indexed chain confirmation.';
        this.notify('Transaction submitted; confirmation is not yet final.');
        window.setTimeout(() => this.closePurchase(), 1600);
        return;
      }
      if (!tonWallet.isConnected) throw new Error('Connect a testnet wallet before requesting a purchase.');
      const initData = telegramApp.getInitDataString();
      status.textContent = 'Requesting a fresh gateway proof…';
      submit.disabled = true;
      const prepared = await prepareTestnetPurchase({
        deployment: deploymentConfig,
        launch: this.activeLaunch,
        saleUnits: document.querySelector('#purchaseUnits').value,
        recipientAddress: tonWallet.walletAddress,
        initData,
        gatewayClient: new PrivaGatewayClient({ endpoint: deploymentConfig.gatewayUrl }),
      });
      this.pendingPurchase = prepared;
      document.querySelector('#purchaseUnits').disabled = true;
      document.querySelector('#purchaseQuote').textContent = `${formatNanoTon(prepared.maxValue)} TON sale value + reserve; recipient ${tonWallet.walletAddress}`;
      status.textContent = 'Proof verified locally. Review the exact destination and amount, then approve in your wallet.';
      submit.textContent = 'Approve in wallet';
      submit.disabled = false;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      submit.disabled = false;
    } finally {
      this.purchaseBusy = false;
    }
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
    const foot = document.createElement('div'); foot.className = 'launch-foot'; const label = document.createElement('span'); label.textContent = deploymentConfig.dex?.kind === 'none' ? 'Fixed-price testnet sale' : `${progress}% to graduation`; const action = document.createElement('button'); action.className = 'button button-card'; action.type = 'button'; action.textContent = deploymentConfig.mode === 'testnet' ? 'Review purchase' : 'View launch'; action.addEventListener('click', () => deploymentConfig.mode === 'testnet' ? this.openPurchase(launch) : this.notify('Read-only testnet preview: indexed launch data is not configured.')); foot.append(label, action);
    card.append(top, stats, meter, foot); return card;
  }
}

function formatNanoTon(value) {
  const nano = typeof value === 'bigint' ? value : BigInt(value);
  const whole = nano / 1000000000n;
  const fraction = (nano % 1000000000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

new LaunchpadUI();
