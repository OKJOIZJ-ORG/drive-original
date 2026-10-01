// Root calls only after the fixed candidate31 source/public identity is established.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {build} from './build.mjs';
const commit=process.argv[2];if(!/^[a-f0-9]{40}$/.test(commit??''))throw Error('EXACT_COMMIT_SHA_REQUIRED');
if(commit!=='4a484e6f839d2e6c3eb83503acb08147362cb011')throw Error('FIXED31_SOURCE_REQUIRED');
const paths=['app.js','sw.js','version.json'],bytes=Object.fromEntries(paths.map(p=>[p,execFileSync('git',['show',commit+':'+p],{maxBuffer:4*1024*1024})]));
if(JSON.parse(bytes['version.json']).version!=='1.22.0-rc.31'||!bytes['app.js'].includes('1.22.0-rc.31')||!bytes['sw.js'].includes('1.22.0-rc.31'))throw Error('FIXED31_SOURCE_REQUIRED');
const binding={schema:'drive-original.corpus-header-source-binding/1',version:'1.22.0-rc.31',sourceCommit:commit,sourceSHA256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(bytes[p]).digest('hex')]))};
const base=new URL('./',import.meta.url);await writeFile(new URL('binding.json',base),JSON.stringify(binding,null,2)+'\n');const result=await build();await writeFile(new URL('factory.expression.js',base),result.expression);await writeFile(new URL('sw-proof.expression.js',base),result.swProof);await writeFile(new URL('provenance.json',base),JSON.stringify(result.provenance,null,2)+'\n');console.log(JSON.stringify({bound:result.provenance.bound,version:binding.version,sourceCommit:commit,expressionSHA256:result.provenance.expressionSHA256,swProofSHA256:result.provenance.swProofSHA256}));
