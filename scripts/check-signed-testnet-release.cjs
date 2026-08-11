'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { canonicalJson } = require('./canonical-json.cjs');

const candidate = process.argv[2];
if (!candidate) {
  throw new Error('Usage: npm run check:testnet-signatures -- deployment/testnet/reviewed-release.json');
}

const root = path.resolve(__dirname, '..');
const envelopePath = path.resolve(root, candidate);
if (!envelopePath.startsWith(`${root}${path.sep}`)) {
  throw new Error('Signed release envelope must stay within the repository.');
}

const sha256Pattern = /^[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const httpsUrl = /^https:\/\//;
const bannedPlaceholder = /(example\.invalid|testnet-address|eqtestnet|placeholder|fixture|todo)/i;

function fail(message) {
  throw new Error(message);
}

function readJson(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') fail(`${label} does not exist: ${filePath}`);
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(`${label} must be a JSON object.`);
  return parsed;
}

function resolveRepoPath(relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '' || path.isAbsolute(relativePath)) {
    fail(`${label} must be a repository-relative path.`);
  }
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) fail(`${label} escapes the repository.`);
  if (!fs.existsSync(resolved)) fail(`${label} does not exist: ${relativePath}`);
  return resolved;
}

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function requireSha(label, value) {
  if (!sha256Pattern.test(value || '')) fail(`${label} must be a lowercase SHA-256 digest.`);
}

function requireRevision(label, value) {
  if (!revisionPattern.test(value || '')) fail(`${label} must be a full lowercase Git SHA.`);
}

function assertNoPlaceholders(label, filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (bannedPlaceholder.test(text)) fail(`${label} contains a placeholder or fixture marker.`);
}

function parseKeyFingerprints(keyPath) {
  const output = execFileSync(
    'gpg',
    ['--batch', '--no-options', '--with-colons', '--show-keys', keyPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return output
    .split('\n')
    .filter((line) => line.startsWith('fpr:'))
    .map((line) => line.split(':')[9].toUpperCase())
    .filter(Boolean);
}

function verifyDetachedSignature({ home, keyPath, signaturePath, signedPath, label, allowedFingerprints }) {
  execFileSync(
    'gpg',
    [
      '--batch',
      '--no-options',
      '--no-auto-check-trustdb',
      '--trust-model',
      'always',
      '--homedir',
      home,
      '--import',
      keyPath,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  let status;
  try {
    status = execFileSync(
      'gpg',
      [
        '--batch',
        '--no-options',
        '--no-auto-check-trustdb',
        '--trust-model',
        'always',
        '--homedir',
        home,
        '--status-fd',
        '1',
        '--verify',
        signaturePath,
        signedPath,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    fail(`${label} signature verification failed: ${error.stderr?.toString().trim() || error.message}`);
  }
  const valid = status
    .split('\n')
    .find((line) => line.startsWith('[GNUPG:] VALIDSIG '));
  if (!valid) fail(`${label} did not produce a VALIDSIG record.`);
  const fingerprint = valid.split(' ')[2]?.toUpperCase();
  if (!allowedFingerprints.includes(fingerprint)) {
    fail(`${label} was signed by an unexpected key (${fingerprint || 'unknown'}).`);
  }
}

const envelope = readJson(envelopePath, 'Signed release envelope');
if (envelope.schemaVersion !== 1) fail('Signed release envelope schemaVersion must be 1.');
if (envelope.network !== 'testnet') fail('Signed release envelope network must be testnet.');
if (envelope.status !== 'reviewed') fail('Signed release envelope status must be reviewed.');
requireRevision('sourceRevision', envelope.sourceRevision);

const payloadPath = resolveRepoPath(envelope.payloadPath, 'payloadPath');
const initPath = resolveRepoPath(envelope.initManifestPath, 'initManifestPath');
const runtimePath = resolveRepoPath(envelope.runtimeManifestPath, 'runtimeManifestPath');
requireSha('payloadSha256', envelope.payloadSha256);
requireSha('initManifestSha256', envelope.initManifestSha256);
requireSha('runtimeManifestSha256', envelope.runtimeManifestSha256);

if (digest(payloadPath) !== envelope.payloadSha256) fail('payloadSha256 does not match the payload file.');
if (digest(initPath) !== envelope.initManifestSha256) fail('initManifestSha256 does not match the initialization manifest.');
if (digest(runtimePath) !== envelope.runtimeManifestSha256) fail('runtimeManifestSha256 does not match the runtime manifest.');

const payload = readJson(payloadPath, 'Signed release payload');
if (canonicalJson(payload) !== fs.readFileSync(payloadPath, 'utf8').trim()) {
  fail('Signed release payload is not in canonical compact JSON form.');
}
if (payload.network !== 'testnet' || payload.status !== 'reviewed') fail('Signed release payload must be reviewed testnet metadata.');
if (payload.sourceRevision !== envelope.sourceRevision) fail('Payload sourceRevision does not match the envelope.');
if (payload.initManifestSha256 !== envelope.initManifestSha256) fail('Payload initManifestSha256 does not match the envelope.');
if (payload.runtimeManifestSha256 !== envelope.runtimeManifestSha256) fail('Payload runtimeManifestSha256 does not match the envelope.');

const initManifest = readJson(initPath, 'Initialization manifest');
const runtimeManifest = readJson(runtimePath, 'Runtime manifest');
for (const [label, manifest] of [['Initialization manifest', initManifest], ['Runtime manifest', runtimeManifest]]) {
  if (manifest.network !== 'testnet') fail(`${label} network must be testnet.`);
  if (manifest.status !== 'reviewed') fail(`${label} status must be reviewed.`);
  if (manifest.sourceRevision !== envelope.sourceRevision) fail(`${label} sourceRevision does not match the envelope.`);
}
assertNoPlaceholders('Initialization manifest', initPath);
assertNoPlaceholders('Runtime manifest', runtimePath);

if (!Array.isArray(envelope.approvals) || envelope.approvals.length < 2) {
  fail('At least two signed independent approvals are required.');
}

const reviewers = new Set();
const roles = new Set();
const temporaryHomes = [];
try {
  for (const [index, approval] of envelope.approvals.entries()) {
    const label = `Approval ${index + 1}`;
    if (!approval || typeof approval !== 'object') fail(`${label} must be an object.`);
    for (const field of ['reviewer', 'role', 'reviewedCommit', 'decision', 'evidenceUrl', 'publicKeyFingerprint', 'reviewedAt']) {
      if (typeof approval[field] !== 'string' || approval[field].trim() === '') fail(`${label} is missing ${field}.`);
    }
    if (reviewers.has(approval.reviewer)) fail(`Duplicate reviewer identity: ${approval.reviewer}.`);
    if (roles.has(approval.role)) fail(`Approval roles must be independent; duplicate role: ${approval.role}.`);
    reviewers.add(approval.reviewer);
    roles.add(approval.role);
    if (approval.reviewedCommit !== envelope.sourceRevision) fail(`${label} reviewedCommit does not match sourceRevision.`);
    if (approval.decision !== 'approved-for-testnet-only') fail(`${label} must be approved-for-testnet-only.`);
    if (!httpsUrl.test(approval.evidenceUrl) || bannedPlaceholder.test(approval.evidenceUrl)) fail(`${label} evidenceUrl must be a real HTTPS URL.`);
    if (Number.isNaN(Date.parse(approval.reviewedAt))) fail(`${label} reviewedAt must be ISO-8601.`);
    if (approval.manifestPayloadSha256 !== envelope.payloadSha256) fail(`${label} manifestPayloadSha256 does not match payloadSha256.`);
    requireSha(`${label}.reportSha256`, approval.reportSha256);

    const reportPath = resolveRepoPath(approval.reportPath, `${label}.reportPath`);
    const reportSignaturePath = resolveRepoPath(approval.reportSignaturePath, `${label}.reportSignaturePath`);
    const payloadSignaturePath = resolveRepoPath(approval.payloadSignaturePath, `${label}.payloadSignaturePath`);
    const publicKeyPath = resolveRepoPath(approval.publicKeyPath, `${label}.publicKeyPath`);
    if (digest(reportPath) !== approval.reportSha256) fail(`${label} reportSha256 does not match the report file.`);

    const fingerprints = parseKeyFingerprints(publicKeyPath);
    if (fingerprints.length === 0) fail(`${label} public key has no fingerprint.`);
    const declaredFingerprint = approval.publicKeyFingerprint.replace(/\s+/g, '').toUpperCase();
    if (!fingerprints.includes(declaredFingerprint)) fail(`${label} declared fingerprint does not match its public key.`);

    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'priva-release-gpg-'));
    temporaryHomes.push(home);
    verifyDetachedSignature({
      home,
      keyPath: publicKeyPath,
      signaturePath: reportSignaturePath,
      signedPath: reportPath,
      label: `${label} report`,
      allowedFingerprints: fingerprints,
    });
    verifyDetachedSignature({
      home,
      keyPath: publicKeyPath,
      signaturePath: payloadSignaturePath,
      signedPath: payloadPath,
      label: `${label} payload`,
      allowedFingerprints: fingerprints,
    });
  }
} catch (error) {
  if (error.code === 'ENOENT' || error.code === 'EACCES') fail(`gpg is required for signed approval verification: ${error.message}`);
  throw error;
} finally {
  for (const home of temporaryHomes) fs.rmSync(home, { recursive: true, force: true });
}

console.log(`✓ Signed reviewed testnet release verified (${envelope.sourceRevision})`);
