'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{parse}=require('./pc-safe-wire.cjs');
test('valid falsy protocol results survive command echo',()=>{for(const result of [false,null,'',0,true,{removed:true}])assert.deepEqual(parse(JSON.stringify({op:'eval',fn:'()=>...'} )+'\n'+JSON.stringify({op:'eval',result})),result);});
test('snapshot and native input acknowledgements have no result property',()=>{assert.deepEqual(parse('{"op":"tool","resultSavedPrivately":true}'),{completed:false,resultSavedPrivately:true});assert.deepEqual(parse('{"op":"tool","completed":true}'),{completed:true,resultSavedPrivately:false});});
test('failures, echoes and truncated output never qualify',()=>{for(const raw of ['{"op":"eval","fn":"()=>false"}','{"op":"eval","result":fa','{"op":"tool","failed":true}'])assert.throws(()=>parse(raw));});
test('ANSI repaint and multiple deliveries preserve the final result',()=>{assert.equal(parse('\x1b[32m{"op":"eval","result":true}\x1b[0m\n{"op":"eval","result":false}'),false);});
