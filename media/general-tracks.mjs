import {Input, BufferSource, MP4, QTFF} from './mediabunny-q1.mjs';
import {createGeneralSource} from './general-source.mjs';
import {inspectGeneralMoov, GENERAL_LIMITS} from './general-admission.mjs';
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

// Listing metadata has no sample-index allocation. Playback still uses its
// stricter admission unchanged; a long film can have known tracks even when
// this browser cannot safely construct a selectable playback index for it.
export function inspectGeneralTrackDescriptions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const require = (ok, code) => { if (!ok) throw new Error(`GENERAL_${code}`); };
  const type = p => String.fromCharCode(...bytes.subarray(p, p + 4));
  let boxes = 0;
  const children = (start, end, depth = 0) => {
    require(depth <= 8, 'BOX_DEPTH'); const out = [];
    for (let p = start; p < end;) {
      require(p + 8 <= end && ++boxes <= GENERAL_LIMITS.boxes, 'BOX_HEADER');
      let n = view.getUint32(p), header = 8;
      if (n === 1) { require(p + 16 <= end, 'BOX_HEADER'); const raw = view.getBigUint64(p + 8); require(raw <= BigInt(Number.MAX_SAFE_INTEGER), 'BOX_INTEGER'); n = Number(raw); header = 16; }
      else if (n === 0) n = end - p;
      require(n >= header && p + n <= end, 'BOX_BOUNDS');
      out.push({type: type(p + 4), body: p + header, end: p + n}); p += n;
    }
    return out;
  };
  const one = (list, name) => { const found = list.filter(b => b.type === name); require(found.length === 1, 'TRACK_DESCRIPTION_REQUIRED'); return found[0]; };
  const moov = one(children(0, bytes.length), 'moov'), roots = children(moov.body, moov.end, 1);
  const tracks = roots.filter(b => b.type === 'trak'); require(tracks.length > 0 && tracks.length <= GENERAL_LIMITS.tracks, 'TRACK_LIMIT');
  const ids = new Set();
  return tracks.map(trak => {
    const tc = children(trak.body, trak.end, 2), tkhd = one(tc, 'tkhd');
    require(tkhd.body + 4 <= tkhd.end && [0, 1].includes(bytes[tkhd.body]), 'TRACK_ID');
    const at = tkhd.body + (bytes[tkhd.body] === 1 ? 20 : 12); require(at + 4 <= tkhd.end, 'TRACK_ID');
    const trackId = view.getUint32(at); require(trackId > 0 && !ids.has(trackId), 'TRACK_ID'); ids.add(trackId);
    const mdia = one(tc, 'mdia'), mc = children(mdia.body, mdia.end, 3), hdlr = one(mc, 'hdlr'), mdhd = one(mc, 'mdhd');
    require(hdlr.body + 12 <= hdlr.end && mdhd.body + 4 <= mdhd.end && [0, 1].includes(bytes[mdhd.body]), 'TRACK_HANDLER');
    const handler = type(hdlr.body + 8), languageAt = mdhd.body + (bytes[mdhd.body] === 1 ? 32 : 20);
    require(languageAt + 2 <= mdhd.end, 'TRACK_DESCRIPTION_REQUIRED'); const packed = view.getUint16(languageAt);
    const language = packed ? String.fromCharCode(((packed >> 10) & 31) + 96, ((packed >> 5) & 31) + 96, (packed & 31) + 96) : 'und';
    const minf = one(mc, 'minf'), stbl = one(children(minf.body, minf.end, 4), 'stbl'), stsd = one(children(stbl.body, stbl.end, 5), 'stsd');
    require(stsd.body + 24 <= stsd.end && view.getUint32(stsd.body + 4) === 1, 'SAMPLE_DESCRIPTION_UNQUALIFIED');
    const entry = stsd.body + 8, length = view.getUint32(entry); require(length >= 16 && entry + length === stsd.end, 'SAMPLE_DESCRIPTION_BOUNDS');
    return {trackId, handler, language, codec: type(entry + 4)};
  });
}

async function readTrackMetadata(rpc) {
  const type = b => String.fromCharCode(...b.subarray(4, 8));
  const head = await rpc.exact(0, Math.min(rpc.size, 1024));
  if (head.length >= 564 && [0,188,376].every(p => head[p] === 0x47)) throw new Error('GENERAL_CONTAINER_UNQUALIFIED');
  if (!['ftyp','moov','mdat','wide','free','skip','uuid'].includes(type(head))) throw new Error('GENERAL_CONTAINER_UNQUALIFIED');
  let p = 0, moov, ftyp; const mdatRanges = [];
  for (let n = 0; p < rpc.size; n++) {
    if (n >= 256) throw new Error('GENERAL_BOX_COUNT');
    const b = await rpc.exact(p, Math.min(16, rpc.size - p));
    if (b.length < 8) throw new Error('GENERAL_BOX_HEADER');
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength); let length = view.getUint32(0), header = 8;
    if (length === 1) { if (b.length < 16 || view.getBigUint64(8) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('GENERAL_BOX_INTEGER'); length = Number(view.getBigUint64(8)); header = 16; }
    else if (length === 0) length = rpc.size - p;
    if (length < header || p + length > rpc.size) throw new Error('GENERAL_BOX_BOUNDS');
    const name = type(b);
    if (name === 'moof') throw new Error('GENERAL_FRAGMENTED_INPUT_UNQUALIFIED');
    if (name === 'moov') { if (moov || length > GENERAL_LIMITS.moovBytes) throw new Error('GENERAL_MOOV_LIMIT'); moov = await rpc.exact(p, length); }
    if (name === 'ftyp') { if (ftyp || length > 4096) throw new Error('GENERAL_CONTAINER_UNQUALIFIED'); ftyp = await rpc.exact(p, length); }
    if (name === 'mdat') mdatRanges.push([p + header, p + length]); p += length;
  }
  if (!moov || !ftyp) throw new Error('GENERAL_CONTAINER_UNQUALIFIED');
  return {moov, ftyp, mdatRanges, size: rpc.size};
}

// Independent short-lived reader of the same pinned source. Only bounded
// container metadata/configuration is inspected; no packet sink or codec instance.
export async function probePinnedGeneralTracks(source, {signal, isCurrent = () => true, scope = globalThis} = {}) {
  // One bounded metadata pass. Larger reads amortize Drive's fresh pre/post
  // revision checks; local BufferSource avoids fetching those same tables twice.
  const blockSize = Number(source.identity?.size) >= 4*1024*1024 ? 524288 : 65536;
  const rpc = createGeneralSource(source, {signal,isCurrent,blockSize,maxCacheSize:524288,discoveryBytes:8*1024*1024});
  let input, result, failure;
  try {
    let admission, metadata, descriptions;
    try {
      metadata = await readTrackMetadata(rpc);
      descriptions = inspectGeneralTrackDescriptions(metadata.moov);
      admission = {kind:'iso',...inspectGeneralMoov(metadata.moov,{audioCodecs:GENERAL_AUDIO_CODECS})};
    }
    catch (error) {
      if (!['GENERAL_CODEC_UNQUALIFIED','GENERAL_CONTAINER_UNQUALIFIED','GENERAL_FRAGMENTED_INPUT_UNQUALIFIED','GENERAL_ISO_FEATURE_UNQUALIFIED','GENERAL_AUDIO_DESCRIPTION_UNQUALIFIED','GENERAL_EXPANDED_INDEX_LIMIT','GENERAL_AGGREGATE_SAMPLES_LIMIT','GENERAL_TABLE_ENTRIES_LIMIT','GENERAL_AGGREGATE_ENTRIES_LIMIT','GENERAL_MOOV_LIMIT'].includes(error.message)) throw error;
      result={kind:descriptions?'iso':'unqualified',audioTracks:(descriptions||[]).filter(t=>t.handler==='soun').map(t=>({...t,label:`${t.language === 'und' ? 'Audio' : t.language} (${t.trackId})`,route:'unqualified',reason:error.message})),defaultAudioTrackId:null,reason:error.message};
    }
    if (!result && admission.kind !== 'iso') result={kind:admission.kind,audioTracks:[],defaultAudioTrackId:null,reason:'non-iso'};
    if (!result) {
      const localBytes = new Uint8Array(metadata.ftyp.length + metadata.moov.length);
      localBytes.set(metadata.ftyp); localBytes.set(metadata.moov, metadata.ftyp.length);
      input = new Input({source:new BufferSource(localBytes),formats:[MP4,QTFF]});
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
    if (descriptions) {
      result.subtitleTracks = descriptions.filter(t=>['text','sbtl','subt'].includes(t.handler));
      if (result.subtitleTracks.length) result.subtitleMetadata = {moov:metadata.moov,mdatRanges:metadata.mdatRanges,size:metadata.size,identity:{...source.identity}};
    }
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
