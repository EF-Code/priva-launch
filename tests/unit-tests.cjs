const assert = require('assert');
const { runSettlementTests } = require('./settlement.test.cjs');
const { runVerifierBoundaryTests } = require('./verifier-boundary.test.cjs');
const { runFixedSaleTests } = require('./fixed-sale.test.cjs');
const { runDeploymentConfigTests } = require('./deployment-config.test.cjs');
const { runGatewayClientTests } = require('./gateway-client.test.cjs');
const { runTestnetLifecycleBoundaryTests } = require('./testnet-lifecycle-boundary.test.cjs');
const { runSettlementMinterBoundaryTests } = require('./settlement-minter-boundary.test.cjs');
const { runTonTransactionTests } = require('./ton-transaction.test.cjs');
const { runIndexerClientTests } = require('./indexer-client.test.cjs');
const { runPurchaseFlowTests } = require('./purchase-flow.test.cjs');
const { execFileSync } = require('child_process');
const path = require('path');

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
  runFixedSaleTests();
  runTestnetLifecycleBoundaryTests();
  runSettlementMinterBoundaryTests();
  execFileSync('node', ['scripts/check-testnet-manifest.cjs', 'tests/fixtures/testnet-manifest.valid.json'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  execFileSync('node', ['scripts/check-testnet-init-manifest.cjs', 'tests/fixtures/testnet-init.valid.json'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  execFileSync('node', ['scripts/compile-testnet-init.cjs', 'tests/fixtures/testnet-init.valid.json'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  return runDeploymentConfigTests().then(runGatewayClientTests).then(runTonTransactionTests).then(runIndexerClientTests).then(runPurchaseFlowTests);

  console.log('\n🎉 All PrivaLaunch Unit Tests Passed Successfully!');
}

runTests().catch((error) => { console.error(error); process.exitCode = 1; });
