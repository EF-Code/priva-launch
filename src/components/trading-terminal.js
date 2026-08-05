/**
 * Priva - Enterprise Trading Terminal & Chart Component
 */

import { BondingCurveEngine } from '../bonding-curve.js';
import { zkAuth } from '../zk-auth.js';
import { tonWallet } from '../ton-wallet.js';

export class TradingTerminalComponent {
  constructor(token, onClose, showToast) {
    this.token = token;
    this.onClose = onClose;
    this.showToast = showToast;
    this.activeTab = 'buy';
    this.timeframe = '5M';
    this.element = null;
  }

  render() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content trading-modal">
        <button class="close-btn" id="closeTradingTerminal">&times;</button>
        
        <div class="terminal-header">
          <div class="token-title">
            <span class="icon-lg">${this.token.emoji}</span>
            <div>
              <div class="name">${this.token.name} <span class="symbol">$${this.token.symbol}</span></div>
              <div class="creator-null">Creator ZK Nullifier: ${this.token.creatorNullifier}</div>
            </div>
          </div>
          <div class="token-price-box">
            <div class="price-val">${BondingCurveEngine.getPricePerToken(this.token.raisedTon).toFixed(9)} TON</div>
            <div class="grad-pct">DeDust Graduation: ${BondingCurveEngine.getGraduationPercentage(this.token.raisedTon)}%</div>
          </div>
        </div>

        <div class="terminal-body">
          <div class="chart-container">
            <div class="chart-header">
              <span class="chart-title">Price Chart & Volume (TON)</span>
              <div class="tf-btns">
                <button class="tf-btn active" data-tf="1M">1M</button>
                <button class="tf-btn" data-tf="5M">5M</button>
                <button class="tf-btn" data-tf="15M">15M</button>
                <button class="tf-btn" data-tf="1H">1H</button>
              </div>
            </div>
            <canvas id="priceChartCanvas" width="480" height="220"></canvas>

            <div class="orderbook-box">
              <div style="font-weight: 700; margin-bottom: 6px; color: var(--text-secondary);">Live Order Stream</div>
              <div class="orderbook-row ask"><span>0.000000089 TON</span> <span>12,400 $${this.token.symbol}</span> <span>ASK</span></div>
              <div class="orderbook-row ask"><span>0.000000087 TON</span> <span>45,000 $${this.token.symbol}</span> <span>ASK</span></div>
              <div class="orderbook-row bid"><span>0.000000085 TON</span> <span>89,200 $${this.token.symbol}</span> <span>BID</span></div>
              <div class="orderbook-row bid"><span>0.000000083 TON</span> <span>150,000 $${this.token.symbol}</span> <span>BID</span></div>
            </div>
          </div>

          <div class="trade-form-box">
            <div class="tab-switch">
              <button class="tab-btn active" id="tabBuy">Buy</button>
              <button class="tab-btn" id="tabSell">Sell</button>
            </div>

            <div class="form-group" style="margin-top: 16px;">
              <label id="inputAmountLabel">Amount in TON (Max 50 TON):</label>
              <input type="number" id="tradeAmountInput" value="5" step="0.5" min="0.1">
            </div>

            <div class="estimate-row">
              <span>Estimated Receive:</span>
              <strong id="estimatedReceiveVal">0 tokens</strong>
            </div>

            <div class="estimate-row">
              <span>Slippage Tolerance:</span>
              <span style="color: var(--cyan);">1.0%</span>
            </div>

            <button class="btn btn-primary" id="executeTradeBtn" style="width: 100%; margin-top: 18px;">
              Buy $${this.token.symbol}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.element = modal;
    this.bindTerminalEvents(modal);
    this.renderChart(modal.querySelector('#priceChartCanvas'));
  }

  bindTerminalEvents(modal) {
    const closeBtn = modal.querySelector('#closeTradingTerminal');
    const tabBuy = modal.querySelector('#tabBuy');
    const tabSell = modal.querySelector('#tabSell');
    const inputAmountLabel = modal.querySelector('#inputAmountLabel');
    const tradeAmountInput = modal.querySelector('#tradeAmountInput');
    const estimatedReceiveVal = modal.querySelector('#estimatedReceiveVal');
    const executeTradeBtn = modal.querySelector('#executeTradeBtn');

    closeBtn.addEventListener('click', () => {
      modal.remove();
      if (this.onClose) this.onClose();
    });

    modal.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        modal.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.renderChart(modal.querySelector('#priceChartCanvas'));
      });
    });

    const updateEstimate = () => {
      const amt = parseFloat(tradeAmountInput.value || '0');
      if (this.activeTab === 'buy') {
        const out = BondingCurveEngine.calculateBuyOutput(amt, this.token.raisedTon);
        estimatedReceiveVal.textContent = `${out.toLocaleString()} ${this.token.symbol}`;
      } else {
        const tonOut = (amt * BondingCurveEngine.getPricePerToken(this.token.raisedTon)).toFixed(4);
        estimatedReceiveVal.textContent = `${tonOut} TON`;
      }
    };

    tradeAmountInput.addEventListener('input', updateEstimate);
    updateEstimate();

    tabBuy.addEventListener('click', () => {
      this.activeTab = 'buy';
      tabBuy.classList.add('active');
      tabSell.classList.remove('active');
      inputAmountLabel.textContent = 'Amount in TON (Max 50 TON):';
      executeTradeBtn.textContent = `Buy $${this.token.symbol}`;
      updateEstimate();
    });

    tabSell.addEventListener('click', () => {
      this.activeTab = 'sell';
      tabSell.classList.add('active');
      tabBuy.classList.remove('active');
      inputAmountLabel.textContent = `Amount in $${this.token.symbol}:`;
      executeTradeBtn.textContent = `Sell $${this.token.symbol}`;
      updateEstimate();
    });

    executeTradeBtn.addEventListener('click', async () => {
      if (!zkAuth.isVerified) {
        if (this.showToast) this.showToast('Verification Required: Click "Verify Telegram ZK" first!');
        return;
      }

      if (!tonWallet.isConnected) {
        if (this.showToast) this.showToast('Wallet Required: Click "Connect Wallet" first!');
        return;
      }

      const amt = parseFloat(tradeAmountInput.value || '0');
      if (this.activeTab === 'buy') {
        if (!zkAuth.canBuyAmount(amt)) {
          if (this.showToast) this.showToast('❌ Anti-Sniper Limit: Max 50 TON buy per unique ZK user.');
          return;
        }

        const res = await tonWallet.sendTransaction({
          to: 'EQC_Priva_BondingCurve_Address',
          value: Math.floor(amt * 1e9),
          payload: `op:buy,token:${this.token.symbol}`
        });

        this.token.raisedTon += amt;
        this.token.holders += 1;
        if (this.showToast) this.showToast(`✅ Tx Executed! Hash: ${res.hash.substring(0, 14)}...`);
        modal.remove();
        if (this.onClose) this.onClose();
      } else {
        if (this.showToast) this.showToast(`✅ Sold ${amt.toLocaleString()} $${this.token.symbol}!`);
        modal.remove();
        if (this.onClose) this.onClose();
      }
    });
  }

  renderChart(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const candles = [
      { open: 120, high: 140, low: 110, close: 135 },
      { open: 135, high: 155, low: 130, close: 150 },
      { open: 150, high: 160, low: 135, close: 140 },
      { open: 140, high: 175, low: 140, close: 170 },
      { open: 170, high: 190, low: 165, close: 185 }
    ];

    const step = width / (candles.length + 1);

    candles.forEach((c, idx) => {
      const x = (idx + 1) * step;
      const isGreen = c.close >= c.open;
      ctx.strokeStyle = isGreen ? '#00e676' : '#ff5252';
      ctx.fillStyle = isGreen ? '#00e676' : '#ff5252';

      ctx.beginPath();
      ctx.moveTo(x, height - c.low);
      ctx.lineTo(x, height - c.high);
      ctx.stroke();

      const top = height - Math.max(c.open, c.close);
      const h = Math.abs(c.close - c.open);
      ctx.fillRect(x - 8, top, 16, Math.max(h, 2));
    });
  }
}
