/**
 * PrivaLaunch - Bonding Curve Math Engine
 * Calculates linear/exponential price curve and graduation progress to DeDust CPMM
 */

export class BondingCurveEngine {
  static TOTAL_SUPPLY = 1000000000; // 1 Billion tokens
  static GRADUATION_CAP_TON = 85;   // 85 TON raised triggers DeDust liquidity migration

  /**
   * Calculate current token price in TON based on current raised TON
   * @param {number} raisedTon
   * @returns {number} Price in TON per token
   */
  static getPricePerToken(raisedTon) {
    const basePrice = 0.000000085;
    return basePrice * (1 + (raisedTon / this.GRADUATION_CAP_TON) * 2);
  }

  /**
   * Calculate percentage progress towards DeDust graduation
   * @param {number} raisedTon
   * @returns {number} Percentage (0 - 100)
   */
  static getGraduationPercentage(raisedTon) {
    const pct = (raisedTon / this.GRADUATION_CAP_TON) * 100;
    return Math.min(Math.round(pct), 100);
  }

  /**
   * Calculate tokens received for a given TON deposit amount
   * @param {number} tonAmount
   * @param {number} currentRaisedTon
   * @returns {number}
   */
  static calculateBuyOutput(tonAmount, currentRaisedTon) {
    const currentPrice = this.getPricePerToken(currentRaisedTon);
    return Math.floor(tonAmount / currentPrice);
  }
}
