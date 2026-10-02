'use strict';
// Chrome protocol UI input on the physical Android browser, in CSS coordinates.
// This does not claim an Android OS tap or a human finger action.
function point(g,viewport){
 const x=g?.x,y=g?.y,width=viewport?.width,height=viewport?.height;
 if(!g?.available||![x,y,width,height].every(Number.isFinite)||width<=0||height<=0||x<0||y<0||x>=width||y>=height)throw Error('Q0_CDP_POINT_UNAVAILABLE');
 return{x,y};
}
async function command(session,method,params){let timer;try{return await Promise.race([session.send(method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Q0_CDP_INPUT_DEADLINE')),5000);})]);}finally{clearTimeout(timer);}}
async function click(session,g,viewport){const p=point(g,viewport);let pressed=false;try{pressed=true;await command(session,'Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await command(session,'Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});pressed=false;}finally{if(pressed)await command(session,'Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1}).catch(()=>{});}return{input:'Chrome CDP mouse',cssCoordinates:true,osTap:false};}
async function replaceText(session,value){if(typeof value!=='string'||value.length>240)throw Error('Q0_CDP_QUERY_BOUND');
 const key=async(key,code,n,modifiers=0)=>{let down=false;const p={key,code,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n,modifiers};try{down=true;await command(session,'Input.dispatchKeyEvent',{type:'keyDown',...p});await command(session,'Input.dispatchKeyEvent',{type:'keyUp',...p});down=false;}finally{if(down)await command(session,'Input.dispatchKeyEvent',{type:'keyUp',...p}).catch(()=>{});}};
 await key('a','KeyA',65,2);await key('Backspace','Backspace',8);if(value)await command(session,'Input.insertText',{text:value});
 return{input:'Chrome CDP select-all/backspace/insertText',rawTextExported:false};
}
function observeCard(point){
 if(window.__q0CdpInput)throw Error('Q0_CDP_INPUT_BUSY');
 const selected=[...document.querySelectorAll('.file-card-open')].filter(n=>n.closest('.file-card')?.dataset.fileId===window.__resumeReplayTarget30?.target?.id);
 if(selected.length!==1)throw Error('Q0_CDP_CARD_AMBIGUOUS');
 const node=selected[0],record={observed:false,trusted:false,exactCard:false,pointMatched:false,count:0};
 const listener=e=>{if(e.target!==node&&!node.contains(e.target))return;record.count++;record.observed=true;record.trusted=e.isTrusted;record.exactCard=true;record.pointMatched=Math.abs(e.clientX-point.x)<=2&&Math.abs(e.clientY-point.y)<=2;};
 document.addEventListener('click',listener,true);
 window.__q0CdpInput={read:()=>({...record}),stop:()=>{document.removeEventListener('click',listener,true);return{listenerRemoved:true,snapshot:{...record}};}};
 return{passiveListenerInstalled:true,rawIdentifiersExported:false};
}
module.exports={point,click,replaceText,observeCard};
