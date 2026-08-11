const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runSettlementMinterBoundaryTests() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'priva_settlement_minter.fc'), 'utf8');
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'vendor', 'settlement-minter.lock.json'), 'utf8'));
  const handoff = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'handoff_testnet_settlement_minter.tolk'), 'utf8');
  assert.match(source, /0x50525646/);
  assert.match(source, /\.store_uint\(query_id, 64\)/);
  assert.match(source, /\.store_coins\(jetton_amount\)/);
  assert.match(source, /admin_locked/);
  assert.match(source, /0xfffffffe/);
  assert.match(source, /skip_bounced_prefix/);
  assert.match(source, /SEND_MODE_PAY_FEES_SEPARATELY \| SEND_MODE_BOUNCE_ON_ACTION_FAIL/);
  assert.match(source, /if \(op == op::upgrade\)[\s\S]*throw\(error::not_owner\)/);
  assert.equal(lock.callback.destination, 'locked admin address');
  assert.equal(lock.callback.upgrade, 'disabled');
  assert.match(handoff, /MINTER_CHANGE_ADMIN_OPCODE: int = 0x6501f354/);
  assert.match(handoff, /PrivaClaimMinterAdmin/);
  assert.match(handoff, /PRIVA_DEPLOY_NETWORK/);
  assert.match(handoff, /walletName\.hash\(\) != "tonconnect"\.hash\(\)/);
  assert.match(handoff, /get_next_admin_address/);
  assert.match(handoff, /scripts\.isContractDeployed\(minterAddress\)/);
  assert.match(handoff, /scripts\.isContractDeployed\(launchpadAddress\)/);
  assert.match(handoff, /changeQueryId == 0 \|\| claimQueryId == 0 \|\| changeQueryId == claimQueryId/);
  assert.match(handoff, /changeValue < MINTER_MIN_HANDOFF_VALUE \|\| claimValue < MINTER_MIN_HANDOFF_VALUE/);
  console.log('✅ Settlement minter source and lock boundary tests passed');
}

module.exports = { runSettlementMinterBoundaryTests };
