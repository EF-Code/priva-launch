const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REQUIRED_DOCUMENTS = [
  'docs/PROTOCOL_SPEC.md',
  'docs/CONTRACT_ARCHITECTURE.md',
  'docs/ZK_TELE_AUTH_INTEGRATION.md',
  'docs/DEDUST_ADAPTER_CONTRACT.md',
  'docs/WALLET_AND_CHAIN_INTEGRATION.md',
  'docs/GATEWAY_AND_INDEXER_SERVICE.md',
  'docs/TEST_STRATEGY.md',
  'docs/GOVERNANCE_AND_EMERGENCY_CONTROL.md',
  'docs/OPERATIONS_AND_INCIDENT_RESPONSE.md'
];

const REQUIRED_EVIDENCE = {
  'zk-priva-purchase-auth-audit': 'evidence/zk-priva-purchase-auth-audit.md',
  'testnet-lifecycle-traces': 'evidence/testnet-lifecycle-traces.md',
  'independent-contract-audit': 'evidence/independent-contract-audit.md',
  'operations-readiness': 'evidence/operations-readiness.md'
};

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_REVISION = /^[a-f0-9]{40}$/;

function readJson(filePath, label, failures) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${label} is invalid JSON: ${error.message}`);
    return null;
  }
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function currentRevision(projectRoot, failures) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (error) {
    failures.push(`cannot resolve the release-candidate Git revision: ${error.message}`);
    return null;
  }
}

function safeEvidencePath(projectRoot, relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) return null;
  const resolved = path.resolve(projectRoot, relativePath);
  return resolved.startsWith(`${projectRoot}${path.sep}`) ? resolved : null;
}

function checkReleaseReadiness(projectRoot = path.join(__dirname, '..')) {
  const failures = [];
  for (const document of REQUIRED_DOCUMENTS) {
    if (!fs.existsSync(path.join(projectRoot, document))) failures.push(`missing required document: ${document}`);
  }

  const revision = currentRevision(projectRoot, failures);
  const manifestPath = path.join(projectRoot, 'deployment', 'reviewed-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    failures.push('missing reviewed deployment manifest: deployment/reviewed-manifest.json');
  } else {
    const manifest = readJson(manifestPath, 'deployment manifest', failures);
    if (manifest) {
      for (const field of ['version', 'factoryAddress', 'issuerKeyHash']) {
        if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') failures.push(`deployment manifest is missing ${field}`);
      }
      if (manifest.network !== 'mainnet') failures.push('deployment manifest network must be mainnet');
      if (manifest.mainnetApproved !== true) failures.push('deployment manifest is not explicitly mainnet approved');
      if (!GIT_REVISION.test(manifest.sourceRevision || '')) failures.push('deployment manifest sourceRevision must be a full Git commit hash');
      if (revision && manifest.sourceRevision !== revision) failures.push('deployment manifest sourceRevision does not match HEAD');
      if (!manifest.codeHashes || typeof manifest.codeHashes !== 'object' || Array.isArray(manifest.codeHashes) || Object.keys(manifest.codeHashes).length === 0) {
        failures.push('deployment manifest must include non-empty codeHashes');
      } else {
        for (const [name, hash] of Object.entries(manifest.codeHashes)) {
          if (!SHA256.test(hash || '')) failures.push(`deployment manifest codeHashes.${name} must be a SHA-256 digest`);
        }
      }
      if (!SHA256.test(manifest.issuerKeyHash || '')) failures.push('deployment manifest issuerKeyHash must be a SHA-256 digest');
      if (!manifest.circuit || typeof manifest.circuit !== 'object' || manifest.circuit.version !== 1 || !SHA256.test(manifest.circuit.verificationKeyHash || '') || !SHA256.test(manifest.circuit.artifactHash || '')) {
        failures.push('deployment manifest circuit must pin version 1 plus verificationKeyHash and artifactHash SHA-256 digests');
      }
    }
  }

  const indexPath = path.join(projectRoot, 'evidence', 'release-evidence.json');
  if (!fs.existsSync(indexPath)) {
    failures.push('missing release evidence index: evidence/release-evidence.json');
  } else {
    const index = readJson(indexPath, 'release evidence index', failures);
    if (index) {
      if (index.schemaVersion !== 1) failures.push('release evidence index schemaVersion must be 1');
      if (!GIT_REVISION.test(index.sourceRevision || '')) failures.push('release evidence index sourceRevision must be a full Git commit hash');
      if (revision && index.sourceRevision !== revision) failures.push('release evidence index sourceRevision does not match HEAD');
      const entries = new Map(Array.isArray(index.artifacts) ? index.artifacts.map((entry) => [entry.id, entry]) : []);
      for (const [id, expectedPath] of Object.entries(REQUIRED_EVIDENCE)) {
        const entry = entries.get(id);
        if (!entry) {
          failures.push(`release evidence index is missing ${id}`);
          continue;
        }
        if (entry.path !== expectedPath) failures.push(`release evidence ${id} must reference ${expectedPath}`);
        const evidencePath = safeEvidencePath(projectRoot, entry.path);
        if (!evidencePath || !fs.existsSync(evidencePath)) {
          failures.push(`missing release evidence: ${expectedPath}`);
          continue;
        }
        if (!SHA256.test(entry.sha256 || '')) failures.push(`release evidence ${id} must include a SHA-256 digest`);
        else if (hashFile(evidencePath) !== entry.sha256) failures.push(`release evidence ${id} digest does not match ${entry.path}`);
        if (typeof entry.reviewer !== 'string' || entry.reviewer.trim() === '') failures.push(`release evidence ${id} must identify its reviewer`);
        if (typeof entry.reviewedAt !== 'string' || Number.isNaN(Date.parse(entry.reviewedAt))) failures.push(`release evidence ${id} must include an ISO-8601 reviewedAt timestamp`);
      }
    }
  }

  return failures;
}

if (require.main === module) {
  const failures = checkReleaseReadiness();
  if (failures.length > 0) {
    console.error('Release readiness: BLOCKED');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('Release readiness: PASS');
  }
}

module.exports = { checkReleaseReadiness };
