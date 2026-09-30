// Evaluated only in an owned isolated worker inspector before its original start.
// Native encode/output/configure/close calls are forwarded unchanged. Scalar
// clocks leave via an inspector binding, never product Worker messages.
({id}) => {
 const Native=AudioEncoder;let serial=0;
 self.AudioEncoder=class extends Native {
  constructor(init){
   const row={workerId:id,encoderId:++serial,configured:null,inputCount:0,inputFrames:0,outputCount:0,firstInput:null,lastInput:null,firstOutput:null,lastOutput:null,inputBackwards:0,outputBackwards:0,outputGaps:0,closed:false};
   let emittedSecond=-1;
   const emit=reason=>qaLongAudioBinding(JSON.stringify({reason,...row}));
   super({...init,output(chunk,metadata){const item={timestamp:chunk.timestamp,duration:chunk.duration??null,bytes:chunk.byteLength};
    if(row.lastOutput&&item.timestamp<row.lastOutput.timestamp)row.outputBackwards++;
    if(row.lastOutput?.duration&&Math.abs(item.timestamp-(row.lastOutput.timestamp+row.lastOutput.duration))>2)row.outputGaps++;
    row.firstOutput??=item;row.lastOutput=item;row.outputCount++;
    const second=Math.floor(item.timestamp/1000000);if(second!==emittedSecond&&(second%30===0||second>=295&&second<=305||second>=418)){emittedSecond=second;emit('output-clock');}
    return init.output(chunk,metadata);
   }});
   this.qaAudioRow=row;this.qaAudioEmit=emit;emit('created');
  }
  configure(config){this.qaAudioRow.configured={codec:config.codec,sampleRate:config.sampleRate,numberOfChannels:config.numberOfChannels,bitrate:config.bitrate};const value=super.configure(config);this.qaAudioEmit('configured');return value;}
  encode(sample){const row=this.qaAudioRow,item={timestamp:sample.timestamp,frames:sample.numberOfFrames,sampleRate:sample.sampleRate};
   if(row.lastInput&&item.timestamp<row.lastInput.timestamp)row.inputBackwards++;row.firstInput??=item;row.lastInput=item;row.inputCount++;row.inputFrames+=item.frames;return super.encode(sample);
  }
  close(){const value=super.close();this.qaAudioRow.closed=true;this.qaAudioEmit('closed');return value;}
 };
 return {installed:true,workerId:id,nativeAudioEncoder:typeof Native==='function'};
}
