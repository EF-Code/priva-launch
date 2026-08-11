'use strict';

/**
 * Small deterministic JSON serializer for release payloads.
 *
 * Release payloads intentionally use strings for large integers. This helper
 * sorts object keys recursively, preserves array order, and emits compact
 * UTF-8 JSON. It is not a general-purpose JSON canonicalization library; the
 * payload schema must continue to forbid ambiguous numeric representations.
 */
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

if (require.main === module) {
  const fs = require('fs');
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node scripts/canonical-json.cjs <json-file>');
  const value = JSON.parse(fs.readFileSync(input, 'utf8'));
  process.stdout.write(`${canonicalJson(value)}\n`);
}

module.exports = { canonicalJson, normalize };
