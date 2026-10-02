'use strict';
// Private transient Android accessibility XML is reduced immediately. No labels/XML export.
function decode(s){return s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));}
function target(xml,expected,width,height){
 if(typeof xml!=='string'||xml.length>1024*1024||typeof expected!=='string'||!expected||expected.length>200)throw Error('NATIVE_POPUP_ADMISSION');
 const rows=[];for(const tag of xml.match(/<node\s[^>]*>/g)||[]){const attrs={};for(const m of tag.matchAll(/([\w-]+)="([^"]*)"/g))attrs[m[1]]=decode(m[2]);
  if(attrs.package!=='com.android.chrome'||attrs.text!==expected||attrs.enabled!=='true')continue;
  const m=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attrs.bounds||'');if(!m)continue;const [left,top,right,bottom]=m.slice(1).map(Number);
  if(left<0||top<0||right>width||bottom>height||right<=left||bottom<=top)continue;
  rows.push({left,top,right,bottom,x:Math.round((left+right)/2),y:Math.round((top+bottom)/2),selected:attrs.selected==='true',checked:attrs.checked==='true',focused:attrs.focused==='true'});
 }
 return{available:rows.length===1,matchingOptionNodes:rows.length,...(rows.length===1?rows[0]:{}),rawXmlOrLabelsExported:false};
}
module.exports={target};
