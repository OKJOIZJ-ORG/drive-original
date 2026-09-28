const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const git=(args)=>cp.execFileSync('git',['-C',root,...args],{encoding:'utf8'});
if(git(['rev-parse','HEAD']).trim()!=='570f9c38506d1e426c33cf65b73836d32bf872c0')throw Error('SAVEPOINT_BASE_CHANGED');
const tracked=['.gitattributes','app.js','tests/app.test.js','memory/CHECKPOINT.md','memory/00-INDEX.md','memory/PRODUCT-TRUTH.md','memory/SESSION-LOG.md','memory/goal/commercial-player-stability.md'];
const evidence=['memory/CANDIDATE-RC13-20260929.md','memory/Q0-AND-PRIVACY-20260929.md','memory/checkpoints/20260928T191936-rc13-live-replay.md','memory/checkpoints/20260928T193550-rc13-privacy-verified.md'];
function includeLeaf(name,{exclude=[],only=null}={}){
  const base=path.join(root,'qa',name);
  const entries=fs.readdirSync(base,{withFileTypes:true});
  for(const entry of entries){
    if(exclude.includes(entry.name))continue;
    if(entry.isDirectory()){
      if(name==='candidate-privacy-rc13'&&entry.name==='before'){
        for(const file of ['producer.cjs','results.json'])evidence.push('qa/'+name+'/before/'+file);
      }else throw Error('UNREVIEWED_EVIDENCE_DIRECTORY:'+name+'/'+entry.name);
    }else if(!only||only.includes(entry.name))evidence.push('qa/'+name+'/'+entry.name);
  }
}
for(const name of ['v2-live-format-playback-rc13','v2-live-webm-rc13','q0-conditional-read-rc13','q0-conditional-v2-rc13'])includeLeaf(name);
includeLeaf('candidate-privacy-rc13',{exclude:['fixed','root-savepoint.cjs','root-savepoint-results.json']});
includeLeaf('candidate-rc13-delivery',{only:['README.md','results.json','redact-readback.cjs','redacted-readback.json']});
includeLeaf('candidate-rc13-package',{only:['README.md','build-static-package.py','package-results.json','verify-records.cjs','qualification-summary.json']});
for(const p of evidence){
  if(/(?:deploy\.log|readback\.log|version-readback|private|backup|\.png$|\.mp4$|\.zip$)/.test(p))throw Error('EXCLUDED_RAW_PATH:'+p);
  const absolute=path.resolve(root,p);
  if(!absolute.startsWith(root+path.sep)||!fs.statSync(absolute).isFile())throw Error('EVIDENCE_PATH');
}
const summary={source:'570f9c38506d1e426c33cf65b73836d32bf872c0',scope:'Verified local privacy repair and bounded actual rc13 records only; not deployment',
  tracked,evidence,hashes:Object.fromEntries([...tracked,...evidence].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]))};
fs.writeFileSync(path.join(__dirname,'root-savepoint-results.json'),JSON.stringify(summary,null,2)+'\n');
git(['add','--renormalize','--',...tracked]);
git(['-c','core.autocrlf=false','add','-f','--',...evidence,'qa/candidate-privacy-rc13/root-savepoint.cjs','qa/candidate-privacy-rc13/root-savepoint-results.json']);
console.log(JSON.stringify({tracked:tracked.length,evidence:evidence.length+2,scope:summary.scope}));
