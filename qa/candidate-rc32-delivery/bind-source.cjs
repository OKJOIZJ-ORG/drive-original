'use strict';
// Local preparation only. Never deploys, reads provider state, or launches a browser.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm'),Module=require('node:module');
const root=path.resolve(__dirname,'../..');
const TEMPLATE_COMMIT='5f6dae39a6a601207ff2c9e462b3ec8d610e91b4';
const OLD_SOURCE='10f1dd2ee9550866933e693dbf41c62e1fb2daad',VERSION='1.22.0-rc.32';
const pins={
 'delivery-guard.cjs':'2c601968c54fd69d907a201be53a29065983b336e5549a2e9337f9b8ad7558fc',
 'materialize-candidate.cjs':'2f0adc0f8a40a27699076aa51003cba893d6b739d7d59f11f1ea3a9ff0032f88',
 'deploy-candidate.cjs':'f4530eb76578ff3ac05672a24f6193de42357df7631a37f9f55a77434c22c67b',
 'readback-candidate.cjs':'cd81cd220fa17228cfe4fc66e7761901b3dda070558b899eba9ba66a84b645d9',
 'redact-readback.cjs':'4c009b06819b431adfee1f88f5ed2a16efd279fa4db2b088c4c5a8ccc7847552',
 'audit-with-memory-guard.cjs':'44a2cff3326ac8242a88e4d9ec6423bb925bcdc7a27629b9f9f8da86f2e34ca0',
 'build-release.py':'6bfd46c840d7db60ddf4a203821bed952b61d9b33720370b925cae327b7de562',
 'finalize-source-readiness.py':'242199bf41648e2909b794231c2436155157336cfa1ad6c17be0d75f2e0bc9d7'
};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024,windowsHide:true});
function replace(text,from,to,count){
 if(text.split(from).length-1!==count)throw Error('TEMPLATE_REPLACEMENT_COUNT');
 return text.split(from).join(to);
}
function derive(source){
 const predecessor=git(['show','ae21f8ac6b34497b3690aef9bc67ecee86a7e927:qa/candidate-rc31-delivery/bind-source.cjs']);
 if(sha(predecessor)!=='ac27ffb99ebd83533f1cadac6da927832aa67176fcfe804d1c235302c2be759e')throw Error('FROZEN_PREDECESSOR_BINDER_MISMATCH');
 const outputs=new Map();
 for(const [name,digest]of Object.entries(pins)){
  const bytes=git(['show',`${TEMPLATE_COMMIT}:qa/candidate-rc29-delivery/${name}`]);
  if(sha(bytes)!==digest)throw Error('FROZEN_TEMPLATE_HASH_MISMATCH');
  let text=bytes.toString('utf8');
  // Only exact identity literals, output leaf paths and descriptive candidate labels.
  // Codec/toolchain revisions and preferred-source metadata are never rewritten.
  if(['delivery-guard.cjs','redact-readback.cjs','build-release.py','finalize-source-readiness.py'].includes(name))text=replace(text,OLD_SOURCE,source,1);
  if(name==='delivery-guard.cjs')text=replace(text,'1.22.0-rc.29',VERSION,1);
  if(name==='deploy-candidate.cjs')text=replace(text,'free candidate29 only','free candidate32 only',1);
  if(name==='audit-with-memory-guard.cjs')text=replace(text,'candidate-rc29-delivery','candidate-rc32-delivery',1);
  if(name==='build-release.py'){
   text=replace(text,'rc.29 public-only','rc.32 public-only',1);
   text=replace(text,'candidate29 source','candidate32 source',1);
   text=replace(text,'candidate-rc29-delivery','candidate-rc32-delivery',2);
   text=replace(text,'1.22.0-rc.29',VERSION,1);
  }
  if(name==='finalize-source-readiness.py'){
   text=replace(text,'candidate29 HTTP','candidate32 HTTP',1);
   text=replace(text,'candidate-rc29-delivery','candidate-rc32-delivery',4);
   text=replace(text,'1.22.0-rc.29',VERSION,1);
  }
  if(text.includes(OLD_SOURCE)||text.includes('candidate-rc29-delivery')||text.includes('1.22.0-rc.29'))throw Error('OLD_DELIVERY_IDENTITY_REMAINS');
  if(name.endsWith('.cjs'))new vm.Script(text,{filename:name});
  outputs.set(name,Buffer.from(text));
 }
 return outputs;
}
function regular(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||fs.realpathSync(file)!==file)throw Error('LINKED_PREPARATION_FILE_FORBIDDEN');
}
function main(){
 const args=process.argv.slice(2);
 if(args.length!==3||args[0]!=='--bind'||! /^[a-f0-9]{40}$/.test(args[1])||args[2]!==VERSION)throw Error('BIND_REQUIRED (--bind FULL_SHA 1.22.0-rc.32)');
 const source=args[1];
 if(path.resolve(git(['rev-parse','--show-toplevel']).toString().trim()).toLowerCase()!==root.toLowerCase()
  ||git(['rev-parse','HEAD']).toString().trim()!==source
  ||git(['rev-parse',`${source}^{commit}`]).toString().trim()!==source)throw Error('EXACT_COMMITTED_HEAD_REQUIRED');
 if(fs.realpathSync(__dirname)!==__dirname||!fs.lstatSync(__dirname).isDirectory())throw Error('LINKED_PREPARATION_DIRECTORY_FORBIDDEN');
 regular(__filename);
 const outputs=derive(source);
 // Evaluate the real pinned guard before creating any scripts. Its Git/runtime/
 // Worker checks run locally; it does not contact provider or browser surfaces.
 const guardModule=new Module(path.join(__dirname,'delivery-guard.cjs'),module);
 guardModule.filename=path.join(__dirname,'delivery-guard.cjs');guardModule.paths=module.paths;
 guardModule._compile(outputs.get('delivery-guard.cjs').toString(),guardModule.filename);
 guardModule.exports.assertSource();
 // The audit producer is a separate committed dependency, not a copied old QA result.
 const audit=path.join(root,'qa/candidate-delivery-audit.cjs');regular(audit);
 if(!fs.readFileSync(audit).equals(git(['show',`${source}:qa/candidate-delivery-audit.cjs`])))throw Error('FIXED_AUDIT_PRODUCER_CHANGED');
 for(const [name,bytes]of outputs){const target=path.join(__dirname,name);if(fs.existsSync(target)){regular(target);if(!fs.readFileSync(target).equals(bytes))throw Error('BOUND_SCRIPT_ALREADY_DIFFERS');}}
 for(const [name,bytes]of outputs){const target=path.join(__dirname,name);if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});}
 guardModule.exports.assertSource();
 const record={schema:1,source,version:VERSION,templateCommit:TEMPLATE_COMMIT,templateSource:OLD_SOURCE,
  producerSha256:sha(fs.readFileSync(__filename)),scripts:[...outputs].map(([file,bytes])=>({file,bytes:bytes.length,sha256:sha(bytes),templateSha256:pins[file]})),
  auditProducerSha256:sha(fs.readFileSync(audit)),bound:true,actualDeployment:false,networkOrBrowserExecuted:false,
  generalDriveWrites:false,accountStateWrites:true,scope:'Local fixed-source candidate32 delivery preparation only; no product acceptance'};
 const recordBytes=Buffer.from(JSON.stringify(record,null,2)+'\n'),recordPath=path.join(__dirname,'binding.json');
 if(fs.existsSync(recordPath)){regular(recordPath);if(!fs.readFileSync(recordPath).equals(recordBytes))throw Error('BINDING_RECORD_ALREADY_DIFFERS');}
 else fs.writeFileSync(recordPath,recordBytes,{flag:'wx'});
 console.log(JSON.stringify({bound:true,source,version:VERSION,scripts:outputs.size,actualDeployment:false}));
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
