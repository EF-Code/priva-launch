const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runTestnetLifecycleBoundaryTests() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'priva_testnet_launchpad.tolk'), 'utf8');
  assert.match(source, /struct PrivaPendingMint/);
  assert.match(source, /pendingMints: map<uint64, Cell<PrivaPendingMint>>/);
  assert.match(source, /userRefunds: map<uint64, Cell<PrivaPendingMint>>/);
  assert.match(source, /emitTep74Mint/);
  assert.match(source, /BounceMode\.RichBounce/);
  assert.match(source, /fun onBouncedMessage/);
  assert.match(source, /fun claimRefund/);
  assert.match(source, /msg\.maxValue >= terms\.mintMessageValueNanoTon/);
  assert.match(source, /policy: Cell<PrivaTestnetLaunchpadPolicy>/);
  assert.doesNotMatch(source, /ConfigureLaunchpad|setPolicy|changeAdmin/);
  console.log('✅ Testnet lifecycle source guards passed');
}

module.exports = { runTestnetLifecycleBoundaryTests };
