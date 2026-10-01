'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{toolArgs}=require('./pc-live-observer-recovery.cjs');
const schemas=new Map([['take_snapshot',{inputSchema:{properties:{pageId:{},verbose:{},filePath:{}}}}],['click',{inputSchema:{properties:{pageId:{},uid:{},includeSnapshot:{}}}}]]);
test('snapshot uses its exposed schema without invalid includeSnapshot',()=>assert.deepEqual(toolArgs('take_snapshot',{},7,schemas),{pageId:7}));
test('trusted click fixes exact page and suppresses incidental private snapshot',()=>assert.deepEqual(toolArgs('click',{uid:'1_2',pageId:9,includeSnapshot:true},7,schemas),{uid:'1_2',pageId:7,includeSnapshot:false}));
test('unexposed tool or argument fails closed',()=>{assert.throws(()=>toolArgs('navigate_page',{},7,schemas),/OWNED_TOOL_REQUIRED/);assert.throws(()=>toolArgs('take_snapshot',{includeSnapshot:false},7,schemas),/OWNED_TOOL_ARGUMENT_UNKNOWN/);});
