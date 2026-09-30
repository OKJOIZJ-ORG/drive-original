import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createGeneralRapIndex } from '../../media/general-player.mjs';
const cat = (...parts) => new Uint8Array(Buffer.concat(parts.map(p => Buffer.from(p))));
const u32 = n => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, n); return bytes; };
const box = (type, ...parts) => { const body = cat(...parts); return cat(u32(body.length + 8), Buffer.from(type), body); };
const init = ({ version = 0, defaultFlags = 0x02000000, scale = 12000, edit = null } = {}) => box('moov',
  box('trak', box('tkhd', u32(version << 24), new Uint8Array(version ? 16 : 8), u32(7)),
    box('mdia', box('mdhd', u32(version << 24), new Uint8Array(version ? 16 : 8), u32(scale)),
      box('hdlr', u32(0), u32(0), Buffer.from('vide'))),
    ...(edit === null ? [] : [box('edts', box('elst', u32(edit.version << 24), u32(1),
      ...(edit.version ? [u32(0), u32(3600000), u32(0), u32(edit.time)] : [u32(3600000), u32(edit.time)]), u32(0x10000)))])),
  box('mvex', box('trex', u32(0), u32(7), u32(1), u32(1000), u32(1), u32(defaultFlags))));
const fragment = ({ high = 0, low = 120000, cto = 0, tfhdFlags = null, firstFlags = null, sampleFlags = null } = {}) => {
  const tfhd = tfhdFlags === null ? box('tfhd', u32(0), u32(7)) : box('tfhd', u32(0x3b), u32(7), new Uint8Array(8), u32(1), u32(1000), u32(1), u32(tfhdFlags));
  const flags = 0x01000801 | (firstFlags === null ? 0 : 4) | (sampleFlags === null ? 0 : 0x700);
  const trun = box('trun', u32(flags), u32(1), u32(0), ...(firstFlags === null ? [] : [u32(firstFlags)]),
    ...(sampleFlags === null ? [] : [u32(1000), u32(1), u32(sampleFlags)]), u32(cto));
  return cat(box('moof', box('traf', tfhd, box('tfdt', u32(0x01000000), u32(high), u32(low)), trun)), box('mdat', new Uint8Array(19)));
};
const cases = [];
{
  const index = createGeneralRapIndex(); index.push(init());
  for (const time of [0, 18.333333333333, 39.166666666667]) index.push(fragment({ low: Math.round(time * 12000) }));
  assert.equal(index.canRetireBefore(39.09, 0), true);
  assert.equal(index.canRetireBefore(39.09, 0, 0, 18.34), false);
  cases.push({ name: 'safe-rap-must-reach-enough-charged-credit-before-exhaustion', passed: true });
}
{
  const index = createGeneralRapIndex(); index.push(init({ scale: 2400000 })); index.push(fragment({ low: 24000001 })); index.finish();
  const a = index.safeEnd(30), quantum = n => Math.round(n * 1000000);
  assert.ok(quantum(a.end) < Math.floor(a.boundary * 1000000));
  const b = index.safeEnd(10000000030, 10000000000);
  assert.ok(b.end < b.boundary); assert.ok(b.boundary - b.end >= 0.000002);
  cases.push({ name: 'high-timescale-native-microsecond-and-large-offset-margin', passed: true });
}
for (const version of [0, 1]) {
  const index = createGeneralRapIndex(); index.push(init({ edit: { version, time: 18000 } })); index.push(fragment()); index.finish();
  assert.equal(index.safeEnd(20).boundary, 8.5);
  cases.push({ name: 'single-unit-rate-edit-shift-version-' + version, passed: true });
}
{
  const index = createGeneralRapIndex(); index.push(init({ version: 1 }));
  const bytes = fragment({ high: 1, low: 120000, cto: -6000 });
  for (let p = 0; p < bytes.length; p += 3) index.push(bytes.subarray(p, p + 3));
  index.finish(); const expected = (2 ** 32 + 120000 - 6000) / 12000;
  assert.equal(index.safeEnd(expected + 10).boundary, expected);
  assert.ok(index.safeEnd(expected + 10).end < expected);
  cases.push({ name: 'version1-init-tfdt-high-word-negative-signed-cto-split3', passed: true });
}
for (const [name, initFlags, fields] of [
  ['trex-default-flags', 0x02000000, {}],
  ['tfhd-all-optional-fields-default-flags', 0x01010000, { tfhdFlags: 0x02000000 }],
  ['trun-first-sample-flags-override', 0x01010000, { firstFlags: 0x02000000 }],
  ['trun-per-sample-flags-override', 0x01010000, { sampleFlags: 0x02000000 }]
]) {
  const index = createGeneralRapIndex(); index.push(init({ defaultFlags: initFlags })); index.push(fragment(fields)); index.finish();
  assert.equal(index.safeEnd(20).boundary, 10); cases.push({ name, passed: true });
}
for (const [name, bytes] of [['partial-header', Uint8Array.of(0)], ['complete-moof-without-mdat', fragment().subarray(0, fragment().length - 27)],
  ['partial-mdat', fragment().subarray(0, fragment().length - 1)]]) {
  const index = createGeneralRapIndex(); index.push(init()); index.push(bytes);
  assert.throws(() => index.finish(), /GENERAL_OUTPUT_INCOMPLETE/); assert.equal(index.safeEnd(30), null);
  cases.push({ name, passed: true });
}
const source = fs.readFileSync(new URL('../../media/general-player.mjs', import.meta.url));
const output = { schema: 'drive-original.rc24-general-retention-independent/1', scope: 'local independent owned-mux binary-field counterexamples only',
  complete: true, cases, playerSHA256: crypto.createHash('sha256').update(source).digest('hex'), actualBrowserRequests: 0, productEdits: false };
fs.writeFileSync(new URL('./binary-fields-results.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ complete: true, cases: cases.length, actualBrowserRequests: 0, playerSHA256: output.playerSHA256 }));
