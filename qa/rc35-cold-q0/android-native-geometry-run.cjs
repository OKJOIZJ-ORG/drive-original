'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {common35,verifyBound35}=require('./android.cjs');
const {calibrate,adjudicate,browserExpressions,compileBrowserExpressions,parsePhysicalScreen}=require('./android-native-geometry.cjs');
const dir=__dirname,resultName=process.argv[2]||'android-native-geometry-actual.json',expected='내 드라이브';
if(!/^android-native-geometry-[a-z0-9-]+\.json$/.test(resultName)||fs.existsSync(path.join(dir,resultName)))throw Error('RESULT_NAME_INVALID');
const temp='/data/local/tmp/drive-original-native-geometry-'+crypto.randomUUID()+'.xml';
const ownerKey='__qaAndroidNativeGeometry_'+crypto.randomUUID().replaceAll('-','');
const expressions=browserExpressions(expected,ownerKey);compileBrowserExpressions(expressions);
let tempMade=false,listenerInstalled=false;
common35()(__filename,'../rc35-cold-q0/'+resultName,async c=>{try{
 const binding=verifyBound35(),steps=[];let pre,cal,screenWidth,screenHeight,xml;
 const evalSafe=()=>c.evaluateNative(expressions.prestate);
 const device=c.report;
 c.report.schema='actual-android-native-geometry/1';
 c.report.binding={sourceCommit:binding.sourceCommit,version:binding.version,sourceBindingValid:true};
 c.report.rawIdentifiersExported=false;c.report.rawXmlOrLabelsExported=false;
 c.report.steps.push({name:'initial device and connection admission',...device.environment,model:device.model,android:device.android,physicalScreen:device.physicalScreen});
 await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
 pre=await evalSafe();
 if(pre.origin!=='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'||pre.version!=='1.22.0-rc.35'||!pre.library||!pre.root||pre.query!==''||!pre.closed||!pre.ownerIdle||pre.target.matches!==1||!pre.target.enabled||!pre.target.visible)throw Error('GEOMETRY_PRESTATE_NOT_READY');
 const physical=parsePhysicalScreen(device.physicalScreen);screenWidth=physical.width;screenHeight=physical.height;
 tempMade=true;const xmlOutput=c.adb(['shell','uiautomator','dump',temp]);xml=c.adb(['shell','cat',temp]);
 if(typeof xml!=='string'||xml.length>1024*1024||!xmlOutput.includes('dumped to'))throw Error('GEOMETRY_XML_UNAVAILABLE');
 cal=calibrate({xml,expected,screenWidth,screenHeight,dpr:pre.dpr,viewportHeight:pre.height,dom:pre.target});
 const still=await evalSafe();if(JSON.stringify(still)!==JSON.stringify(pre))throw Error('GEOMETRY_PRESTATE_DRIFT');
 const install=await c.evaluateNative(expressions.observer);
 listenerInstalled=true;
 if(!install.listenerInstalled)throw Error('GEOMETRY_OBSERVER_NOT_INSTALLED');
 c.report.steps.push({name:'native and DOM geometry qualified before input',targetLabel:expected,matchingNativeNodes:cal.native.matchingOptionNodes,nativeBounds:{left:cal.native.left,top:cal.native.top,right:cal.native.right,bottom:cal.native.bottom},domRect:{left:pre.target.left,top:pre.target.top,width:pre.target.width,height:pre.target.height},screen:{width:screenWidth,height:screenHeight},viewport:{width:pre.width,height:pre.height,dpr:pre.dpr},contentOriginY:cal.contentOriginY,bottomGapPx:cal.bottomGapPx,physicalTapPoint:cal.tap,domPoint:cal.domPoint,scaleTolerancePx:cal.tolerancePx,prestate:{root:true,emptyQuery:true,scrollY:pre.scrollY,playerClosed:true,ownersIdle:true},observerInstalled:true,cleanupPrepared:{listenerRemoval:true,scrollRestore:true,xmlDelete:true,ownedTransportDetach:true},actualInputIssued:false,rawXmlOrLabelsExported:false});
 fs.writeFileSync(path.join(dir,resultName),JSON.stringify(c.report,null,2)+'\n');
 const inputAt=Date.now();c.adb(['shell','input','tap',String(cal.tap.x),String(cal.tap.y)]);c.report.steps.push({name:'single native tap issued',at:new Date().toISOString(),elapsedFromTapCommandStartMs:Date.now()-inputAt,nativePoint:cal.tap,tapCount:1});
 const until=Date.now()+5000;let observed;while(Date.now()<until){observed=await c.evaluateNative(expressions.readEvent);if(observed)break;await c.wait(100);}
 hitAt=Date.now();const post=await evalSafe();
 const event=observed&&{...observed};const result=adjudicate({calibration:cal,event:event&&{...event,exactCurrentTarget:event.exactCurrentTarget},pre:{root:'root',query:'',scrollY:pre.scrollY,closed:true,ownerIdle:true},post:{root:post.root?'root':'changed',query:post.query,scrollY:post.scrollY,closed:post.closed,ownerIdle:post.ownerIdle}});
 c.report.steps.push({name:'trusted native click and unchanged prestate',at:new Date().toISOString(),elapsedAfterInputMs:Date.now()-inputAt,...result,poststate:{root:post.root,emptyQuery:post.query==='',scrollY:post.scrollY,playerClosed:post.closed,ownersIdle:post.ownerIdle},event:{isTrusted:event.isTrusted,exactCurrentTarget:event.exactCurrentTarget,clientX:event.clientX,clientY:event.clientY},inputToEventMatchMs:Date.now()-inputAt});
 if(Date.now()-inputAt>30000)throw Error('GEOMETRY_UNIT_DEADLINE');
 c.report.completed=true;c.report.accepted=true;
}finally{
 if(listenerInstalled)try{const clean=await c.evaluateNative(expressions.cleanup);c.report.observerCleanup=clean;listenerInstalled=false;}catch{c.report.observerCleanup={listenerRemoved:false,scrollRestored:false};}
 if(tempMade)try{c.adb(['shell','rm','-f',temp]);c.report.ownedAndroidXmlDeleted=true;tempMade=false;}catch{c.report.ownedAndroidXmlDeleted=false;}
 c.report.actualInputIssued=c.report.steps.some(s=>s.name==='single native tap issued');c.report.rawXmlOrLabelsExported=false;
 }
});

