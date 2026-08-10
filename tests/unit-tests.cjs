const assert = require('assert');
const { runSettlementTests } = require('./settlement.test.cjs');
const { runVerifierBoundaryTests } = require('./verifier-boundary.test.cjs');
const { runDeploymentConfigTests } = require('./deployment-config.test.cjs');
const { runGatewayClientTests } = require('./gateway-client.test.cjs');

// CommonJS test module imports
const { BondingCurveEngine } = require('../src/bonding-curve-cjs.cjs');

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

  runSettlementTests();
  runVerifierBoundaryTests();
  return runDeploymentConfigTests().then(runGatewayClientTests);

  console.log('\n🎉 All PrivaLaunch Unit Tests Passed Successfully!');
}

runTests().catch((error) => { console.error(error); process.exitCode = 1; });
