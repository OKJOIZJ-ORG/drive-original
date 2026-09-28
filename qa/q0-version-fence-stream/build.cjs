'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const source=read('../../media/drive-source.mjs'),owner=read('owner.mjs');
if(sha(source)!=='06458948ebbc08267511298e5faa297df7062d1786d456cb82f0c83d946817a5')throw Error('SOURCE_HASH_CHANGED');
function once(s,a,b){if(s.split(a).length!==2)throw Error('EXPECTED_UNIQUE_TRANSFORM');return s.replace(a,b);}
let body=once(source,'export async function openDriveQ1Source','async function openDriveQ1Source');
let lease=once(owner,"import {openDriveQ1Source} from '../../media/drive-source.mjs';",'');
lease=once(lease,'export function resolveRange','function resolveRange');
lease=once(lease,'export async function openNativeFence','async function openNativeFence');
const bundle=`(()=>{'use strict';\n${body}\n${lease}\nreturn Object.freeze({openNativeFence,resolveRange});\n})()`;
new (require('vm').Script)(bundle);
fs.writeFileSync(path.join(__dirname,'classic.expression.js'),bundle);
fs.writeFileSync(path.join(__dirname,'provenance.json'),JSON.stringify({sourcePath:'media/drive-source.mjs',sourceSHA256:sha(source),ownerSHA256:sha(owner),producerSHA256:sha(fs.readFileSync(__filename)),bundleSHA256:sha(bundle),bundleBytes:Buffer.byteLength(bundle)},null,2)+'\n');
console.log(sha(bundle));
