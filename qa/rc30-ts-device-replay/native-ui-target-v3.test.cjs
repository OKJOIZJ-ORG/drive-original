'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'native-ui-target-v3.function.js'),'utf8');
function fixture(){
 let scrolls=0,hit;
 const node=(kind,rect,parent=null)=>({kind,hidden:false,inert:false,parentElement:parent,scrollTop:0,
  classList:{contains:()=>false},getBoundingClientRect:()=>({...rect,bottom:rect.top+rect.height}),
  scrollIntoView:()=>scrolls++,contains(other){return other?.parentElement===this||other?.parentElement?.parentElement===this;},
  closest:selector=>kind==='button'||kind==='slider'?{}:null,querySelector:()=>null});
 const modal=node('modal',{left:0,top:0,width:824,height:1191}),stage=node('stage',{left:0,top:0,width:824,height:1191},modal);
 const video=node('video',{left:100,top:200,width:624,height:780},stage),chrome=node('chrome',{left:0,top:1000,width:824,height:191},stage);
 const entry=node('button',{left:0,top:1147,width:824,height:44},stage),control=node('button',{left:20,top:1100,width:44,height:44},chrome);
 const seek=node('slider',{left:20,top:1050,width:784,height:18},chrome),custom=node('custom',{left:20,top:1000,width:784,height:170},chrome);
 const context={window:{},el:{playerModal:modal,mediaStage:stage,videoPlayer:video,playerControlsEntry:entry,ctrlPlayPause:control,seekBarContainer:seek,customVideoControls:custom},playerChrome:chrome,
  innerWidth:824,innerHeight:1191,devicePixelRatio:2.125,screen:{height:1317},
  getComputedStyle:n=>n.style||{display:'block',visibility:'visible',pointerEvents:'auto',position:'absolute',opacity:'1'},
  document:{querySelectorAll:()=>[],elementFromPoint:(x,y)=>hit?hit(x,y):video}};
 vm.createContext(context);const probe=vm.runInContext('('+source+')',context);
 return{context,probe,node,stage,video,chrome,entry,control,seek,custom,hit:fn=>{hit=fn;},scrolls:()=>scrolls};
}
test('stage requires normal surface hit and never a chrome/interactive control',()=>{
 const f=fixture();f.hit(()=>f.video);const good=f.probe('mediaStage');assert.equal(good.available,true);assert.equal(good.points[0].hitIsVideo,true);
 f.hit(()=>f.control);const bad=f.probe('mediaStage');assert.equal(bad.available,false);assert.equal(bad.points[0].hitIsChrome,true);assert.equal(bad.points[0].hitInteractive,true);
});
test('covered entry center can use an actually unobscured interior point',()=>{
 const f=fixture();f.hit((x,y)=>y>1180?f.entry:f.chrome);const r=f.probe('playerControlsEntry');assert.equal(r.points[0].usable,false);
 assert.equal(r.available,true);assert.equal(r.y,1147+44*.82);assert.equal(r.points[1].hitIsEntry,true);
});
test('fully covered entry is rejected with safe hit diagnostics',()=>{
 const f=fixture();f.hit(()=>f.chrome);const r=f.probe('playerControlsEntry');assert.equal(r.available,false);assert.equal(r.points.every(p=>p.hitIsChrome),true);
 assert.equal(r.key,'playerControlsEntry');assert.equal(r.points.length,7);assert.equal(r.rawIdentifiersExported,false);
});
test('inert chrome and hidden ancestor reject a geometrically present transport button',()=>{
 const f=fixture();f.hit(()=>f.control);f.chrome.inert=true;assert.equal(f.probe('ctrlPlayPause').inertAncestor,true);assert.equal(f.probe('ctrlPlayPause').available,false);
 f.chrome.inert=false;f.chrome.hidden=true;assert.equal(f.probe('ctrlPlayPause').hiddenAncestor,true);assert.equal(f.probe('ctrlPlayPause').available,false);
});
test('seek probes exact requested fraction; an occluded fraction cannot shift to another time',()=>{
 const f=fixture();f.hit(()=>f.seek);const r=f.probe('seekBarContainer',{xFraction:.95});assert.equal(r.available,true);assert.equal(r.x,20+784*.95);assert.equal(r.points.length,1);
 f.hit(()=>f.chrome);assert.equal(f.probe('seekBarContainer',{xFraction:.95}).available,false);
});
test('player probes do not scroll and UI key/style whitelist prevents private exports',()=>{
 const f=fixture();f.control.style={display:'PRIVATE',visibility:'visible',pointerEvents:'auto',position:'PRIVATE',opacity:'1'};f.hit(()=>f.control);
 const r=f.probe('ctrlPlayPause');assert.equal(r.style.display,'other');assert.equal(r.style.position,'other');assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
 f.probe('mediaStage');f.probe('playerControlsEntry');assert.equal(f.scrolls(),0);assert.throws(()=>f.probe('private-file-id'),/NATIVE_KEY_NOT_ALLOWED/);
});
