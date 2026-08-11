const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { canonicalJson } = require('../scripts/canonical-json.cjs');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(filePath, value, { canonical = false } = {}) {
  const text = canonical ? `${canonicalJson(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, text, 'utf8');
}

function runTestnetReleasePolicyTests() {
  const root = path.join(__dirname, '..');
  const tempDir = fs.mkdtempSync(path.join(__dirname, '.tmp-solo-release-'));
  try {
    const sourceRevision = 'a'.repeat(40);
    const initPath = path.join(tempDir, 'init.json');
    const runtimePath = path.join(tempDir, 'runtime.json');
    const payloadPath = path.join(tempDir, 'payload.json');
    const envelopePath = path.join(tempDir, 'release.json');
    writeJson(initPath, { network: 'testnet', status: 'reviewed', sourceRevision });
    writeJson(runtimePath, { network: 'testnet', status: 'reviewed', sourceRevision });

    const initManifestSha256 = sha256(initPath);
    const runtimeManifestSha256 = sha256(runtimePath);
    writeJson(payloadPath, {
      schemaVersion: 1,
      network: 'testnet',
      status: 'reviewed',
      sourceRevision,
      initManifestSha256,
      runtimeManifestSha256,
    }, { canonical: true });

    const payloadSha256 = sha256(payloadPath);
    writeJson(envelopePath, {
      schemaVersion: 1,
      network: 'testnet',
      status: 'reviewed',
      sourceRevision,
      payloadPath: path.relative(root, payloadPath),
      initManifestPath: path.relative(root, initPath),
      runtimeManifestPath: path.relative(root, runtimePath),
      payloadSha256,
      initManifestSha256,
      runtimeManifestSha256,
      approvalMode: 'solo-owner-attested',
      ownerAttestation: {
        owner: 'solo-owner',
        role: 'release-owner',
        reviewedCommit: sourceRevision,
        decision: 'approved-for-testnet-only',
        reviewedAt: '2026-08-11T00:00:00Z',
        manifestPayloadSha256: payloadSha256,
        initManifestSha256,
        runtimeManifestSha256,
        statement: 'I reviewed this exact release payload and both manifests for testnet-only use.',
      },
    });

    try {
      execFileSync('node', ['scripts/check-signed-testnet-release.cjs', path.relative(root, envelopePath)], {
        cwd: root,
        stdio: 'inherit',
      });
    } catch (error) {
      assert.fail(error.stderr?.toString() || error.message);
    }
    console.log('✅ Solo-owner testnet release attestation checks passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { runTestnetReleasePolicyTests };
