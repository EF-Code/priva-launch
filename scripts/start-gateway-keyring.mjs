#!/usr/bin/env node

/**
 * Start the loopback gateway with credentials read from GNOME Secret Service.
 * Secrets are passed only through the child process environment and are never
 * printed, persisted, or accepted as command-line arguments.
 */

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = process.env.PRIVA_POLICY_FILE?.trim() || path.join(process.env.XDG_STATE_HOME || path.join(process.env.HOME || '', '.local', 'state'), 'priva', 'testnet-policy.env');

function readSecret(item) {
  try {
    const value = execFileSync('secret-tool', ['lookup', 'service', 'priva-launch', 'item', item], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!value) throw new Error(`secret-tool returned no value for ${item}`);
    return value;
  } catch {
    throw new Error(`Missing keyring item ${item}; store it with secret-tool before starting the gateway.`);
  }
}

function loadPolicy() {
  if (!fs.existsSync(policyPath)) throw new Error(`Missing local policy file ${policyPath}.`);
  const policy = {};
  for (const line of fs.readFileSync(policyPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) throw new Error(`Invalid policy line in ${policyPath}.`);
    const name = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !value) throw new Error(`Invalid policy entry ${name || '(empty)'}.`);
    policy[name] = value;
  }
  for (const name of ['PRIVA_APP_DOMAIN', 'PRIVA_LAUNCH_ID', 'PRIVA_LAUNCH_ID_HASH']) {
    if (!policy[name]) throw new Error(`Policy file is missing ${name}.`);
  }
  return policy;
}

const env = { ...process.env, ...loadPolicy() };
env.PRIVA_GATEWAY_MODE = 'local';
env.PRIVA_GATEWAY_HOST = '127.0.0.1';
env.TELEGRAM_BOT_TOKEN = readSecret('telegram-bot-token');
env.PRIVA_ISSUER_SECRET = readSecret('issuer-secret');

const child = spawn(process.execPath, [path.join(root, 'services', 'local-gateway.mjs')], {
  cwd: root,
  env,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
