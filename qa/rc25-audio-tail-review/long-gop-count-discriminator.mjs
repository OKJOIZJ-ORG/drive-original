import fs from 'node:fs';
import crypto from 'node:crypto';
import {createGeneralRapIndex} from '../../media/general-player.mjs';
import {streamGeneralQ1} from '../../media/general-pipeline.mjs';
import {fixture} from '../../tests/general-q1-fixture.mjs';
import {Input,BufferSource,MP4,EncodedPacketSink,EncodedVideoPacketSource,EncodedAudioPacketSource,EncodedPacket,Output,Mp4OutputFormat,BufferTarget} from '../../media/mediabunny-q1.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const source=fs.readFileSync('tests/general-retention.test.mjs','utf8');
const start=source.indexOf("test('owned long-GOP mux");
const bodyStart=source.indexOf('async()=>{',start)+11;
const bodyEnd=source.indexOf('\n});',bodyStart);
let body=source.slice(bodyStart,bodyEnd);
// Preserve the owned mux configuration and encoded fixture, change only the GOP
// and duration. Stop before the author's twenty-second-specific assertions.
body=body.slice(0,body.indexOf('i.finish();assert.equal'));
body=body.replaceAll('vi<20','vi<100').replace('vi%10','vi%100').replace('audioCount=937','audioCount=4687');
body+='\ni.finish();return {result,outputBytes:bytes.length,raps:i.stats().raps};';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const names=['Input','BufferSource','MP4','EncodedPacketSink','EncodedVideoPacketSource','EncodedAudioPacketSource','EncodedPacket','Output','Mp4OutputFormat','BufferTarget','fixture','createGeneralRapIndex','streamGeneralQ1'];
let result;
try {result={passed:true,value:await new AsyncFunction(...names,body)(Input,BufferSource,MP4,EncodedPacketSink,EncodedVideoPacketSource,EncodedAudioPacketSource,EncodedPacket,Output,Mp4OutputFormat,BufferTarget,fixture,createGeneralRapIndex,streamGeneralQ1)};}
catch(error){result={passed:false,error:error.message,cleanup:error.cleanup??null};}
const record={scope:'Independent legitimate owned mux, low-FPS 100-second GOP with 4687 AAC samples; no browser/native decoder proof',playerSha256:sha(fs.readFileSync('media/general-player.mjs')),maintainedTestSha256:sha(source),adaptedBodySha256:sha(body),...result};
fs.writeFileSync('qa/rc25-audio-tail-review/long-gop-count-results.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
