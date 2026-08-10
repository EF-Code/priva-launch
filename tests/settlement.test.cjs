const assert = require('assert');
const {
  applyIdentityCap,
  linearBuyCost,
  quoteLinearBuy
} = require('../src/protocol/settlement.cjs');

function runSettlementTests() {
  const curve = { basePrice: 5n, slope: 2n };

  assert.strictEqual(
    linearBuyCost({ sold: 3n, quantity: 2n, ...curve }),
    24n,
    'cost must sum prices at sold and sold + 1'
  );

  const quote = quoteLinearBuy({ sold: 0n, maxSupply: 10n, deposit: 20n, ...curve });
  assert.deepStrictEqual(quote, {
    tokenAmount: 2n,
    acceptedValue: 12n,
    excessValue: 8n,
    nextSold: 2n
  });
  assert(linearBuyCost({ sold: 0n, quantity: quote.tokenAmount + 1n, ...curve }) > 20n);

  const supplyBounded = quoteLinearBuy({ sold: 9n, maxSupply: 10n, deposit: 1000n, ...curve });
  assert.strictEqual(supplyBounded.tokenAmount, 1n);
  assert.strictEqual(supplyBounded.nextSold, 10n);

  assert.strictEqual(applyIdentityCap({ alreadyPurchased: 4n, acceptedValue: 6n, cap: 10n }), 10n);
  assert.throws(
    () => applyIdentityCap({ alreadyPurchased: 4n, acceptedValue: 7n, cap: 10n }),
    /cap exceeded/
  );

  console.log('✅ Settlement reference tests passed: integer quote, supply bound, cumulative cap');
}

module.exports = { runSettlementTests };
