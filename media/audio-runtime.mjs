/* MPL-2.0. AC3/EAC3 bridge adaptation; Vanilagy and contributors.
 * See audio-codec.LICENSE.txt and audio-codec-build.json for corresponding source. */
export const AUDIO_BOUNDS = Object.freeze({ initialHeapBytes: 33554432, maxHeapBytes: 67108864,
  maxPacketBytes: 65536, maxFrames: 4096, maxPcmBytes: 32768, maxContexts: 1 });
export const AUDIO_OUTPUT_STATUS = Object.freeze({ level: 'Q2', video: 'original-encoded-copy',
  audio: 'lossy-transformed', codec: 'opus', bitrate: 320000, bitPerfectAudio: false });
const error = code => new Error(code);
const need = (value, code) => { if (!value) throw error(code); };
export function audioProfile(config) {
  need(config && ['ac-3', 'ec-3'].includes(config.codec), 'AUDIO_CODEC_UNQUALIFIED');
  need(config.numberOfChannels === 2 && config.sampleRate === 48000, 'AUDIO_STEREO_48K_REQUIRED');
  return Object.freeze({ codec: config.codec, numberOfChannels: 2, sampleRate: 48000,
    codecId: config.codec === 'ac-3' ? 0 : 1 });
}
export function audioWindow(mapping) {
  need(mapping && Number.isSafeInteger(mapping.generation) && mapping.generation >= 0,
    'AUDIO_WINDOW_GENERATION');
  need(Number.isFinite(mapping.sourceStart) && Number.isFinite(mapping.sourceEnd)
    && mapping.sourceEnd > mapping.sourceStart && Number.isFinite(mapping.presentationOrigin), 'AUDIO_WINDOW_CLOCK');
  return Object.freeze({ generation: mapping.generation, sourceStart: mapping.sourceStart,
    sourceEnd: mapping.sourceEnd, presentationOrigin: mapping.presentationOrigin, timestampMode: 'source-unchanged' });
}
// HTML file playback and WebCodecs have different decoder capability surfaces.
// Query the exact combined codecs without inventing MediaCapabilities bitrate
// or frame-rate metadata. 'maybe' and absent/rejecting APIs remain unknown.
export function observeNativeFileSupport(videoConfig, audioConfig, {scope=globalThis,container='video/mp4'}={}) {
  if (!['video/mp4','video/quicktime'].includes(container)
    || !/^avc[13]\.[A-Fa-f0-9]{6}$/.test(videoConfig?.codec || '')
    || !/^(?:ac-3|ec-3|mp4a\.40\.\d+)$/.test(audioConfig?.codec || '')) {
    return Object.freeze({supported:null,authority:'html-can-play-type',reason:'configuration-unqualified'});
  }
  const contentType=`${container}; codecs="${videoConfig.codec},${audioConfig.codec}"`;
  try {
    const element=scope.document?.createElement?.('video');
    if (typeof element?.canPlayType !== 'function') return Object.freeze({supported:null,authority:'html-can-play-type',contentType,reason:'api-unavailable'});
    const answer=element.canPlayType(contentType);
    return Object.freeze({supported:answer==='probably'?true:answer===''?false:null,
      authority:'html-can-play-type',contentType,answer:typeof answer==='string'?answer:null});
  } catch (_) { return Object.freeze({supported:null,authority:'html-can-play-type',contentType,reason:'query-failed'}); }
}
async function codecSupport(api,config,{signal}={}) {
  const cancelled=()=>error('GENERAL_CANCELLED');
  if (signal?.aborted) throw cancelled();
  let abort;
  try { if (typeof api?.isConfigSupported !== 'function') return null;
    const query=Promise.resolve().then(()=>{if(signal?.aborted)throw cancelled();return api.isConfigSupported(config);});
    const result=await (signal?Promise.race([query,new Promise((_,reject)=>{
      abort=()=>reject(cancelled());signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)abort();
    })]):query);
    if(signal?.aborted)throw cancelled();
    return typeof result?.supported==='boolean'?result.supported:null;
  } catch (_) { if(signal?.aborted)throw cancelled();return null; }
  finally {if(abort)signal.removeEventListener('abort',abort);}
}
export async function observeAudioCompatibility(config, scope = globalThis, {signal}={}) {
  if(signal?.aborted)throw error('GENERAL_CANCELLED');
  audioProfile(config);
  // Diagnostic only: WebCodecs input support is independent of HTML Q0 and
  // does not control whether our WASM decoder can produce qualified Q2 output.
  const nativeInputSupported = await codecSupport(scope.AudioDecoder,config,{signal});
  const outputConfig = Object.freeze({ codec: 'opus', numberOfChannels: 2, sampleRate: 48000, bitrate: 320000 });
  const opusEncoderSupported = await codecSupport(scope.AudioEncoder,outputConfig,{signal});
  let mseSupported=false;
  try { mseSupported=scope.MediaSource?.isTypeSupported?.('audio/mp4; codecs="opus"')===true; } catch (_) {}
  return Object.freeze({ eligible: opusEncoderSupported===true && mseSupported,
    nativeInputSupported, opusEncoderSupported, mseSupported, outputConfig, status: AUDIO_OUTPUT_STATUS });
}

// One runtime belongs to one playback Worker. Reuse its fixed-size WASM heap across
// sequential windows; there is deliberately no cumulative byte or packet limit.
export function createAudioRuntime({ loadModule = async () => (await import('./audio-codec.mjs')).default() } = {}) {
  let modulePromise, module, lease = null;
  const stats = { opened: 0, closed: 0, liveContexts: 0, pendingOpens: 0, inFlightDecode: 0,
    decodedPackets: 0, decodedFrames: 0, transferredPcmBytes: 0, failures: 0,
    peakPacketBytes: 0, peakPcmBytes: 0, peakHeapBytes: 0, moduleLoading: false };
  const snapshot = () => Object.freeze({ ...stats, heapBytes: module?.q2Memory().buffer.byteLength ?? 0 });
  function getModule() {
    if (!modulePromise) {
      stats.moduleLoading = true;
      modulePromise = Promise.resolve().then(loadModule).then(value => {
        module = value;
        need(module.q2Memory().buffer.byteLength <= AUDIO_BOUNDS.maxHeapBytes, 'AUDIO_HEAP_LIMIT');
        return module;
      }).finally(() => { stats.moduleLoading = false; });
    }
    return modulePromise;
  }
  function createSession(config, mapping, { signal } = {}) {
    const profile = audioProfile(config), window = audioWindow(mapping);
    need(!lease, 'AUDIO_CONTEXT_BUSY');
    const token = {}; lease = token; stats.pendingOpens++;
    let ctx = 0, fn, m, closed = false, busy = false, closePromise, rejectCancel, decodeDone, finishDecode;
    const cancellation = new Promise((_, reject) => { rejectCancel = reject; });
    const release = () => { if (lease === token) lease = null; };
    const free = () => { if (ctx) { fn.close(ctx); ctx = 0; stats.closed++; stats.liveContexts--; } };
    const opened = (async () => {
      try {
        m = await Promise.race([getModule(), cancellation]);
        need(!closed, 'AUDIO_CLOSED');
        const wrap = (n, r, a) => m.cwrap(n, r, a);
        fn = { init: wrap('init_decoder', 'number', ['number']), selected: wrap('get_decoder_codec_id', 'number', ['number']),
          close: wrap('close_decoder', null, ['number']), flush: wrap('flush_decoder', null, ['number']),
          packet: wrap('configure_decode_packet', 'number', ['number', 'number']),
          decode: wrap('decode_packet', 'number', ['number', 'number']), format: wrap('get_decoded_format', 'number', ['number']),
          plane: wrap('get_decoded_plane_ptr', 'number', ['number', 'number']),
          channels: wrap('get_decoded_channels', 'number', ['number']), rate: wrap('get_decoded_sample_rate', 'number', ['number']),
          frames: wrap('get_decoded_sample_count', 'number', ['number']), pts: wrap('get_decoded_pts', 'number', ['number']) };
        ctx = fn.init(profile.codecId); need(ctx, 'AUDIO_NATIVE_OPEN_FAILED');
        stats.opened++; stats.liveContexts++;
        need(fn.selected(ctx) === profile.codecId, 'AUDIO_WRONG_DECODER');
      } catch (failure) { free(); release(); throw failure; }
      finally { stats.pendingOpens--; }
    })();
    // Cancellation can precede a caller attaching to ready; keep ready rejectable
    // without an unhandled promise while the owner closes the session.
    opened.catch(() => {});
    const abort = () => { void close(); };
    signal?.addEventListener('abort', abort, { once: true });
    function close() {
      if (closePromise) return closePromise;
      closed = true; rejectCancel(error('AUDIO_CANCELLED')); signal?.removeEventListener('abort', abort);
      closePromise = opened.catch(() => {}).then(async () => { await decodeDone; free(); release();
        return Object.freeze({ settled: !ctx && !busy, liveContexts: stats.liveContexts,
          pendingOpens: stats.pendingOpens, moduleLoading: stats.moduleLoading }); });
      return closePromise;
    }
    if (signal?.aborted) void close();
    return Object.freeze({ profile, window, ready: opened, close,
      async decode(packet) {
        need(!closed, 'AUDIO_CLOSED'); need(!busy, 'AUDIO_DECODE_BUSY');
        busy = true; stats.inFlightDecode++;
        decodeDone = new Promise(resolve => { finishDecode = resolve; });
        try {
          await opened; need(!closed && ctx, 'AUDIO_CLOSED');
          need(packet?.data instanceof Uint8Array && packet.data.byteLength > 0
            && packet.data.byteLength <= AUDIO_BOUNDS.maxPacketBytes, 'AUDIO_PACKET_LIMIT');
          const ticks = Math.round(packet.timestamp * profile.sampleRate);
          need(Number.isFinite(packet.timestamp) && Number.isSafeInteger(ticks), 'AUDIO_PACKET_CLOCK');
          stats.peakPacketBytes = Math.max(stats.peakPacketBytes, packet.data.byteLength);
          const ptr = fn.packet(ctx, packet.data.byteLength); need(ptr > 0, 'AUDIO_PACKET_ALLOCATION');
          m.HEAPU8.set(packet.data, ptr);
          const code = fn.decode(ctx, BigInt(ticks)); need(code >= 0, `AUDIO_DECODE_FAILED:${code}`);
          const channels = fn.channels(ctx), rate = fn.rate(ctx), frames = fn.frames(ctx);
          need(channels === profile.numberOfChannels && rate === profile.sampleRate && fn.format(ctx) === 8,
            'AUDIO_PCM_PROFILE_CHANGED');
          need(frames > 0 && frames <= AUDIO_BOUNDS.maxFrames, 'AUDIO_PCM_FRAME_LIMIT');
          const bytes = frames * channels * 4; need(bytes <= AUDIO_BOUNDS.maxPcmBytes, 'AUDIO_PCM_BYTE_LIMIT');
          const pcm = new Uint8Array(bytes);
          for (let c = 0; c < channels; c++) {
            const at = fn.plane(ctx, c), length = frames * 4;
            need(at > 0 && at + length <= m.HEAPU8.byteLength, 'AUDIO_PCM_POINTER');
            pcm.set(m.HEAPU8.subarray(at, at + length), c * length);
          }
          const timestamp = Number(fn.pts(ctx)) / rate;
          need(Number.isFinite(timestamp), 'AUDIO_PCM_CLOCK');
          const heap = m.q2Memory().buffer.byteLength; need(heap <= AUDIO_BOUNDS.maxHeapBytes, 'AUDIO_HEAP_LIMIT');
          stats.decodedPackets++; stats.decodedFrames += frames; stats.transferredPcmBytes += bytes;
          stats.peakHeapBytes = Math.max(stats.peakHeapBytes, heap); stats.peakPcmBytes = Math.max(stats.peakPcmBytes, bytes);
          return Object.freeze({ data: pcm, format: 'f32-planar', numberOfChannels: channels,
            numberOfFrames: frames, sampleRate: rate, timestamp, duration: frames / rate, window });
        } catch (failure) { if (!closed) stats.failures++; free(); closed = true; signal?.removeEventListener('abort', abort); release(); throw failure; }
        finally { busy = false; stats.inFlightDecode--; finishDecode(); }
      },
      async flush() { await opened; if (!closed && ctx) fn.flush(ctx); }, metrics: snapshot });
  }
  return Object.freeze({ createSession, metrics: snapshot });
}
