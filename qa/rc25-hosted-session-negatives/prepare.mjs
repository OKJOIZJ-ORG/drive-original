import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd(),base='qa/rc25-hosted-session-negatives';
const source='7ba8e654fa38def8c8e00efcbf1600a4c8730c53';
const sha=b=>createHash('sha256').update(b).digest('hex');
const prior=fs.readFileSync('qa/rc24-hosted-session-negatives/future-stage-owner-fields.expression.js','utf8');
assert.equal(sha(prior),'2476792c4e75747af37c0d7b472791d723039fe785ac315c50f45272b895b183');
const oldApp=execFileSync('git',['show','8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7:app.js'],{cwd:root}).toString();
const newApp=execFileSync('git',['show',`${source}:app.js`],{cwd:root}).toString();
assert.equal(oldApp.replace("const APP_VERSION = '1.22.0-rc.24';","const APP_VERSION = '1.22.0-rc.25';"),newApp);
const expression=prior.replaceAll('1.22.0-rc.24','1.22.0-rc.25').replaceAll('drive-original.rc24-','drive-original.rc25-');
new Function(`return ${expression}`);
fs.writeFileSync(`${base}/future-stage-owner-fields.expression.js`,expression);
const expected={
 'sw-proof.expression.js':sha(fs.readFileSync('qa/rc25-corpus-content-continuity/sw-proof.expression.js')),
 'factory.expression.js':sha(fs.readFileSync('qa/rc25-corpus-content-continuity/factory.expression.js')),
 'observer.expression.js':sha(fs.readFileSync('qa/rc25-performance-preparation/observer.expression.js')),
 'future-stage-owner-fields.expression.js':sha(expression)
};
assert.equal(expected['observer.expression.js'],'366a4b7774452a887b08d698fe4dd5c54872ddc08c3024a778ae3ffb7902afc9');
const originalBridge=fs.readFileSync('qa/rc24-corpus-actual/file-bridge.expression.js','utf8');
let bridge=originalBridge.replace(/const expected=\{[^\n]+\};/,`const expected=${JSON.stringify(expected)};`)
 .replace("if(entries.length!==4)","if(entries.length!==4)")
 .replace("const value=window.eval(e.text)","const value=e.name==='observer.expression.js'?e.text:window.eval(e.text)")
 .replace("o.renewal=value","o.performanceExpression=value").replace('driveNightFileInput24','driveNightFileInput25');
new Function(`return ${bridge}`);
fs.writeFileSync(`${base}/file-bridge.expression.js`,bridge);
const provenance={schema:1,sourceCommit:source,version:'1.22.0-rc.25',priorExpressionSHA256:sha(prior),expressionSHA256:sha(expression),parentLogicPreservedExceptVersionAndSchema:true,appEqualsFixed24ExceptVersion:true,originalFencesUnchanged:true,diagnosticCapMs:10000,extendedCapMs:60000,expectedLocalInputs:expected,browserRequestsByPreparation:0,localChecks:['parent exact hash','fixed25 app differs only version','generated expression syntax','fixed performance hash','generated local file bridge syntax']};
fs.writeFileSync(`${base}/provenance.json`,JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({prepared:true,expressionSHA256:sha(expression),bridgeSHA256:sha(bridge),browserRequests:0}));
