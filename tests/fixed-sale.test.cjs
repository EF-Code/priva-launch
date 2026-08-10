const assert = require('assert');
const { quoteFixedPriceBuy } = require('../src/protocol/fixed-sale.cjs');

function runFixedSaleTests() {
  const price = 85n;
  const exact = quoteFixedPriceBuy({ deposit: 850n, soldUnits: 0n, totalSaleUnits: 1_000_000_000n, priceNanoTonPerSaleUnit: price });
  assert.deepStrictEqual(exact, { saleUnits: 10n, acceptedValue: 850n, excessValue: 0n, nextSoldUnits: 10n });
  const partial = quoteFixedPriceBuy({ deposit: 899n, soldUnits: 0n, totalSaleUnits: 1_000_000_000n, priceNanoTonPerSaleUnit: price });
  assert.equal(partial.saleUnits, 10n); assert.equal(partial.excessValue, 49n);
  const final = quoteFixedPriceBuy({ deposit: 1_000n, soldUnits: 999_999_995n, totalSaleUnits: 1_000_000_000n, priceNanoTonPerSaleUnit: price });
  assert.equal(final.saleUnits, 5n); assert.equal(final.acceptedValue, 425n); assert.equal(final.excessValue, 575n);
  assert.throws(() => quoteFixedPriceBuy({ deposit: 1n, soldUnits: 2n, totalSaleUnits: 1n, priceNanoTonPerSaleUnit: price }), /cannot exceed/);
  console.log('✅ Fixed-price sale tests passed: exact settlement and terminal refund');
}

module.exports = { runFixedSaleTests };
