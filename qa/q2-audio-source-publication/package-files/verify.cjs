'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const list=JSON.parse(fs.readFileSync(path.join(__dirname,'inventory.json'))).files;
for(const f of list){
  if(f.path.split('/').includes('..')||path.isAbsolute(f.path))throw Error('UNSAFE_PATH');
  const b=fs.readFileSync(path.join(__dirname,f.path));
  if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('INVENTORY_HASH:'+f.path);
}
console.log('Verified '+list.length+' supplied files.');
if(process.argv[2]){
 const b=fs.readFileSync(path.resolve(process.argv[2]));
 if(b.length!==502740||sha(b)!=='48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf')throw Error('REFERENCE_WASM_DIFFERS (expected for modifications)');
 console.log('Relinked WASM matches the exact 502740-byte reference.');
}
