const fs=require('node:fs'),path=require('node:path');const p=__dirname,old=path.resolve(p,'../q2-general-product-integration');
fs.writeFileSync(path.join(p,'product-native.mjs'),fs.readFileSync(path.join(old,'native.mjs'),'utf8').replace("const before=appends;", "if(name==='surround') assert(terminal.error?.message==='AUDIO_STEREO_48K_REQUIRED','FIXED_DIGIT_ERROR_CODE');const before=appends;"));
let s=fs.readFileSync(path.join(old,'native.cjs'),'utf8').replace('/qa/q2-general-product-integration/native.mjs','/qa/q2-original-end-integrity/product-native.mjs');
s=s.replace("const results=[],pageErrors=[];try{","const results=[],pageErrors=[];let failure;try{");
const at=s.indexOf("fs.writeFileSync(path.join(__dirname,'native-results.json')");
s=s.slice(0,at)+"}catch(e){failure=e.stack;process.exitCode=1;}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));const complete=!failure&&results.length===13&&!pageErrors.length&&results.every(r=>r.passed);fs.writeFileSync(path.join(__dirname,'fresh-native-results.json'),JSON.stringify({complete,expectedCases:13,started:process.env.Q2_RUN_ID,failure,pageErrors,results},null,2));if(!complete)process.exitCode=1;}})().catch(e=>{console.error(e);process.exitCode=1;});\n";
fs.writeFileSync(path.join(p,'fresh-native.cjs'),s);
