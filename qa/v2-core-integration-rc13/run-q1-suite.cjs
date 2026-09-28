'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const files=["qa/v2-07b-ts-q1/buffer-window.test.mjs","qa/v2-07b-ts-q1/clock-diagnostic.test.mjs","qa/v2-07b-ts-q1/clock-live.test.mjs","qa/v2-07b-ts-q1/clock-preservation.test.mjs","qa/v2-07b-ts-q1/gop-boundaries.test.mjs","qa/v2-07b-ts-q1/gop-stream.test.mjs","qa/v2-07b-ts-q1/init-sar.test.mjs","qa/v2-07b-ts-q1/psi-stream.test.mjs","qa/v2-07b-ts-q1/sar-preservation.test.mjs","qa/v2-07b-ts-q1/seek-bootstrap.test.mjs","qa/v2-07b-ts-q1/seek-input.test.mjs","qa/v2-07b-ts-q1/sps-aspect.test.mjs","qa/v2-07b-ts-q1/transmux-session.test.mjs","qa/v2-07b-ts-q1/ts-seek.test.mjs","qa/v2-07b-ts-q1/ts-window.test.mjs","qa/v2-07b-ts-q1/video-clock.test.mjs","qa/v2-07b-ts-q1/worker-client.test.mjs"];
const hashes=Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync(path.join(__dirname,'q1-suite-provenance.json'),JSON.stringify({node:process.version,files:hashes,arguments:['--test','--test-concurrency=1',...files]},null,2)+'\n');
const r=cp.spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{cwd:path.resolve(__dirname,'../..'),stdio:'inherit',windowsHide:true,timeout:600000});
if(r.error)process.stderr.write(String(r.error));process.exit(r.status??1);
