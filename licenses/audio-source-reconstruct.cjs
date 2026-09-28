'use strict';
// Run with Node from any directory; place all listed parts beside this script.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,manifest=JSON.parse(fs.readFileSync(path.join(dir,'audio-source-manifest.json')));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const chunks=manifest.parts.map(p=>{
  if(!/^audio-source-v1\.tar\.gz\.part\d{3}$/.test(p.path))throw Error('UNSAFE_PART_PATH');
  const b=fs.readFileSync(path.join(dir,p.path));if(b.length!==p.bytes||sha(b)!==p.sha256)throw Error('PART_HASH:'+p.path);return b;
});
const archive=Buffer.concat(chunks);
if(archive.length!==manifest.bytes||sha(archive)!==manifest.sha256)throw Error('ARCHIVE_HASH');
const dest=path.join(dir,'audio-source-v1.tar.gz');
fs.writeFileSync(dest,archive);
console.log('Verified '+chunks.length+' parts; reconstructed '+dest+' ('+archive.length+' bytes; SHA-256 '+sha(archive)+').');
