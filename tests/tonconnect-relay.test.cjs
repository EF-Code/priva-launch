const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runTonConnectRelayTests() {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'tonconnect-manifest.json'), 'utf8'));
  assert.match(manifest.url, /^https:\/\//);
  assert.match(manifest.iconUrl, /^https:\/\//);
  assert.ok(fs.existsSync(path.join(root, 'public', 'icon.png')));

  const relay = fs.readFileSync(path.join(root, 'scripts', 'tonconnect-https-relay.mjs'), 'utf8');
  assert.match(relay, /https\.createServer/);
  assert.match(relay, /server\.listen\(port, '127\.0\.0\.1'/);
  assert.match(relay, /https:\/\/127\.0\.0\.1/);
  assert.doesNotMatch(relay, /net\.send/);

  const probe = fs.readFileSync(path.join(root, 'scripts', 'tonconnect_probe.tolk'), 'utf8');
  assert.match(probe, /promptWallet/);
  assert.doesNotMatch(probe, /net\.send/);

  const cert = fs.readFileSync(path.join(root, 'scripts', 'setup-tonconnect-dev-cert.mjs'), 'utf8');
  assert.match(cert, /--install-nss/);
  assert.match(cert, /--remove-nss/);
  assert.doesNotMatch(cert, /public|dist|build\//);
  console.log('✓ TON Connect manifest and loopback relay boundaries passed');
}

module.exports = { runTonConnectRelayTests };
