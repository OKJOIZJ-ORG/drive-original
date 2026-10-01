'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const VERSION='1.22.0-rc.32',COMMIT='1d79897fd32c569137cab079bfd93107be2ee33f';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validateBinding(b){
 if(b?.version!==VERSION||b.sourceCommit!==COMMIT||!/^[0-9a-f]{40}$/.test(b.sourceCommit))throw Error('IMMUTABLE32_BINDING_REQUIRED');
 if(!Array.isArray(b.cache)||b.cache.length!==40||new Set(b.cache.map(x=>x.file)).size!==40)throw Error('CACHE_BINDING_REQUIRED');
 for(const x of b.cache)if(!/^[a-zA-Z0-9_./-]+$/.test(x.file)||x.file.includes('..')||!/^[0-9a-f]{64}$/.test(x.sha256))throw Error('PUBLIC_HASH_INVALID');
 for(const f of ['app.js','sw.js','version.json','media/drive-source.mjs','media/ts-player.mjs'])if(!/^[0-9a-f]{64}$/.test(b.sourceSHA256?.[f])||(f!=='sw.js'&&b.cache.find(x=>x.file===f)?.sha256!==b.sourceSHA256[f]))throw Error('MODULE_HASH_REQUIRED');
 return b;
}
function verifyManifest(name,base=__dirname){
 let m;try{m=JSON.parse(fs.readFileSync(path.join(base,name)));}catch{throw Error('FREEZE_REQUIRED');}
 if(!Array.isArray(m.files)||!m.files.length)throw Error('FREEZE_REQUIRED');
 for(const x of m.files){if(!/^[A-Za-z0-9.-]+$/.test(x.file))throw Error('FREEZE_PATH_INVALID');const b=fs.readFileSync(path.join(base,x.file));if(b.length!==x.bytes||sha(b)!==x.sha256)throw Error('FROZEN_PRODUCER_DRIFT');}return m;
}
function verifyBound(base=__dirname){
 verifyManifest('preparation-manifest.json',base);verifyManifest('bound-manifest.json',base);
 return validateBinding(JSON.parse(fs.readFileSync(path.join(base,'binding.json'))));
}
module.exports={VERSION,COMMIT,sha,validateBinding,verifyManifest,verifyBound};
