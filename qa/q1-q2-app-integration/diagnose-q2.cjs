// Synthetic-only error discriminant. No product files are changed.
const fs=require('node:fs');
let code=fs.readFileSync(__dirname+'/native.cjs','utf8');
code=code.replace("['aac','ac3','ts']", "['ac3']")
 .replace("fs.createReadStream(f).pipe(res);", "if(f.endsWith('audio-general-worker.mjs'))return res.end(fs.readFileSync(f,'utf8').replace('catch (failure) { error',\"catch (failure) { console.log('QA_Q2_ERROR', failure.name, failure.message); error\"));fs.createReadStream(f).pipe(res);")
 .replace("page.on('pageerror',e=>errors.push(e.message));", "page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.text().includes('QA_Q2_ERROR'))errors.push(msg.text());});")
 .replace('native-results.json','native-q2-diagnostic.json');
new Function('require','__dirname',code)(require,__dirname);
