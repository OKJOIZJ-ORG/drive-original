// Invoke as a function in an owned signed-in Drive Original QA tab, after a
// complete, unfiltered subtree listing in window.__formatAudit. Read-only.
() => {
  const a = window.__formatAudit;
  if (!a || !['listed','done','cancelled'].includes(a.phase) || a.active) throw new Error('SURVEY_LISTING_REQUIRED');
  function sniff(b) {
    const ascii = (p, n) => String.fromCharCode(...b.subarray(p, p + n));
    const has = (v, p = 0) => v.every((n, i) => b[p + i] === n);
    if (has([0x89,80,78,71,13,10,26,10])) return 'png';
    if (has([255,216,255])) return 'jpeg';
    if (/^GIF8[79]a$/.test(ascii(0,6))) return 'gif';
    if (ascii(0,2) === 'BM') return 'bmp';
    if (ascii(0,4) === 'RIFF') return ({WEBP:'webp','AVI ':'avi',WAVE:'wav'})[ascii(8,4)] || 'riff';
    if (has([0x1a,0x45,0xdf,0xa3])) return /webm/.test(ascii(0,b.length)) ? 'webm' : /matroska/.test(ascii(0,b.length)) ? 'matroska' : 'ebml';
    for (const [stride, offset, kind] of [[188,0,'ts'],[192,4,'m2ts'],[204,0,'ts204']]) {
      if ([0,1,2,3,4].every(i => b[offset + stride*i] === 0x47)) return kind;
    }
    if (b.length >= 12 && ascii(4,4) === 'ftyp') {
      const brand = ascii(8,4);
      if (/^(avif|avis)$/.test(brand)) return 'avif';
      if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return 'heif';
      return brand === 'qt  ' ? 'quicktime' : 'iso';
    }
    if (['moov','mdat','wide','free','skip'].includes(ascii(4,4))) return 'iso-no-ftyp';
    if (ascii(0,3) === 'FLV') return 'flv';
    if (ascii(0,4) === 'OggS') return 'ogg';
    if (ascii(0,4) === 'fLaC') return 'flac';
    if (ascii(0,3) === 'ID3' || (b[0]===255 && (b[1]&0xe0)===0xe0)) return 'mpeg-audio';
    if (has([0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11,0xa6,0xd9,0x00,0xaa,0x00,0x62,0xce,0x6c])) return 'asf';
    if (has([0,0,1,0xba]) || has([0,0,1,0xb3])) return 'mpeg-ps';
    if (ascii(0,4) === '%PDF') return 'pdf';
    if (has([0x50,0x4b,3,4])) return 'zip';
    return 'unknown';
  }
  const extensions = {jpeg:['jpg','jpeg','jfif'],png:['png'],gif:['gif'],bmp:['bmp'],webp:['webp'],avif:['avif'],heif:['heic','heif'],ts:['ts','mts'],m2ts:['m2ts','mts'],ts204:['ts'],iso:['mp4','m4v','m4a','mov','3gp','3g2'],quicktime:['mov','mp4','m4v'],'iso-no-ftyp':['mov','mp4','m4v','m4a','3gp'],webm:['webm'],matroska:['mkv','mka','mk3d'],avi:['avi'],flv:['flv'],ogg:['ogg','ogv','opus'],flac:['flac'],'mpeg-audio':['mp3','aac','mp2'],wav:['wav'],asf:['wmv','asf','wma'],'mpeg-ps':['mpg','mpeg','vob'],pdf:['pdf'],zip:['zip']};
  a.results=(a.results||[]).filter(r=>r.kind!=='read-error' && (r.kind!=='ts' || r.transportHeader));
  const completed=new Set(a.results.map(r=>r.id));
  a.pendingFiles=a.files.filter(f=>!completed.has(f.id));
  a.controller=new AbortController();
  a.phase='sniffing';a.cursor=0;a.active=0;a.received=a.results.reduce((n,r)=>n+(r.bytes||0),0);
  a.task=Promise.all(Array.from({length:16},async()=>{
    while(!a.controller.signal.aborted) {
      const file=a.pendingFiles[a.cursor++];if(!file)break;
      const ext=(file.name.match(/\.([^.]+)$/)?.[1]||'').toLowerCase();
      if(file.mimeType?.startsWith('application/vnd.google-apps.') || Number(file.size)===0) {a.results.push({id:file.id,ext,kind:'skipped-non-binary'});continue;}
      const c=new AbortController(),abort=()=>c.abort();a.controller.signal.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>c.abort(),20000);let reader;
      a.active++;
      try {
        const headers={Range:'bytes=0-1023'};
        if(file.resourceKey)headers['X-Goog-Drive-Resource-Keys']=`${file.id}/${file.resourceKey}`;
        const r=await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`,{headers,signal:c.signal});
        reader=r.body.getReader();const bytes=new Uint8Array(1024);let used=0;
        while(used<bytes.length){const {value,done}=await reader.read();if(done)break;const n=Math.min(value.length,bytes.length-used);bytes.set(value.subarray(0,n),used);used+=n;}
        await reader.cancel();reader.releaseLock();reader=null;
        const kind=sniff(bytes.subarray(0,used));a.received+=used;
        a.results.push({id:file.id,ext,kind,bytes:used,status:r.status,extensionMismatch:!!extensions[kind]&&!extensions[kind].includes(ext),signature:Array.from(bytes.subarray(0,Math.min(32,used))).map(x=>x.toString(16).padStart(2,'0')).join(''),...(kind==='ts'?{transportHeader:btoa(String.fromCharCode(...bytes.subarray(0,used)))}:{})});
      } catch(e) {a.results.push({id:file.id,ext,kind:'read-error',error:e.name,status:e.status||0});}
      finally {try{await reader?.cancel();reader?.releaseLock();}catch{}clearTimeout(timer);a.controller.signal.removeEventListener('abort',abort);a.active--;}
    }
  })).then(()=>{a.phase=a.controller.signal.aborted?'cancelled':'done';a.finished=Date.now();});
  return {started:true,files:a.files.length,concurrency:16,maxHeaderBytes:1024};
}
