const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const root = path.join(__dirname, '..');
const requireFromZk = createRequire(path.join(root, 'vendor', 'zk-tele-auth', 'package.json'));
const { compileFunc } = requireFromZk('@ton-community/func-js');
const { Cell } = require('@ton/core');

const sourcePath = path.join(root, 'contracts', 'priva_settlement_minter.fc');
const upstreamDir = path.join(root, 'vendor', 'ton-token-contract', 'contracts');
const outputPath = path.join(root, 'build', 'priva_settlement_minter.json');
const codeBocPath = path.join(root, 'build', 'priva_settlement_minter.boc');
const lockPath = path.join(root, 'contracts', 'vendor', 'settlement-minter.lock.json');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readSources() {
  const sources = {};
  for (const name of fs.readdirSync(upstreamDir).filter((entry) => entry.endsWith('.fc'))) {
    sources[name] = fs.readFileSync(path.join(upstreamDir, name), 'utf8');
  }
  sources['priva_settlement_minter.fc'] = fs.readFileSync(sourcePath, 'utf8');
  return sources;
}

async function main() {
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing source: ${sourcePath}`);
  if (!fs.existsSync(upstreamDir)) throw new Error(`Missing pinned upstream contracts: ${upstreamDir}`);

  const sources = readSources();
  const result = await compileFunc({ targets: ['priva_settlement_minter.fc'], sources });
  if (result.status === 'error') throw new Error(result.message);

  const code = Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  const upstreamSource = fs.readFileSync(path.join(upstreamDir, 'jetton-minter.fc'));
  const sourceSha256 = sha256(fs.readFileSync(sourcePath));
  const upstreamSha256 = sha256(upstreamSource);
  const artifact = {
    contract: 'priva_settlement_minter',
    language: 'func',
    source: 'contracts/priva_settlement_minter.fc',
    sourceSha256,
    upstream: {
      repository: 'https://github.com/ton-blockchain/jetton-contract.git',
      revision: 'd55f228edb0eb477cb4845d67e0dacc6489c6b57',
      source: 'vendor/ton-token-contract/contracts/jetton-minter.fc',
      sourceSha256: upstreamSha256,
    },
    callback: {
      opcode: '0x50525646',
      fields: ['query_id:uint64', 'jetton_amount:Coins'],
      responseMustEqualAdmin: true,
      upgradeDisabled: true,
    },
    compiler: '@ton-community/func-js@0.11.0',
    codeBoc64: result.codeBoc,
    codeCellHash: code.hash().toString('hex'),
    codeCellHashBase64: code.hash().toString('base64'),
  };

  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (lock.sourceSha256 !== artifact.sourceSha256) throw new Error('Settlement-minter lock sourceSha256 does not match the checked-in source. Review and update the lock before compiling.');
    if (lock.upstream?.revision !== artifact.upstream.revision || lock.upstream?.sourceSha256 !== artifact.upstream.sourceSha256) throw new Error('Settlement-minter lock does not match the pinned upstream source.');
    if (lock.codeCellHash && lock.codeCellHash !== artifact.codeCellHash) throw new Error('Settlement-minter lock codeCellHash does not match the compiler output.');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  fs.writeFileSync(codeBocPath, Buffer.from(result.codeBoc, 'base64'));
  console.log(`compiled ${artifact.contract}`);
  console.log(`codeCellHash=${artifact.codeCellHash}`);
  console.log(`artifact=${path.relative(root, outputPath)}`);
  console.log(`codeBoc=${path.relative(root, codeBocPath)}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
