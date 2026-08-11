/**
 * Priva - Telegram MiniApp & WebApp Integration
 */

export class TelegramAppIntegration {
  constructor() {
    this.isInTelegram = false;
    this.initData = null;
    this.telegramUser = null;
    this.init();
  }

  init() {
    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      this.isInTelegram = true;
      this.initData = tg.initData || null;
      this.telegramUser = tg.initDataUnsafe?.user || null;

      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0b0e14');
        tg.setBackgroundColor('#0b0e14');
      } catch (e) {
        console.warn('[TelegramApp] WebApp init error:', e);
      }
    }
  }

  /**
   * Extract raw, Telegram-signed initData. Desktop/demo builds must not invent
   * a fallback because a forged local value could be mistaken for identity.
   * @returns {string}
   */
  getInitDataString() {
    if (this.initData) return this.initData;
    throw new Error('Telegram-signed initData is unavailable outside Telegram.');
  }
}

export const telegramApp = new TelegramAppIntegration();
