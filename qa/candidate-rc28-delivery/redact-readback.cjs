'use strict';
const fs = require('node:fs'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const input = path.join(__dirname, 'version-readback-private.json');
const raw = fs.readFileSync(input), record = JSON.parse(raw);
const expected = JSON.parse(fs.readFileSync(path.join(__dirname,'deployment.json'),'utf8')).workerVersion;
assert.equal(record.id, expected);
const expectedTypes = {
  ACCOUNT_KEY: 'secret_text', ASSETS: 'assets', AUTH_DIAGNOSTICS: 'plain_text',
  AUTH_ENABLED: 'plain_text', AUTH_HMAC_KEY: 'secret_text',
  AUTH_OBJECTS: 'durable_object_namespace', CANDIDATE_DRIVE_WRITES_ENABLED: 'plain_text',
  CREDENTIAL_ENCRYPTION_KEY_V1: 'secret_text', GOOGLE_CLIENT_ID: 'plain_text',
  GOOGLE_CLIENT_SECRET: 'secret_text', PUBLIC_ORIGIN: 'plain_text'
};
const flags = { AUTH_ENABLED: 'true', AUTH_DIAGNOSTICS: 'true', CANDIDATE_DRIVE_WRITES_ENABLED: 'false' };
assert.deepEqual(record.resources.bindings.map(b => b.name).sort(), Object.keys(expectedTypes).sort());
const bindings = Object.entries(expectedTypes).map(([name, type]) => {
  const matches = record.resources.bindings.filter(b => b.name === name);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].type, type);
  if (name in flags) assert.equal(matches[0].text, flags[name]);
  return { name, type, ...(type === 'secret_text' ? { secretConfigured: true } : {}) };
});
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const safe = {
  schema: 1, source: '944f00607cf05e586b1c88e2876dd796ce114e82', workerVersion: expected,
  publicFlags: flags, bindings, rawInputSha256: hash(raw), producerSha256: hash(fs.readFileSync(__filename)),
  omitted: ['account and namespace identifiers', 'author metadata', 'client ID and origin binding values', 'secret values', 'raw deployment logs'],
  hostedLogContentsRead: false
};
fs.writeFileSync(path.join(__dirname, 'redacted-readback.json'), JSON.stringify(safe, null, 2) + '\n');
process.stdout.write(JSON.stringify({ workerVersion: expected, bindings: bindings.length, publicFlags: flags }) + '\n');
