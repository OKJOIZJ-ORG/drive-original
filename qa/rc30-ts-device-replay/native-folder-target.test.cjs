'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const source=fs.readFileSync(path.join(__dirname,'native-folder-target.function.js'),'utf8');
const expected={id:'PRIVATE-FOLDER',name:'PRIVATE-NAME'};
function fixture(folders=[expected],names=[expected.name],occluded=false){
 const nodes=names.map(name=>({hidden:false,querySelector:selector=>{assert.equal(selector,'.folder-name');return{textContent:name};},scrollIntoView:()=>{},
  getBoundingClientRect:()=>({x:10,y:40,left:10,width:300,height:48,bottom:88}),contains:()=>false}));
 const context={state:{folders,currentFolderId:'root'},el:{folderMoreButton:{hidden:true,getBoundingClientRect:()=>({height:0})}},
  document:{querySelectorAll:selector=>{assert.equal(selector,'button.folder-row');return nodes;},elementFromPoint:()=>occluded?{}:nodes[0]},innerHeight:800,devicePixelRatio:2,screen:{height:900}};
 vm.createContext(context);const resolver=vm.runInContext('('+source+')',context);return{resolver,context};
}
test('exact immutable app markup has folder button/name and no data-folder-id contract',()=>{
 const app=execFileSync('git',['show','aa46bd083ce8c21f55cf7d9a4759f0d6709188c2:app.js'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:2*1024*1024});
 const start=app.indexOf('function createFolderRow('),end=app.indexOf('function shuffleCurrentFiles(',start),section=app.slice(start,end);
 assert.ok(section.includes("button.className = 'folder-row'"));assert.ok(section.includes("name.className = 'folder-name'"));assert.ok(section.includes('name.textContent = folder.name'));
 assert.equal(section.includes('data-folder-id'),false);
});
test('real semantic button/name pair qualifies without invented dataset property or identifiers',()=>{
 const {resolver}=fixture();const r=resolver(expected);assert.equal(r.available,true);assert.equal(r.metadataUnique,true);assert.equal(r.rowUnique,true);
 assert.equal(JSON.stringify(r).includes(expected.id),false);assert.equal(JSON.stringify(r).includes(expected.name),false);
});
test('wrong exact id/name, duplicate rendered label and duplicate unloaded name reject',()=>{
 for(const [folders,names]of [[[ {...expected,id:'OTHER'}],[expected.name]],[[expected],[expected.name,expected.name]],[[expected,{...expected,id:'OTHER'}],[expected.name]]]){
  const {resolver}=fixture(folders,names);assert.equal(resolver(expected).available,false);
 }
});
test('occlusion prevents native tap admission; missing rendered row exposes normal more button only',()=>{
 assert.equal(fixture(undefined,undefined,true).resolver(expected).available,false);
 const f=fixture([expected],[]);f.context.el.folderMoreButton={hidden:false,getBoundingClientRect:()=>({height:44})};
 const r=f.resolver(expected);assert.equal(r.available,false);assert.equal(r.moreVisible,true);assert.equal(r.metadataUnique,true);
});
