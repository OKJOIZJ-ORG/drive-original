'use strict';
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.resolve(__dirname,'../../tests/controller-change.test.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(fs.readFileSync(path.join(__dirname,'controller-change-test-first-encoding-failure.bin'),'utf8'),filename);
