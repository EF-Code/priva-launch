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
   * Extract raw Telegram initData or fallback mock for desktop testing
   * @returns {string}
   */
  getInitDataString() {
    if (this.initData) return this.initData;
    return 'auth_date=1620000000&user=%7B%22id%22%3A987654321%2C%22is_premium%22%3Atrue%7D&hash=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }
}

export const telegramApp = new TelegramAppIntegration();
