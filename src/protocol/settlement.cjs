/**
 * Integer-only reference settlement model for the future launchpad contract.
 *
 * All quantities are BigInt. `basePrice` and `slope` are nanoTON per raw
 * jetton unit; callers must use the same fixed-point scale as the contract.
 * This module is a test oracle, not a wallet or contract implementation.
 */

function requireNonNegative(name, value) {
  if (typeof value !== 'bigint' || value < 0n) {
    throw new RangeError(`${name} must be a non-negative BigInt`);
  }
}

function requirePositive(name, value) {
  if (typeof value !== 'bigint' || value <= 0n) {
    throw new RangeError(`${name} must be a positive BigInt`);
  }
}

/** Cost of the next `quantity` raw units after `sold` raw units. */
function linearBuyCost({ sold, quantity, basePrice, slope }) {
  requireNonNegative('sold', sold);
  requireNonNegative('quantity', quantity);
  requireNonNegative('basePrice', basePrice);
  requireNonNegative('slope', slope);

  // Sum from i = sold through sold + quantity - 1 of basePrice + slope * i.
  return basePrice * quantity + slope * (sold * quantity + (quantity * (quantity - 1n)) / 2n);
}

/**
 * Finds the largest purchasable integer quantity without exceeding deposit or
 * supply. Binary search keeps the reference model safe for large raw supplies.
 */
function quoteLinearBuy({ sold, maxSupply, deposit, basePrice, slope }) {
  requireNonNegative('sold', sold);
  requireNonNegative('maxSupply', maxSupply);
  requireNonNegative('deposit', deposit);
  requireNonNegative('basePrice', basePrice);
  requireNonNegative('slope', slope);
  if (sold > maxSupply) throw new RangeError('sold cannot exceed maxSupply');

  let low = 0n;
  let high = maxSupply - sold;
  while (low < high) {
    const mid = low + (high - low + 1n) / 2n;
    const cost = linearBuyCost({ sold, quantity: mid, basePrice, slope });
    if (cost <= deposit) low = mid;
    else high = mid - 1n;
  }

  const acceptedValue = linearBuyCost({ sold, quantity: low, basePrice, slope });
  return {
    tokenAmount: low,
    acceptedValue,
    excessValue: deposit - acceptedValue,
    nextSold: sold + low
  };
}

/** Enforces a cumulative, identity-scoped cap on accepted nanoTON only. */
function applyIdentityCap({ alreadyPurchased, acceptedValue, cap }) {
  requireNonNegative('alreadyPurchased', alreadyPurchased);
  requireNonNegative('acceptedValue', acceptedValue);
  requirePositive('cap', cap);
  if (alreadyPurchased > cap || acceptedValue > cap - alreadyPurchased) {
    throw new RangeError('identity purchase cap exceeded');
  }
  return alreadyPurchased + acceptedValue;
}

module.exports = { applyIdentityCap, linearBuyCost, quoteLinearBuy };
