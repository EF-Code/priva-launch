/**
 * PrivaLaunch - Trading Terminal & Price Chart Component
 */

import { BondingCurveEngine } from '../bonding-curve.js';
import { zkAuth } from '../zk-auth.js';
import { tonWallet } from '../ton-wallet.js';

export class TradingTerminalComponent {
  constructor(token, onClose) {
    this.token = token;
    this.onClose = onClose;
    this.activeTab = 'buy'; // 'buy' or 'sell'
    this.element = null;
    this.chartCanvas = null;
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
              <div class="creator-null">Creator: ${this.token.creatorNullifier}</div>
            </div>
          </div>
          <div class="token-price-box">
            <div class="price-val">${BondingCurveEngine.getPricePerToken(this.token.raisedTon).toFixed(9)} TON</div>
            <div class="grad-pct">Graduation: ${BondingCurveEngine.getGraduationPercentage(this.token.raisedTon)}%</div>
          </div>
        </div>

        <div class="terminal-body">
          <div class="chart-container">
            <div class="chart-title">Price Candle History & Volume</div>
            <canvas id="priceChartCanvas" width="400" height="200"></canvas>
          </div>

          <div class="trade-form-box">
            <div class="tab-switch">
              <button class="tab-btn active" id="tabBuy">Buy</button>
              <button class="tab-btn" id="tabSell">Sell</button>
            </div>

            <div class="form-group" style="margin-top: 14px;">
              <label id="inputAmountLabel">Amount in TON (Max 50 TON):</label>
              <input type="number" id="tradeAmountInput" value="5" step="0.5" min="0.1">
            </div>

            <div class="estimate-row">
              <span>Estimated Receive:</span>
              <strong id="estimatedReceiveVal">0 tokens</strong>
            </div>

            <button class="btn btn-primary" id="executeTradeBtn" style="width: 100%; margin-top: 16px;">
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
        alert('Verification Required: Please click "Verify Telegram ZK" first!');
        return;
      }

      if (!tonWallet.isConnected) {
        alert('Wallet Connection Required: Please connect your TON wallet!');
        return;
      }

      const amt = parseFloat(tradeAmountInput.value || '0');
      if (this.activeTab === 'buy') {
        if (!zkAuth.canBuyAmount(amt)) {
          alert('Anti-Sniper Limit Exceeded: Max 50 TON purchase allowed per unique ZK user.');
          return;
        }

        const res = await tonWallet.sendTransaction({
          to: 'EQC_PrivaLaunch_BondingCurve_Address',
          value: Math.floor(amt * 1e9),
          payload: `op:buy,token:${this.token.symbol}`
        });

        this.token.raisedTon += amt;
        this.token.holders += 1;
        alert(`Transaction Executed! Tx Hash: ${res.hash.substring(0, 16)}...\nBought tokens successfully!`);
        modal.remove();
        if (this.onClose) this.onClose();
      } else {
        alert(`Sold ${amt.toLocaleString()} ${this.token.symbol} tokens!`);
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

    // Draw grid background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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

    // Draw Price Candle Line
    ctx.beginPath();
    ctx.moveTo(10, height - 30);
    ctx.lineTo(80, height - 40);
    ctx.lineTo(160, height - 70);
    ctx.lineTo(240, height - 60);
    ctx.lineTo(320, height - 120);
    ctx.lineTo(390, height - 160);
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Fill Gradient under line
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(0, 242, 254, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
    ctx.lineTo(390, height);
    ctx.lineTo(10, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}
