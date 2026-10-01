'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const s={accountId:'account',authAccountKey:'key',driveSessionGeneration:1,authGeneration:1,accountMediaState:{a:1},accountStateRevision:1,currentFolderId:'root',folderStack:[],query:'',filter:'all',loadingFiles:false,populationComplete:true,nextPageToken:null,renderWindowStart:0,renderRowHeight:100};
 const files=Array.from({length:1000},(_,i)=>({id:'file-'+i})),controller={};
 const w={__pcViewportPrivate:{account:{accountId:'account',authAccountKey:'key'},folderPath:[{id:'folder'}]},__rc32DeeperSwProof:{get:()=>({sourceCommit:'1d79897fd32c569137cab079bfd93107be2ee33f',version:'1.22.0-rc.32',controller})}};
 const c={window:w,state:s,navigator:{serviceWorker:{controller}},APP_VERSION:'1.22.0-rc.32',mediaSourceGeneration:1,q0Playback:null,q1Playback:null,scrollY:0,innerHeight:600,innerWidth:1200,document:{scrollingElement:{scrollHeight:16700},documentElement:{scrollWidth:1200,clientWidth:1200}},filteredAndSortedFiles:()=>files,getGridColumnCount:()=>6,computeRenderWindow:(n,start)=>({start,end:Math.min(n,start+240)})};
 c.el={playerSheet:{hidden:true},fileGrid:{getBoundingClientRect:()=>({top:-c.scrollY,bottom:16700-c.scrollY,left:0,right:1200,width:1200,height:16700}),querySelectorAll:()=>files.slice(s.renderWindowStart,Math.min(1000,s.renderWindowStart+240)).map((f,i)=>({dataset:{fileId:f.id},getBoundingClientRect:()=>{const top=Math.floor((i+s.renderWindowStart)/6)*100-c.scrollY;return{top,bottom:top+88,left:0,right:180};}}))}};
 const observer=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'viewport-observation.expression.js'),'utf8'),c);return{c,s,observer};
}
test('observer distinguishes stale top omission from covered top and bottom',()=>{
 const {c,s,observer:o}=fixture();assert.equal(o.record('top').viewportCovered,true);
 s.renderWindowStart=36;const stale=o.record('stale-top');assert.equal(stale.viewportCovered,false);assert.equal(stale.firstItemMounted,false);
 s.renderWindowStart=760;c.scrollY=16100;const bottom=o.record('bottom');assert.equal(bottom.viewportCovered,true);assert.equal(bottom.lastItemMounted,true);assert.equal(bottom.cardCapPassed,true);
 s.renderWindowStart=0;c.scrollY=0;assert.equal(o.record('top-return').firstItemMounted,true);
});
test('ownership drift and disposed observers cannot produce a qualified observation',()=>{
 const {s,observer:o}=fixture();s.accountId='other';assert.throws(()=>o.record('bad'),/VIEWPORT_OBSERVATION_REJECTED/);
 s.accountId='account';assert.equal(o.dispose().disposed,true);assert.throws(()=>o.record('bad'),/VIEWPORT_OBSERVATION_REJECTED/);
});
