// Build-only transport consolidation; source helpers remain immutable.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const base=path.resolve(__dirname,'../..'),leaf=path.join(base,'qa/rc28-state-binding-readonly');
const manifest=JSON.parse(fs.readFileSync(path.join(leaf,'staging-manifest.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['backup-factory.expression.js','capture-facade.function.js','fresh-factory.generated.js','fresh-facade.function.js'];
const bytes=names.map(n=>{const p='qa/rc28-state-binding-readonly/'+n;const b=fs.readFileSync(path.join(base,p));if(sha(b)!==manifest.files.find(f=>f.path===p)?.sha256)throw Error('helper hash mismatch');return b.toString('utf8');});
const output=path.join(__dirname,'state-install.expression.js');if(fs.existsSync(output))throw Error('already built');
const props=['backupFactory','captureFacade','freshFactory','freshFacade'];
const text='(()=>Object.freeze({'+props.map((p,i)=>p+':('+bytes[i].trim()+')').join(',')+'}))()';
fs.writeFileSync(output,text);cp.execFileSync(process.execPath,['--check',output],{stdio:'inherit'});
const record={source:'944f00607cf05e586b1c88e2876dd796ce114e82',parts:names.map((name,i)=>({name,sha256:sha(Buffer.from(bytes[i]))})),bytes:Buffer.byteLength(text),sha256:sha(Buffer.from(text)),actualExecution:false,change:'Wrap exact immutable public helpers into one local import, no behavior change'};
fs.writeFileSync(path.join(__dirname,'state-install-build.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify({bytes:record.bytes,sha256:record.sha256,partsVerified:true}));
