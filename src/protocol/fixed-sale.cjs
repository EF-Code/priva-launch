function requirePositive(name, value) {
  if (typeof value !== 'bigint' || value <= 0n) throw new RangeError(`${name} must be a positive BigInt`);
}

/**
 * Exact fixed-price quote in indivisible sale units. TEP-74 balances remain
 * raw units, but this v1 sale deliberately sells whole tokens only so every
 * accepted nanoTON and issued token amount has a single rounding direction.
 */
function quoteFixedPriceBuy({ deposit, soldUnits, totalSaleUnits, priceNanoTonPerSaleUnit }) {
  requirePositive('priceNanoTonPerSaleUnit', priceNanoTonPerSaleUnit);
  if (typeof deposit !== 'bigint' || deposit < 0n) throw new RangeError('deposit must be a non-negative BigInt');
  if (typeof soldUnits !== 'bigint' || soldUnits < 0n) throw new RangeError('soldUnits must be a non-negative BigInt');
  requirePositive('totalSaleUnits', totalSaleUnits);
  if (soldUnits > totalSaleUnits) throw new RangeError('soldUnits cannot exceed totalSaleUnits');

  const remaining = totalSaleUnits - soldUnits;
  const requested = deposit / priceNanoTonPerSaleUnit;
  const saleUnits = requested < remaining ? requested : remaining;
  const acceptedValue = saleUnits * priceNanoTonPerSaleUnit;
  return { saleUnits, acceptedValue, excessValue: deposit - acceptedValue, nextSoldUnits: soldUnits + saleUnits };
}

module.exports = { quoteFixedPriceBuy };
