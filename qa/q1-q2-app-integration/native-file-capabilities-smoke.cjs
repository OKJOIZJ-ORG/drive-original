'use strict';
// Reuse the maintained app/SW synthetic-provider owner/drain harness. These
// replacements alter only its cases, capability observations, and report path;
// the HTTP server still serves every product file byte-for-byte.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const harnessPath=path.join(__dirname,'native-retirement-smoke.cjs');
let source=fs.readFileSync(harnessPath,'utf8').replace(/\r\n/g,'\n');
function replace(before,after){if(!source.includes(before))throw Error('Harness anchor missing');source=source.replace(before,after);}
replace("'native-retirement-smoke-results.json'","'native-file-capabilities-smoke-results.json'");
replace("const cases=[{name:'ac3-auto',fixture:'ac3',q2:true},{name:'eac3-auto',fixture:'eac3',q2:true},{name:'aac-native',fixture:'aac'},{name:'webm-skip-native',fixture:'webm'},{name:'ac3-manual-q1-q2',fixture:'ac3',q2:true,manual:true},{name:'probe-drift-cleanup',fixture:'aac',drift:true}];",
 "const cases=[{name:'ac3-native-capability-route',fixture:'ac3'},{name:'eac3-native-capability-route',fixture:'eac3'},{name:'aac-native-capability-route',fixture:'aac'}];");
replace("   await page.evaluate(({size,mime,trial})=>{",`   result.capabilities=await page.evaluate(async fixturePath=>{
    const {Input,BufferSource,MP4,QTFF}=await import('./media/mediabunny-q1.mjs');
    const {observeNativeFileSupport}=await import('./media/audio-runtime.mjs');
    const bytes=new Uint8Array(await (await fetch(fixturePath)).arrayBuffer());
    const input=new Input({source:new BufferSource(bytes),formats:[MP4,QTFF]});
    try {
     const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
     const videoConfig=await video.getDecoderConfig(),audioConfig=await audio.getDecoderConfig();
     const container=(await input.getFormat())===QTFF?'video/quicktime':'video/mp4';
     const nativeFile=observeNativeFileSupport(videoConfig,audioConfig,{container});
     let webCodecsInput=null,opusOutput=null;
     try{webCodecsInput=(await AudioDecoder.isConfigSupported(audioConfig)).supported;}catch(_){}
     try{opusOutput=(await AudioEncoder.isConfigSupported({codec:'opus',numberOfChannels:2,sampleRate:48000,bitrate:320000})).supported;}catch(_){}
     return {nativeFile,webCodecsInput,opusOutput,mseOpus:MediaSource.isTypeSupported('audio/mp4; codecs="opus"'),
      video:{codec:videoConfig.codec,codedWidth:videoConfig.codedWidth,codedHeight:videoConfig.codedHeight},
      audio:{codec:audioConfig.codec,numberOfChannels:audioConfig.numberOfChannels,sampleRate:audioConfig.sampleRate}};
    }finally{input.dispose();}
   },fixtures[trial.fixture]);
   trial.q2=trial.fixture!=='aac'&&result.capabilities.nativeFile.supported===false
    &&result.capabilities.opusOutput===true&&result.capabilities.mseOpus===true;
   save();
   await page.evaluate(({size,mime,trial})=>{`);
replace("Installed isolated Chrome, fresh browser per case, actual app/SW/players, synthetic provider only. Manual case suppresses automatic planner to isolate controlled Q1-to-Q2 fallback. Drift case changes probe metadata only. No account/device/production proof.",
 "Installed isolated Chrome, three fresh browsers, unmodified product app/SW/players and synthetic provider. Exact combined native file and WebCodecs/Opus capabilities observed from parsed AVC+AC3/EAC3/AAC fixtures before automatic route. Expected route follows observed native file support; no real account/device/production proof.");
replace("const selectedName=process.argv[2];",`report.harness={base:'native-retirement-smoke.cjs',baseSha256:'${crypto.createHash('sha256').update(fs.readFileSync(harnessPath)).digest('hex')}',adapterSha256:'${crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}'};\nconst selectedName=process.argv[2];`);
const compiled=new Module(__filename,module);compiled.filename=__filename;compiled.paths=module.paths;compiled._compile(source,__filename);
