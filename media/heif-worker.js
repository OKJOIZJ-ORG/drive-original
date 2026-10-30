'use strict';
// One job per worker. Caller enforces a wall timeout and terminates on every
// completion/cancellation. Only the same-origin pinned static decoder is loaded.
let started=false;
self.onmessage=async({data})=>{
  if(started)return;started=true;
  let images=[],decoder=null,library=null;
  const demand=(value,code)=>{if(!value)throw new Error(code);};
  try{
    demand(data?.bytes instanceof ArrayBuffer&&data.bytes.byteLength>=16&&data.bytes.byteLength<=32*1024*1024,'HEIF_INPUT_LIMIT');
    demand(typeof OffscreenCanvas==='function'&&typeof ImageData==='function','HEIF_CANVAS_UNAVAILABLE');
    importScripts('./heif-decoder.js');
    library=await libheif({print:()=>{},printErr:()=>{}});
    decoder=new library.HeifDecoder();images=decoder.decode(new Uint8Array(data.bytes));
    demand(Array.isArray(images)&&images.length>0,'HEIF_DECODE_FAILED');
    const image=images.find(value=>value.is_primary());demand(image,'HEIF_PRIMARY_UNAVAILABLE');
    const width=image.get_width(),height=image.get_height();
    demand(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width*height<=16000000,'HEIF_PIXEL_LIMIT');
    // An SDR RGBA8 canvas is not an HDR renderer. Do not silently discard a
    // high-bit-depth source's range or claim ICC/HDR color fidelity.
    // The pinned package binds width/height but exposes depth only through its
    // raw C ABI. Validate its embind pointer before that call; fail closed if
    // a later decoder replacement changes this representation.
    const pointer=image.handle?.$$?.ptr;demand(Number.isSafeInteger(pointer)&&pointer>0,'HEIF_DECODER_API');
    demand(library._heif_image_handle_get_luma_bits_per_pixel(pointer)===8,'HEIF_DEPTH_UNSUPPORTED');
    const pixels=new ImageData(width,height);
    await new Promise((resolve,reject)=>image.display(pixels,result=>result?resolve():reject(new Error('HEIF_DECODE_FAILED'))));
    const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d');demand(context,'HEIF_CANVAS_UNAVAILABLE');
    context.putImageData(pixels,0,0);
    const blob=await canvas.convertToBlob({type:'image/png'});
    self.postMessage({blob,width,height,sourceFrames:images.length});
  }catch(error){self.postMessage({error:/^HEIF_[A-Z_]+$/.test(error?.message)?error.message:'HEIF_DECODE_FAILED'});}
  finally{
    for(const image of images)try{image.free();}catch{}
    if(library&&decoder?.decoder)try{library.heif_context_free(decoder.decoder);decoder.decoder=null;}catch{}
    self.close();
  }
};
