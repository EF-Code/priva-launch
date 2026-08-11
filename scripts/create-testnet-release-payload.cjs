'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { canonicalJson } = require('./canonical-json.cjs');

const [initCandidate, runtimeCandidate, outputCandidate] = process.argv.slice(2);
if (!initCandidate || !runtimeCandidate || !outputCandidate) {
  throw new Error(
    'Usage: npm run create:testnet-payload -- deployment/testnet/reviewed-init.json deployment/testnet/reviewed-manifest.json deployment/testnet/reviewed-release-payload.json',
  );
}

const root = path.resolve(__dirname, '..');
function repoPath(candidate, label) {
  const resolved = path.resolve(root, candidate);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label} must stay within the repository.`);
  return resolved;
}

function readManifest(candidate, label) {
  const filePath = repoPath(candidate, label);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  if (value.network !== 'testnet' || value.status !== 'reviewed') throw new Error(`${label} must be a reviewed testnet manifest.`);
  if (typeof value.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceRevision)) {
    throw new Error(`${label}.sourceRevision must be a full lowercase Git SHA.`);
  }
  if (/(example\.invalid|testnet-address|eqtestnet|placeholder|fixture|todo)/i.test(fs.readFileSync(filePath, 'utf8'))) {
    throw new Error(`${label} contains a placeholder or fixture marker.`);
  }
  return { filePath, value };
}

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const init = readManifest(initCandidate, 'Initialization manifest');
const runtime = readManifest(runtimeCandidate, 'Runtime manifest');
if (init.value.sourceRevision !== runtime.value.sourceRevision) throw new Error('Manifest source revisions must match.');

const payload = {
  schemaVersion: 1,
  network: 'testnet',
  status: 'reviewed',
  sourceRevision: init.value.sourceRevision,
  initManifestSha256: digest(init.filePath),
  runtimeManifestSha256: digest(runtime.filePath),
};

const outputPath = repoPath(outputCandidate, 'output');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${canonicalJson(payload)}\n`, 'utf8');
console.log(JSON.stringify({ ...payload, outputPath: path.relative(root, outputPath) }, null, 2));
