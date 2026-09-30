'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const tests=path.resolve(__dirname,'../../tests/app.test.js');let body=fs.readFileSync(tests,'utf8');
if(process.env.QA_PAUSED_PRESENTATION_PROPOSAL==='1')body=body.replace("fs.readFileSync(appPath, 'utf8')","fs.readFileSync("+JSON.stringify(path.join(__dirname,'proposed-app.js'))+", 'utf8')");
const compiled=new Module(tests,module);compiled.filename=tests;compiled.paths=Module._nodeModulePaths(path.dirname(tests));compiled._compile(body+'\n'+fs.readFileSync(path.join(__dirname,'regression-snippet.js'),'utf8'),tests);
