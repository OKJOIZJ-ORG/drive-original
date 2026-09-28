import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilitiesForScopes, parseGrantedScopes } from '../auth/scope-policy.mjs';

test('scope authority is exact and granular; per-file and metadata grants do not become full-library authority', () => {
  for (const extra of ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/Drive', 'unknown']) {
    assert.deepEqual(capabilitiesForScopes(['openid', extra]), {version:1,driveRead:false,driveWrite:false,appData:false});
  }
  assert.deepEqual(capabilitiesForScopes(['openid','https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.appdata']),
    {version:1,driveRead:true,driveWrite:false,appData:true});
  for (const value of [null, {}, '', 'openid\nfoo', 'openid  foo', 'drive']) assert.throws(() => parseGrantedScopes(value));
});
