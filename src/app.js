import { zkAuth } from './zk-auth.js';
import { BondingCurveEngine } from './bonding-curve.js';

// Initial sample bonding curve memecoins
const initialTokens = [
  {
    id: 'token-1',
    name: 'Teleton Agent Token',
    symbol: 'TELE',
    desc: 'Autonomous AI Agent currency for Telegram & TON. Fair launch enforced by zk-tele-auth.',
    emoji: '🤖',
    raisedTon: 62.5,
    creatorNullifier: '0x8f2a1b...3e4f',
    holders: 142
  },
  {
    id: 'token-2',
    name: 'ZkResistor Privacy',
    symbol: 'ZKR',
    desc: 'Community privacy token powering ZK mixers and stealth channels.',
    emoji: '🛡️',
    raisedTon: 28.0,
    creatorNullifier: '0x1c4d9e...8a2b',
    holders: 89
  },
  {
    id: 'token-3',
    name: 'Tonnet Browser Coin',
    symbol: 'TNET',
    desc: 'Incentivized bandwidth token for Tonnet relayer nodes and .ton web streaming.',
    emoji: '🌐',
    raisedTon: 14.2,
    creatorNullifier: '0x7b3f0a...9d1e',
    holders: 54
  }
];

class PrivaLaunchApp {
  constructor() {
    this.tokens = [...initialTokens];
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.bindEvents();
      this.renderFeed();
    });
  }

  bindEvents() {
    const verifyZkBtn = document.getElementById('verifyZkBtn');
    const launchTokenBtn = document.getElementById('launchTokenBtn');
    const launchModal = document.getElementById('launchModal');
    const closeLaunchModal = document.getElementById('closeLaunchModal');
    const createTokenForm = document.getElementById('createTokenForm');

    verifyZkBtn?.addEventListener('click', async () => {
      await this.handleZkVerification();
    });

    launchTokenBtn?.addEventListener('click', () => {
      if (!zkAuth.isVerified) {
        alert('Please click "Verify Telegram ZK" first before launching an anonymous token!');
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
  }

  async handleZkVerification() {
    const zkStatusText = document.getElementById('zkStatusText');
    const zkStatusBadge = document.getElementById('zkStatusBadge');
    const userNullifierDisplay = document.getElementById('userNullifierDisplay');

    zkStatusText.textContent = 'Generating ZK Proof...';

    const result = await zkAuth.verifyTelegramZk();

    if (result.isVerified) {
      zkStatusText.textContent = 'ZK Verified';
      zkStatusBadge.style.borderColor = 'rgba(0, 230, 118, 0.4)';
      zkStatusBadge.style.background = 'rgba(0, 230, 118, 0.15)';
      zkStatusBadge.style.color = '#00e676';
      
      const dot = zkStatusBadge.querySelector('.dot');
      if (dot) dot.style.background = '#00e676';

      userNullifierDisplay.textContent = result.nullifierHash;
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
      holders: 1
    };

    this.tokens.unshift(newToken);
    this.renderFeed();

    document.getElementById('launchModal')?.classList.add('hidden');
    document.getElementById('createTokenForm')?.reset();

    alert(`🎉 Token ${newToken.symbol} deployed anonymously to TON bonding curve!`);
  }

  buyToken(tokenId) {
    if (!zkAuth.isVerified) {
      alert('Must verify Telegram ZK identity before buying on the bonding curve!');
      return;
    }

    const token = this.tokens.find(t => t.id === tokenId);
    if (!token) return;

    const tonAmount = parseFloat(prompt(`Enter TON amount to buy ${token.symbol} (Max 50 TON):`, '5') || '0');
    if (tonAmount <= 0) return;

    if (!zkAuth.canBuyAmount(tonAmount)) {
      alert('❌ Anti-Sniper Limit Exceeded! Max 50 TON buy per unique ZK user.');
      return;
    }

    token.raisedTon += tonAmount;
    token.holders += 1;
    this.renderFeed();

    const tokensReceived = BondingCurveEngine.calculateBuyOutput(tonAmount, token.raisedTon);
    alert(`✅ Successfully bought ${tokensReceived.toLocaleString()} ${token.symbol} for ${tonAmount} TON!`);
  }

  renderFeed() {
    const feedEl = document.getElementById('tokenFeed');
    const countEl = document.getElementById('tokenCount');
    if (!feedEl) return;

    if (countEl) countEl.textContent = `${this.tokens.length} Tokens`;

    feedEl.innerHTML = this.tokens.map(token => {
      const pct = BondingCurveEngine.getGraduationPercentage(token.raisedTon);
      return `
        <div class="token-card">
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
          <button class="btn btn-primary buy-btn" data-id="${token.id}" style="padding: 8px 16px; font-size: 12px; flex-shrink: 0;">
            Buy $${token.symbol}
          </button>
        </div>
      `;
    }).join('');

    // Attach buy button listeners
    feedEl.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        if (id) this.buyToken(id);
      });
    });
  }
}

export const app = new PrivaLaunchApp();
