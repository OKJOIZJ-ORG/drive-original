'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source='570f9c38506d1e426c33cf65b73836d32bf872c0';
const git=n=>execFileSync('git',['show',`${source}:${n}`],{cwd:root,maxBuffer:6e6});
const names=execFileSync('git',['ls-tree','-r','--name-only',source,'auth','worker'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(n=>n.endsWith('.mjs')||n==='worker/wrangler.jsonc');
names.push('app.js','sw.js','scripts/public-files.cjs','scripts/build-pages.cjs','scripts/materialize-committed-pages.cjs','qa/candidate-delivery-audit.cjs','qa/q1-auth-audit.cjs','tests/cloudflare-auth-worker.test.mjs');
const files=names.map(n=>{
 const bytes=git(n),text=bytes.toString('utf8');
 if(n.startsWith('auth/')||n.startsWith('worker/')||n==='tests/cloudflare-auth-worker.test.mjs'){
  const destination=path.join(__dirname,'fixed',n);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
 }
 return{file:n,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),consoleOwners:text.split(/\r?\n/).flatMap((line,i)=>/console\.(warn|error|log)/.test(line)?[{line:i+1}]:[])};
});
const config=JSON.parse(git('worker/wrangler.jsonc'));
const hostedConfiguration={observability:config.observability,authDiagnostics:config.vars.AUTH_DIAGNOSTICS,logpushConfigured:Object.hasOwn(config,'logpush'),tailConsumersConfigured:Object.hasOwn(config,'tail_consumers'),runtimeSettingsVerified:false,hostedLogContentsAccessed:false};
fs.writeFileSync(path.join(__dirname,'source-inventory.json'),JSON.stringify({source,producerHash:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),files,hostedConfiguration},null,2));
console.log(JSON.stringify({files:files.length,hostedConfiguration}));
