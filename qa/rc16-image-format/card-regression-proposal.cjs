'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const tests=path.resolve(__dirname,'../../tests/app.test.js'),proposal=fs.readFileSync(path.join(__dirname,'proposed-card-function.js'),'utf8');
const snippet=fs.readFileSync(path.join(__dirname,'card-regression-snippet.js'),'utf8').replace('const { findNodes } = installMiniDom(context);','run(context,'+JSON.stringify(proposal)+');\n  const { findNodes } = installMiniDom(context);');
const compiled=new Module(tests,module);compiled.filename=tests;compiled.paths=Module._nodeModulePaths(path.dirname(tests));compiled._compile(fs.readFileSync(tests,'utf8')+'\n'+snippet,tests);
