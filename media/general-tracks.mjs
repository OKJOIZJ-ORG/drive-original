import {Input, MP4, QTFF} from './mediabunny-q1.mjs';
import {createGeneralSource} from './general-source.mjs';
import {admitGeneralInput} from './general-admission.mjs';
import {createAvcPacketGuard} from './general-codec.mjs';
import {audioProfile, observeAudioCompatibility, observeNativeFileSupport} from './audio-runtime.mjs';

export const GENERAL_AUDIO_CODECS = Object.freeze(['mp4a','ac-3','ec-3']);
export function validateGeneralAudioSelection(trackId) {
  if (trackId !== undefined && (!Number.isSafeInteger(trackId) || trackId <= 0 || trackId > 0xffffffff))
    throw new Error('GENERAL_AUDIO_SELECTION_INVALID');
}
// Identity is the container's tkhd ID, never a language, label or array index.
// A stale choice must fail rather than fall back to another audio stream.
export async function resolveGeneralAudioTrack(input, admission, selectedAudioTrackId) {
  validateGeneralAudioSelection(selectedAudioTrackId);
  if (selectedAudioTrackId === undefined) return input.getPrimaryAudioTrack();
  if (admission.kind !== 'iso') throw new Error('GENERAL_AUDIO_SELECTION_CONTAINER_UNQUALIFIED');
  const audio = (await input.getAudioTracks()).find(track => track.id === selectedAudioTrackId);
  if (!audio || !admission.trackInfo.some(track => track.trackId === selectedAudioTrackId && track.handler === 'soun'))
    throw new Error('GENERAL_AUDIO_SELECTION_MISSING');
  return audio;
}
export const qualifiedGeneralAac = config => config?.codec === 'mp4a.40.2'
  && [44100,48000].includes(config.sampleRate) && [1,2].includes(config.numberOfChannels);

// Independent short-lived reader of the same pinned source. Only bounded
// container metadata/configuration is inspected; no packet sink or codec instance.
export async function probePinnedGeneralTracks(source, {signal, isCurrent = () => true, scope = globalThis} = {}) {
  const rpc = createGeneralSource(source, {signal,isCurrent});
  let input, result, failure;
  try {
    let admission;
    try { admission = await admitGeneralInput(rpc, {audioCodecs:GENERAL_AUDIO_CODECS}); }
    catch (error) {
      if (!['GENERAL_CODEC_UNQUALIFIED','GENERAL_CONTAINER_UNQUALIFIED','GENERAL_FRAGMENTED_INPUT_UNQUALIFIED','GENERAL_ISO_FEATURE_UNQUALIFIED','GENERAL_AUDIO_DESCRIPTION_UNQUALIFIED'].includes(error.message)) throw error;
      result={kind:'unqualified',audioTracks:[],defaultAudioTrackId:null,reason:error.message};
    }
    if (!result && admission.kind !== 'iso') result={kind:admission.kind,audioTracks:[],defaultAudioTrackId:null,reason:'non-iso'};
    if (!result) {
      input = new Input({source:rpc.custom,formats:[MP4,QTFF]});
      const videos=await input.getVideoTracks(),audios=await input.getAudioTracks();rpc.check();
      const primary=await input.getPrimaryAudioTrack();rpc.check();
      const video=videos.length===1&&videos[0].codec==='avc'?videos[0]:null;
      const videoConfig=video&&await video.getDecoderConfig();rpc.check();
      let videoQualified=!!video;
      if(video)try{createAvcPacketGuard(videoConfig,true);}catch{videoQualified=false;}
      const container=(await input.getFormat())===QTFF?'video/quicktime':'video/mp4';
      const audioTracks=[];
      for (const audio of audios) {
        rpc.check();
        if (!Number.isSafeInteger(audio.id)||audio.id<=0||!admission.trackInfo.some(t=>t.trackId===audio.id&&t.handler==='soun')) throw new Error('GENERAL_TRACK_ID');
        const language=await audio.getLanguageCode(),name=await audio.getName(),config=await audio.getDecoderConfig();rpc.check();
        let route='unqualified',reason='video-unqualified',capability,nativeFile;
        if (videoQualified && audio.codec==='aac') {
          route=qualifiedGeneralAac(config)?'q1':'unqualified';reason=route==='q1'?'qualified-aac-copy':'aac-configuration-unqualified';
        } else if (videoQualified && ['ac3','eac3'].includes(audio.codec)) {
          try { audioProfile(config); }
          catch { reason='audio-profile-unqualified'; }
          if (reason!=='audio-profile-unqualified') {
            const info=admission.trackInfo.find(t=>t.trackId===video.id);
            if(info?.reordered||!videoConfig.colorSpace?.matrix||typeof videoConfig.colorSpace.fullRange!=='boolean') reason='q2-video-configuration-unqualified';
            else {
              nativeFile=observeNativeFileSupport(videoConfig,config,{scope,container});rpc.check();
              if(nativeFile.supported!==false) reason=nativeFile.supported===true?'native-file-supported':'native-file-support-unknown';
              else {capability=await observeAudioCompatibility(config,scope,{signal});rpc.check();route=capability.eligible?'q2':'unqualified';reason=capability.eligible?'qualified-ac3-eac3':'q2-capability-unavailable';}
            }
          }
        }
        const label=(typeof name==='string'&&name.trim()?name.trim().slice(0,80):language&&language!=='und'?language:'Audio')+` (${audio.id})`;
        audioTracks.push({trackId:audio.id,language:language||'und',label,codec:audio.codec,route,reason,...(capability?{capability}:{}),...(nativeFile?{nativeFile}:{})});
      }
      result={kind:'iso',audioTracks,defaultAudioTrackId:primary?.id??null,admission};
    }
    rpc.check();result.identity={...source.identity};
  } catch(error) {failure=error;}
  finally {
    input?.dispose();const cleanup=await rpc.cleanup();
    if(!cleanup.settled&&!failure)failure=new Error('GENERAL_PROBE_CLEANUP_UNSETTLED');
    if(failure){failure.cleanup=cleanup;failure.reads={...rpc.metrics};}
    if(result){result.cleanup=cleanup;result.reads={...rpc.metrics};}
  }
  if(failure)throw failure;
  return result;
}
