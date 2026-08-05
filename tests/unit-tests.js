const assert = require('assert');

// CommonJS test module imports
const { BondingCurveEngine } = require('../src/bonding-curve-cjs.js');

function runTests() {
  console.log('🧪 Running PrivaLaunch Unit Test Suite...\n');

  // Test 1: Bonding Curve Price Calculation
  const price0 = BondingCurveEngine.getPricePerToken(0);
  const price85 = BondingCurveEngine.getPricePerToken(85);
  assert(price85 > price0);
  console.log('✅ Test 1 Passed: Bonding Curve Price Curve Mechanics');

  // Test 2: Graduation Percentage
  assert.strictEqual(BondingCurveEngine.getGraduationPercentage(0), 0);
  assert.strictEqual(BondingCurveEngine.getGraduationPercentage(42.5), 50);
  assert.strictEqual(BondingCurveEngine.getGraduationPercentage(85), 100);
  console.log('✅ Test 2 Passed: DeDust Graduation Progress Math');

  // Test 3: Buy Output Calculation
  const tokens = BondingCurveEngine.calculateBuyOutput(5, 0);
  assert(tokens > 0);
  console.log('✅ Test 3 Passed: Token Buy Output Calculator');

  console.log('\n🎉 All PrivaLaunch Unit Tests Passed Successfully!');
}

runTests();
