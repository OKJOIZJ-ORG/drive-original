import {boundary} from './boundary-harness.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['media/ts-player.mjs','media/q1-core.mjs','media/drive-source.mjs','qa/v2-07b-ts-q1/ts-seek.mjs'];
const source=Object.fromEntries(files.map(file=>[file,sha(readFileSync(new URL('../../'+file,import.meta.url)))]));
const result=await boundary();assert.equal(result.rangeCount,4);assert.equal(result.metaCount,9);
assert.equal(result.constructions,1);assert.equal(result.sources[0].cleanupSettled,true);
const ranges=result.log.filter(r=>r.stage==='range');
assert.equal(ranges[2].start,0);assert.equal(ranges[2].end,Math.floor(65536/188)*188-1);
assert(ranges.slice(0,2).some(r=>r.start===ranges[3].start&&r.end===ranges[3].end));
writeFileSync(new URL('./baseline.json',import.meta.url),JSON.stringify({sourceCommit:'f6749c1a1b1a8345f8f76606786e0c1ccb48b21c',source,
  scope:'actual product source/probe/bootstrap with synthetic fixture; deliberate MSE constructor boundary stop, not browser playback/failure',
  duplicateBootstrapRangeReads:2,duplicateMetadataReads:4,result},null,2)+'\n');
console.log('baseline:2 duplicated bootstrap Range reads,4 metadata calls;4 totalRanges/9metadata');
