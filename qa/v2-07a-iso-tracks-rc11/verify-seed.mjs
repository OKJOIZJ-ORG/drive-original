import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {scanIsoBmffTopLevel} from '../v2-07a-isobmff-index/isobmff-index.mjs';
import {parseMoov} from './parser.mjs';
const url=new URL('../faststart-h264-aac.mp4',import.meta.url),bytes=await readFile(url);
const scan=await scanIsoBmffTopLevel({size:String(bytes.length),read:({start,end})=>bytes.subarray(Number(start),Number(end)+1)});
assert.equal(scan.status,'complete');assert.equal(scan.observations.moov.length,1);
const box=scan.observations.moov[0],parsed=parseMoov(bytes.subarray(Number(box.offset),Number(box.endExclusive)));
assert.equal(parsed.status,'parsed');
const native=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_tag_string,width,height,sample_rate,channels','-of','json',fileURLToPath(url)],{encoding:'utf8'}));
assert.equal(parsed.tracks.length,native.streams.length);
for(let i=0;i<parsed.tracks.length;i++){
  const t=parsed.tracks[i],entry=t.descriptions[0],n=native.streams[i];assert.equal(entry.codec,n.codec_tag_string);
  if(n.codec_type==='video'){assert.equal(entry.width,n.width);assert.equal(entry.height,n.height);}
  if(n.codec_type==='audio'){assert.equal(entry.sampleRate,Number(n.sample_rate));assert.equal(entry.config.esds.audioSpecificConfig.channelConfig,n.channels);}
}
const result={schema:'drive-original.iso-tracks-seed/1',seed:'qa/faststart-h264-aac.mp4',seedSHA256:createHash('sha256').update(bytes).digest('hex'),parserSHA256:createHash('sha256').update(await readFile(new URL('parser.mjs',import.meta.url))).digest('hex'),moovBytes:Number(box.size),nativeStreamFields:native.streams,parsed,pass:true,scope:'local-public-fixture-structural-crosscheck-no-live-decode'};
await writeFile(new URL('seed-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
