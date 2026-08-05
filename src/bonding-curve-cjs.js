class BondingCurveEngine {
  static TOTAL_SUPPLY = 1000000000;
  static GRADUATION_CAP_TON = 85;

  static getPricePerToken(raisedTon) {
    const basePrice = 0.000000085;
    return basePrice * (1 + (raisedTon / this.GRADUATION_CAP_TON) * 2);
  }

  static getGraduationPercentage(raisedTon) {
    const pct = (raisedTon / this.GRADUATION_CAP_TON) * 100;
    return Math.min(Math.round(pct), 100);
  }

  static calculateBuyOutput(tonAmount, currentRaisedTon) {
    const currentPrice = this.getPricePerToken(currentRaisedTon);
    return Math.floor(tonAmount / currentPrice);
  }
}

module.exports = { BondingCurveEngine };
