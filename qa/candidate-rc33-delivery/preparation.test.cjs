'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const file=path.join(__dirname,'bind-source.cjs'),text=fs.readFileSync(file,'utf8'),root=path.resolve(__dirname,'../..'),source='7ab2375787076e53c91e28bc8c0a44cf24ac106f';
function context(args=[],mutate){let gitCalls=0,fsCalls=0,error;const filesystem=new Proxy(fs,{get(t,k){if(typeof t[k]!=='function')return t[k];return()=>{fsCalls++;throw Error('TEST_FILESYSTEM_FORBIDDEN');};}});
 const c={__dirname,__filename:file,process:{argv:['node',file,...args]},console:{log(){},error:e=>{error=e;}},Buffer,require:name=>name==='node:fs'?filesystem:name==='node:child_process'?{execFileSync:(program,a,opts)=>{assert.equal(program,'git');gitCalls++;const bytes=cp.execFileSync(program,a,{...opts,cwd:root});return mutate?mutate(a,bytes):bytes;}}:require(name)};
 vm.runInNewContext(text+';globalThis.api={derive,pins};',c);return{c,counts:()=>({gitCalls,fsCalls,error})};}
test('unbound binder denies aliases/old versions without filesystem or network actions',()=>{
 for(const args of [[],['--bind','HEAD','1.22.0-rc.33'],['--bind','main','1.22.0-rc.33'],['--bind','7ab2375','1.22.0-rc.33'],['--bind','b'.repeat(40),'1.22.0-rc.32']]){const x=context(args),r=x.counts();assert.match(r.error,/BIND_REQUIRED/);assert.equal(r.gitCalls,0);assert.equal(r.fsCalls,0);}
 const x=context(['--bind','b'.repeat(40),'1.22.0-rc.33']),r=x.counts();assert.equal(r.error,'EXACT_COMMITTED_HEAD_REQUIRED');assert.equal(r.fsCalls,0);
});
test('eight immutable templates derive rc33 exact Q3 cardinalities, retaining substantive guards',()=>{
 const x=context(),out=x.c.api.derive(source);assert.equal(out.size,8);assert.equal(x.counts().fsCalls,0);
 const guard=out.get('delivery-guard.cjs').toString(),final=out.get('finalize-source-readiness.py').toString(),build=out.get('build-release.py').toString();
 assert(guard.includes('files.length!==60'));assert(guard.includes("VERSION='1.22.0-rc.33'"));assert(guard.includes('FIXED_PUBLIC_WORKER_INPUTS_MUST_BE_CLEAN'));assert(guard.includes('CANDIDATE_WORKER_SCOPE_REQUIRED'));assert(guard.includes('SITE_GIT_BYTE_MISMATCH'));assert(build.includes('len(names) == 60'));assert(build.includes('output.write(data)'));assert(build.includes('OUTPUT.open("xb")'));assert(final.includes("'publicAssets': 61, 'cacheAssets': 46, 'uncachedSourceArchives': 9, 'private404': 6"));assert(final.includes("len(audit['privateRoutes']) == 6"));assert(final.includes("all(not row['cached']"));assert(out.get('materialize-candidate.cjs').toString().includes('all61EqualFixedGit'));
 for(const [name,b] of out){assert(!b.toString().includes('candidate-rc29-delivery'));if(name.endsWith('.cjs'))new vm.Script(b.toString());else if(name.endsWith('.py'))cp.execFileSync('python',['-c',"import sys;compile(sys.stdin.read(), 'derived-template', 'exec')"],{input:b,windowsHide:true});}
});
test('future manifest/cache drift fails instead of weakening old count guards',()=>{
 for(const kind of ['manifest','cache']){const x=context([], (args,b)=>args[0]==='show'&&args[1]===source+':'+(kind==='manifest'?'scripts/public-files.cjs':'sw.js')?Buffer.from(b.toString().replace('video-q3-input.mjs','video-q3-unknown.mjs')):b);assert.throws(()=>x.c.api.derive(source),kind==='manifest'?/Q3_PUBLIC_MANIFEST_MISMATCH/:/Q3_CACHE_ALLOWLIST_MISMATCH/);assert.equal(x.counts().fsCalls,0);}
});
