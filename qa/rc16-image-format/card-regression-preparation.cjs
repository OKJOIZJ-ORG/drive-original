'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const tests=path.resolve(__dirname,'../../tests/app.test.js');
const compiled=new Module(tests,module);compiled.filename=tests;compiled.paths=Module._nodeModulePaths(path.dirname(tests));compiled._compile(fs.readFileSync(tests,'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'card-regression-snippet.js'),'utf8'),tests);
