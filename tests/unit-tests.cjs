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
const { runTestnetReleasePolicyTests } = require('./testnet-release-policy.test.cjs');
const { runTonConnectRelayTests } = require('./tonconnect-relay.test.cjs');
const { execFileSync } = require('child_process');
const path = require('path');

async function runTests() {
  console.log('🧪 Running PrivaLaunch Unit Test Suite...\n');

  runSettlementTests();
  runVerifierBoundaryTests();
  runFixedSaleTests();
  runTestnetLifecycleBoundaryTests();
  runSettlementMinterBoundaryTests();
  runTonConnectRelayTests();
  execFileSync('node', ['scripts/check-testnet-manifest.cjs', 'tests/fixtures/testnet-manifest.valid.json'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  execFileSync('node', ['scripts/check-testnet-init-manifest.cjs', 'tests/fixtures/testnet-init.valid.json'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  execFileSync('node', ['scripts/compile-testnet-init.cjs', 'tests/fixtures/testnet-init.valid.json'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  runTestnetReleasePolicyTests();
  await runDeploymentConfigTests();
  await runGatewayClientTests();
  await runTonTransactionTests();
  await runIndexerClientTests();
  await runPurchaseFlowTests();

  console.log('\n🎉 All PrivaLaunch Unit Tests Passed Successfully!');
}

runTests().catch((error) => { console.error(error); process.exitCode = 1; });
