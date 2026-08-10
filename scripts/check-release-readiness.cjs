const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const requiredDocuments = [
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

const failures = [];
for (const document of requiredDocuments) {
  if (!fs.existsSync(path.join(projectRoot, document))) failures.push(`missing required document: ${document}`);
}

const manifestPath = path.join(projectRoot, 'deployment', 'reviewed-manifest.json');
if (!fs.existsSync(manifestPath)) {
  failures.push('missing reviewed deployment manifest: deployment/reviewed-manifest.json');
} else {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const field of ['version', 'network', 'factoryAddress', 'codeHashes', 'circuitVersion', 'issuerKeyHash']) {
      if (!manifest[field]) failures.push(`deployment manifest is missing ${field}`);
    }
    if (manifest.mainnetApproved !== true) failures.push('deployment manifest is not explicitly mainnet approved');
  } catch (error) {
    failures.push(`deployment manifest is invalid JSON: ${error.message}`);
  }
}

// These evidence paths are intentionally absent until real artifacts exist.
for (const evidence of [
  'evidence/zk-priva-purchase-auth-audit.md',
  'evidence/testnet-lifecycle-traces.md',
  'evidence/independent-contract-audit.md',
  'evidence/operations-readiness.md'
]) {
  if (!fs.existsSync(path.join(projectRoot, evidence))) failures.push(`missing release evidence: ${evidence}`);
}

if (failures.length > 0) {
  console.error('Release readiness: BLOCKED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Release readiness: PASS');
}
