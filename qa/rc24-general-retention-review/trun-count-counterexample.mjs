import fs from 'node:fs';
import crypto from 'node:crypto';
import { createGeneralRapIndex } from '../../media/general-player.mjs';
const cat = (...parts) => new Uint8Array(Buffer.concat(parts.map(p => Buffer.from(p))));
const word = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const box = (type, ...parts) => { const b = cat(...parts); return cat(word(b.length + 8), Buffer.from(type), b); };
const init = box('moov', box('trak', box('tkhd', word(0), word(0), word(0), word(1)), box('mdia',
  box('mdhd', word(0), word(0), word(0), word(12000)), box('hdlr', word(0), word(0), Buffer.from('vide')))),
  box('mvex', box('trex', word(0), word(1), word(1), word(1000), word(1), word(0x02000000))));
// Two samples declared; only one sample's flags/CTO fields are inside the trun.
const bytes = cat(box('moof', box('traf', box('tfhd', word(0), word(1)), box('tfdt', word(0), word(120000)),
  box('trun', word(0x01000c00), word(2), word(0x02000000), word(0)))), box('mdat', new Uint8Array(19)));
const index = createGeneralRapIndex(); let rejected = false, admitted = false;
try { index.push(init); index.push(bytes); index.finish(); admitted = Boolean(index.safeEnd(20)); } catch { rejected = true; }
const source = fs.readFileSync(new URL('../../media/general-player.mjs', import.meta.url));
const result = { schema: 'drive-original.general-trun-count-counterexample/1', scope: 'local malformed owned-output; no native/browser claim',
  playerSHA256: crypto.createHash('sha256').update(source).digest('hex'), mismatchedCountRejected: rejected,
  mismatchedCountAdmittedAsRap: admitted, productEdits: false, browserRequests: 0 };
fs.writeFileSync(new URL('./trun-count-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
