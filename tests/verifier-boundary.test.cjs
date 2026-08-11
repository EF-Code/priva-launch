const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runVerifierBoundaryTests() {
  const root = path.join(__dirname, '..');
  const boundary = fs.readFileSync(
    path.join(root, 'contracts', 'priva_purchase_auth_verifier_boundary.tolk'),
    'utf8',
  );
  const docs = fs.readFileSync(
    path.join(root, 'docs', 'PRIVA_PURCHASE_AUTH_VERIFIER_BOUNDARY.md'),
    'utf8',
  );

  assert.match(boundary, /PrivaPurchaseAuthPublicInputCount: int = 17/);
  assert.match(boundary, /PrivaPurchaseAuthBuyOperation: int = 1/);
  assert.match(boundary, /IdentityNullifier = 0/);
  assert.match(boundary, /LaunchpadAddressHi = 9/);
  assert.match(boundary, /RecipientAddressLo = 13/);
  assert.match(boundary, /CircuitVersion = 16/);
  assert.match(boundary, /import "@zk_tele_auth\/priva_purchase_auth_verifier"/);
  assert.match(boundary, /contract PrivaPurchaseAuthVerifierBoundary/);
  assert.match(boundary, /PrivaPurchaseAuthVerifier\.create\(\)\.verifyProof\(msg\)/);
  assert.doesNotMatch(boundary, /DisabledUntilInlinedAuditedVerifier = 850/);
  assert.doesNotMatch(boundary, /throw PrivaPurchaseAuthVerifierBoundaryErrors\.DisabledUntilInlinedAuditedVerifier/);
  assert.doesNotMatch(boundary, /send\s*\(/);
  assert.match(boundary, /stateless, testnet-only proof-checking candidate/);
  assert.match(docs, /7454d4f4663b455dd2753dec56acabce5bb662a89a50dc22d22d6c07ad5121e4/);
  assert.match(docs, /bde50de738c19ff675d19d09e611aae50247e1658df798b520313acc076466ae/);
  assert.match(docs, /\| 16 \| `circuitVersion`/);
  assert.match(docs, /purchase\s+authorizer/);
  console.log('✅ Verifier boundary ABI, synchronous proof check, and authorization guard');
}

module.exports = { runVerifierBoundaryTests };
