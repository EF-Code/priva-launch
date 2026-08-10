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

  assert.match(boundary, /PrivaPurchaseAuthPublicInputCount: int = 15/);
  assert.match(boundary, /PrivaPurchaseAuthBuyOperation: int = 1/);
  assert.match(boundary, /IdentityNullifier = 0/);
  assert.match(boundary, /CircuitVersion = 14/);
  assert.match(boundary, /DisabledUntilInlinedAuditedVerifier = 850/);
  assert.match(boundary, /throw PrivaPurchaseAuthVerifierBoundaryErrors\.DisabledUntilInlinedAuditedVerifier/);
  assert.doesNotMatch(boundary, /send\s*\(/);
  assert.doesNotMatch(boundary, /verifyProof\s*\(/);
  assert.match(docs, /3bb53a289f34bd2a3274fd8dccf0ec9d48da155b13c6c696f0f4f349f49bf1f3/);
  assert.match(docs, /\| 14 \| `circuitVersion`/);
  console.log('✅ Verifier boundary ABI and fail-closed guards');
}

module.exports = { runVerifierBoundaryTests };
