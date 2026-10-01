const fs=require('node:fs'),crypto=require('node:crypto');
let text=fs.readFileSync(__dirname+'/../rc28-state-binding-readonly/fresh-facade.function.js','utf8');
text=text.replace('let lastGuardFailures = [];','let lastGuardFailures = []; const guardFailureHistory=[];');
text=text.replace('return lastGuardFailures.length === 0;',"if(lastGuardFailures.length && guardFailureHistory.length<16)guardFailureHistory.push({at:Date.now(),failed:lastGuardFailures.slice()}); return lastGuardFailures.length === 0;");
text=text.replace('guardFailures: lastGuardFailures,','guardFailures: lastGuardFailures, guardFailureHistory: guardFailureHistory.slice(),');
const out=__dirname+'/state-fresh-diagnostic.expression.js';if(fs.existsSync(out))throw Error('exists');
fs.writeFileSync(out,'('+text.trim()+')');const b=fs.readFileSync(out);console.log(JSON.stringify({bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),behavior:'same fail-closed guards; persistent failed-field names only'}));
