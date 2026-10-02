'use strict';
// Fixed-template local binding only. Deployment remains a separate --execute.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'../..'),template='3921b391addd80c0f4cf7831e4eb696adc8c3437',oldSource='5174485b3c17d047259701bbdd889f9b0740f555',version='1.22.0-rc.34';
const pins={
 'delivery-guard.cjs':'3eb57aac086a5af873c4fce1b93a1be3c8d00a7ab452eac40a7c2a732ba8adef',
 'materialize-candidate.cjs':'1ddfbb9996ea71628d2efa67fe04a5ff7929bc8bfc8ae5684e3c54a0a5fbe57d',
 'deploy-candidate.cjs':'004db4f05109db074547c4443b5b592469a93ea25490c61e497d633417160aca',
 'readback-candidate.cjs':'cd81cd220fa17228cfe4fc66e7761901b3dda070558b899eba9ba66a84b645d9',
 'redact-readback.cjs':'53624e1d25fe3e4e94a148e56e21cf1cc1d6ee8b76731550f60fb56584c759b7',
 'audit-with-memory-guard.cjs':'fa7d000bc960341ff8867bf21755f219e452e1a071816ffd33163133219964d8',
 'build-release.py':'bf114c74a6f7f3a730761eca5fafc005dc2f592b8174a6a1e621f92da5a4c2b3',
 'finalize-source-readiness.py':'5047e9672452fe9c83e375ad9348fd23cdfcc71a2d62daf440e49c08f967d638'
};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:67108864,windowsHide:true});
function derive(source){
 if(!/^[a-f0-9]{40}$/.test(source||''))throw Error('FULL_SOURCE_REQUIRED');
 const outputs=new Map();
 for(const [name,pin]of Object.entries(pins)){
  const b=git(['show',`${template}:qa/candidate-rc33-delivery/${name}`]);if(sha(b)!==pin)throw Error('FROZEN_TEMPLATE_MISMATCH');
  let text=b.toString('utf8');
  const replacements=text.split(oldSource).length-1,expected=['delivery-guard.cjs','redact-readback.cjs','build-release.py','finalize-source-readiness.py'].includes(name)?1:0;
  if(replacements!==expected)throw Error('SOURCE_REPLACEMENT_COUNT');
  text=text.split(oldSource).join(source).split('1.22.0-rc.33').join(version).split('candidate-rc33-delivery').join('candidate-rc34-delivery').split('candidate33').join('candidate34').split('rc.33 public-only').join('rc.34 public-only');
  if(name==='finalize-source-readiness.py'){
   const from="    'passed': True, 'sourceCommit': SOURCE, 'workerVersion': WORKER,";
   if(text.split(from).length!==2)throw Error('READINESS_VERSION_COUNT');
   text=text.replace(from,"    'passed': True, 'version': '1.22.0-rc.34', 'sourceCommit': SOURCE, 'workerVersion': WORKER,");
  }
  if(text.includes(oldSource)||text.includes('candidate-rc33-delivery')||text.includes('1.22.0-rc.33'))throw Error('OLD_IDENTITY_REMAINS');
  outputs.set(name,Buffer.from(text));
 }
 return outputs;
}
function bind(source){
 if(git(['rev-parse','HEAD']).toString().trim()!==source||path.resolve(git(['rev-parse','--show-toplevel']).toString().trim()).toLowerCase()!==root.toLowerCase())throw Error('EXACT_COMMITTED_SOURCE_REQUIRED');
 if(fs.realpathSync(__dirname)!==__dirname)throw Error('LINKED_BINDING_DIRECTORY');
 const outputs=derive(source),guard=new Module(path.join(__dirname,'delivery-guard.cjs'),module);guard.filename=path.join(__dirname,'delivery-guard.cjs');guard.paths=module.paths;
 guard._compile(outputs.get('delivery-guard.cjs').toString(),guard.filename);guard.exports.assertSource();
 for(const [name,b]of outputs){const f=path.join(__dirname,name);if(fs.existsSync(f)){const st=fs.lstatSync(f);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||fs.realpathSync(f)!==f||!fs.readFileSync(f).equals(b))throw Error('BOUND_OUTPUT_CHANGED');}}
 for(const [name,b]of outputs){const f=path.join(__dirname,name);if(!fs.existsSync(f))fs.writeFileSync(f,b,{flag:'wx'});}
 guard.exports.assertSource();
 const report={source,version,template,templatePins:pins,outputs:Object.fromEntries([...outputs].map(([name,b])=>[name,sha(b)])),actualDeployment:false,actualBrowserAccess:false,canonicalMetadataChanged:false};
 const record=path.join(__dirname,'binding.json');if(fs.existsSync(record))throw Error('BINDING_RECORD_EXISTS');fs.writeFileSync(record,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
module.exports={derive,bind};
if(require.main===module){try{const a=process.argv.slice(2);if(a.length!==3||a[0]!=='--bind'||a[2]!==version)throw Error('EXPLICIT_FULL_SOURCE_AND_VERSION_REQUIRED');console.log(JSON.stringify(bind(a[1])));}catch(e){console.error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'CANDIDATE_BIND_FAILED');process.exitCode=1;}}
