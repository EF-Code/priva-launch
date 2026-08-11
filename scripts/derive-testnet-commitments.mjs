#!/usr/bin/env node

/**
 * Print only public testnet policy commitments. The issuer secret is read from
 * the environment and is never included in the output.
 */

import { NullifierDeriver } from '../vendor/zk-tele-auth/dist/sdk/nullifier.js';
import { assertFieldElement } from '../vendor/zk-tele-auth/dist/sdk/poseidon.js';

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required.`);
  return value.trim();
}

const appDomain = required('PRIVA_APP_DOMAIN').toLowerCase();
const issuerSecret = required('PRIVA_ISSUER_SECRET');
if (!/^[1-9][0-9]*$/.test(issuerSecret)) throw new Error('PRIVA_ISSUER_SECRET must be a positive decimal field element.');
assertFieldElement(BigInt(issuerSecret), 'PRIVA_ISSUER_SECRET');

const launchId = required('PRIVA_LAUNCH_ID');
const launchIdHash = required('PRIVA_LAUNCH_ID_HASH');
if (!/^[1-9][0-9]*$/.test(launchIdHash)) throw new Error('PRIVA_LAUNCH_ID_HASH must be a positive decimal field element.');
assertFieldElement(BigInt(launchIdHash), 'PRIVA_LAUNCH_ID_HASH');

console.log(JSON.stringify({
  appDomain,
  appDomainHash: await NullifierDeriver.hashAppDomain(appDomain),
  issuerKeyHash: await NullifierDeriver.deriveIssuerKeyHash(issuerSecret),
  launchId,
  launchIdHash,
}, null, 2));
