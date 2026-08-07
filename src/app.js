import { zkAuth } from './zk-auth.js';
import { BondingCurveEngine } from './bonding-curve.js';
import { tonWallet } from './ton-wallet.js';
import { telegramApp } from './telegram-app.js';
import { TradingTerminalComponent } from './components/trading-terminal.js';

// Illustrative, in-memory demo tokens. These do not exist on TON.
const initialTokens = [
  {
    id: 'token-1',
    name: 'Teleton Agent Token',
    symbol: 'TELE',
    desc: 'Illustrative token card for the launchpad interface prototype.',
    emoji: '🤖',
    raisedTon: 62.5,
    creatorNullifier: '0x8f2a1b...3e4f',
    holders: 142,
    createdAt: Date.now() - 86400000 * 3
  },
  {
    id: 'token-2',
    name: 'ZkResistor Privacy',
    symbol: 'ZKR',
    desc: 'Community privacy token powering ZK mixers and stealth channels.',
    emoji: '🛡️',
    raisedTon: 78.0,
    creatorNullifier: '0x1c4d9e...8a2b',
    holders: 210,
    createdAt: Date.now() - 86400000 * 2
  },
  {
    id: 'token-3',
    name: 'Tonnet Browser Coin',
    symbol: 'TNET',
    desc: 'Incentivized bandwidth token for Tonnet relayer nodes and .ton web streaming.',
    emoji: '🌐',
    raisedTon: 14.2,
    creatorNullifier: '0x7b3f0a...9d1e',
    holders: 54,
    createdAt: Date.now() - 86400000 * 1
  }
];

class PrivaLaunchApp {
  constructor() {
    this.tokens = [...initialTokens];
    this.currentFilter = 'trending';
    this.searchQuery = '';
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.bindEvents();
      this.subscribeWallet();
      this.renderFeed();
      this.checkTelegramAutoZk();
    });
  }

  showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  bindEvents() {
    const verifyZkBtn = document.getElementById('verifyZkBtn');
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    const launchTokenBtn = document.getElementById('launchTokenBtn');
    const launchModal = document.getElementById('launchModal');
    const closeLaunchModal = document.getElementById('closeLaunchModal');
    const walletModal = document.getElementById('walletModal');
    const closeWalletModal = document.getElementById('closeWalletModal');
    const createTokenForm = document.getElementById('createTokenForm');
    const searchInput = document.getElementById('searchInput');

    verifyZkBtn?.addEventListener('click', async () => {
      await this.handleZkVerification();
    });

    connectWalletBtn?.addEventListener('click', () => {
      walletModal?.classList.remove('hidden');
    });

    closeWalletModal?.addEventListener('click', () => {
      walletModal?.classList.add('hidden');
    });

    document.querySelectorAll('.wallet-option-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        const walletType = e.currentTarget.getAttribute('data-wallet');
        if (walletType) {
          await tonWallet.connectWallet(walletType);
          walletModal?.classList.add('hidden');
          this.showToast(`💎 ${walletType} selected for the demo. No wallet was connected.`);
        }
      });
    });

    launchTokenBtn?.addEventListener('click', () => {
      if (!zkAuth.isVerified) {
        this.showToast('Enable the demo identity first to simulate a token launch. No identity is verified.');
        return;
      }
      launchModal?.classList.remove('hidden');
    });

    closeLaunchModal?.addEventListener('click', () => {
      launchModal?.classList.add('hidden');
    });

    createTokenForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCreateToken();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.getAttribute('data-filter') || 'trending';
        this.renderFeed();
      });
    });

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderFeed();
    });
  }

  subscribeWallet() {
    tonWallet.subscribe(({ isConnected, address, walletName }) => {
      const connectWalletBtn = document.getElementById('connectWalletBtn');
      const walletDisplayBox = document.getElementById('walletDisplayBox');

      if (isConnected && address) {
        const shortAddr = `${address.substring(0, 6)}...${address.slice(-4)}`;
        if (connectWalletBtn) connectWalletBtn.textContent = `💎 Demo: ${shortAddr}`;
        if (walletDisplayBox) walletDisplayBox.textContent = `${walletName} demo: ${shortAddr}`;
      } else {
        if (connectWalletBtn) connectWalletBtn.textContent = '💎 Select demo wallet';
        if (walletDisplayBox) walletDisplayBox.textContent = 'No demo wallet selected';
      }
    });
  }

  async checkTelegramAutoZk() {
    if (telegramApp.isInTelegram) {
      await this.handleZkVerification();
    }
  }

  async handleZkVerification() {
    const zkStatusText = document.getElementById('zkStatusText');
    const zkStatusBadge = document.getElementById('zkStatusBadge');
    const userNullifierDisplay = document.getElementById('userNullifierDisplay');

    if (zkStatusText) zkStatusText.textContent = 'Creating demo identity...';

    const result = await zkAuth.verifyTelegramZk();

    if (result.isVerified) {
      if (zkStatusText) zkStatusText.textContent = 'Demo identity active';
      if (zkStatusBadge) {
        zkStatusBadge.style.borderColor = 'rgba(0, 230, 118, 0.4)';
        zkStatusBadge.style.background = 'rgba(0, 230, 118, 0.15)';
        zkStatusBadge.style.color = '#00e676';
        const dot = zkStatusBadge.querySelector('.dot');
        if (dot) dot.style.background = '#00e676';
      }

      if (userNullifierDisplay) userNullifierDisplay.textContent = result.nullifierHash;
      this.showToast('🛡️ Demo identity enabled. No Telegram verification, ZK proof, or allocation limit is active.');
    }
  }

  handleCreateToken() {
    const name = document.getElementById('tokenNameInput').value;
    const symbol = document.getElementById('tokenSymbolInput').value;
    const desc = document.getElementById('tokenDescInput').value;
    const emoji = document.getElementById('tokenEmojiInput').value || '⚡';

    const newToken = {
      id: `token-${Date.now()}`,
      name,
      symbol: symbol.toUpperCase(),
      desc,
      emoji,
      raisedTon: 0.1,
      creatorNullifier: `${zkAuth.nullifierHash.substring(0, 10)}...${zkAuth.nullifierHash.slice(-6)}`,
      holders: 1,
      createdAt: Date.now()
    };

    this.tokens.unshift(newToken);
    this.renderFeed();

    document.getElementById('launchModal')?.classList.add('hidden');
    document.getElementById('createTokenForm')?.reset();

    this.showToast(`🎉 Simulated $${newToken.symbol} added locally. No contract or token was deployed.`);
  }

  getFilteredTokens() {
    let list = [...this.tokens];

    if (this.searchQuery) {
      list = list.filter(t => 
        t.name.toLowerCase().includes(this.searchQuery) ||
        t.symbol.toLowerCase().includes(this.searchQuery) ||
        t.desc.toLowerCase().includes(this.searchQuery)
      );
    }

    if (this.currentFilter === 'graduating') {
      list.sort((a, b) => b.raisedTon - a.raisedTon);
    } else if (this.currentFilter === 'newest') {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      list.sort((a, b) => (b.holders * b.raisedTon) - (a.holders * a.raisedTon));
    }

    return list;
  }

  openTradingTerminal(token) {
    const terminal = new TradingTerminalComponent(
      token, 
      () => this.renderFeed(),
      (msg) => this.showToast(msg)
    );
    terminal.render();
  }

  renderFeed() {
    const feedEl = document.getElementById('tokenFeed');
    const countEl = document.getElementById('tokenCount');
    if (!feedEl) return;

    const filtered = this.getFilteredTokens();
    if (countEl) countEl.textContent = `${filtered.length} Tokens`;

    feedEl.innerHTML = filtered.map(token => {
      const pct = BondingCurveEngine.getGraduationPercentage(token.raisedTon);
      return `
        <div class="token-card" data-id="${token.id}">
          <div class="token-icon">${token.emoji}</div>
          <div class="token-info">
            <div>
              <span class="token-name">${token.name}</span>
              <span class="token-symbol">$${token.symbol}</span>
            </div>
            <div class="token-desc">${token.desc}</div>
            
            <div class="bonding-bar-bg">
              <div class="bonding-bar-fill" style="width: ${pct}%;"></div>
            </div>
            <div class="progress-text">
              <span>Bonding Curve: ${pct}%</span>
              <span>Raised: ${token.raisedTon.toFixed(1)} / 85 TON</span>
            </div>
          </div>
          <button class="btn btn-primary trade-btn" data-id="${token.id}" style="padding: 8px 16px; font-size: 12px; flex-shrink: 0;">
            Explore demo $${token.symbol}
          </button>
        </div>
      `;
    }).join('');

    feedEl.querySelectorAll('.token-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = card.getAttribute('data-id');
        const token = this.tokens.find(t => t.id === id);
        if (token) this.openTradingTerminal(token);
      });
    });
  }
}

export const app = new PrivaLaunchApp();
