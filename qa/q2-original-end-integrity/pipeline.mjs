import { Input, MP4, QTFF, MPEG_TS, EncodedPacketSink,
  EncodedVideoPacketSource, AudioSample, AudioSampleSource, Output, Mp4OutputFormat,
  StreamTarget } from '../../media/mediabunny-q1.mjs';
import { createGeneralSource } from '../../media/general-source.mjs';
import { admitGeneralInput } from '../../media/general-admission.mjs';
import { resolveTimelinePolicy } from '../../media/general-timeline.mjs';
import { createAvcPacketGuard } from '../../media/general-codec.mjs';

import {createAudioRuntime, observeAudioCompatibility, AUDIO_OUTPUT_STATUS} from '../../media/audio-runtime.mjs';
// Q2: copy encoded AVC; decode only unsupported AC3/EAC3 stereo 48 kHz.
// One enclosing Worker owns this job, its WASM heap and native Opus encoder.
export async function streamGeneralQ2({ source, generation = 1, isCurrent = () => true,
  signal,
  targetTime = 0, endTime = Infinity, onChunk, onPacket = () => {}, onWindow = () => {}, limits = {},
  timelinePolicy = true }) {
  if (typeof onChunk !== 'function') throw new Error('GENERAL_OUTPUT_REQUIRED');
  if (endTime !== Infinity) throw new Error('GENERAL_TRIM_UNQUALIFIED');
  const rpc = createGeneralSource(source, { isCurrent, signal, ...limits });
  let admission;
  try { admission = await admitGeneralInput(rpc, {audioCodecs:['ac-3','ec-3']}); } catch (error) { error.cleanup = await rpc.cleanup(); throw error; }
  const policyRpc = {metrics:{...rpc.metrics,generation,size:rpc.size},request:({start,end})=>rpc.request(start,end)};
  const input = new Input({ source: rpc.custom, formats: [MP4, QTFF, MPEG_TS] });
  const runtime = createAudioRuntime();
  let session, heldPcm, finalAudioConfig, windowSent = false, windowInfo, expectedAudioTick, observedEncoderConfig;
  const prefix=[];let prefixBytes=0, peakPrefixBytes=0, encoderFailure; 
  let output, outputPosition = 0, outputBytes = 0, pendingAcks = 0, peakAcks = 0, packets = 0;
  
  
  const maxOutputChunk = limits.maxOutputChunk ?? 256 * 1024;
  const maxBufferedPacketBytes = limits.maxBufferedPacketBytes ?? 4 * 1024 * 1024;
  let bufferedPacketBytes = 0, peakBufferedPacketBytes = 0;
  function acknowledgement(promise) {
    return new Promise((resolve,reject)=>{const abort=()=>{signal?.removeEventListener('abort',abort);reject(new Error('GENERAL_ACK_CANCELLED'));};signal?.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>{signal?.removeEventListener('abort',abort);resolve(value);},error=>{signal?.removeEventListener('abort',abort);reject(error);});if(signal?.aborted)abort();});
  }
  let readyResult, failure;
  try {
    if (!Number.isSafeInteger(maxOutputChunk) || maxOutputChunk <= 0 || maxOutputChunk > 256 * 1024)
      throw new Error('GENERAL_OUTPUT_CHUNK_LIMIT');
    const video = await input.getPrimaryVideoTrack(); rpc.check();
    const audio = await input.getPrimaryAudioTrack(); rpc.check();
    if (!video) throw new Error('GENERAL_VIDEO_REQUIRED');
    if (admission.kind !== 'iso' || video.codec !== 'avc' || !audio || !['ac3','eac3'].includes(audio.codec)) throw new Error('GENERAL_CODEC_UNQUALIFIED');
    if ((await input.getVideoTracks()).length !== 1 || (await input.getAudioTracks()).length > 1) throw new Error('GENERAL_TRACKS_UNQUALIFIED');
    const duration = await video.computeDuration(); rpc.check();
    const videoSink = new EncodedPacketSink(video), audioSink = audio && new EncodedPacketSink(audio);
    let videoPacket = await videoSink.getKeyPacket(targetTime, { verifyKeyPackets: true });
    videoPacket ||= await videoSink.getFirstKeyPacket({ verifyKeyPackets: true }); rpc.check();
    if (!videoPacket) throw new Error('GENERAL_KEYFRAME_MISSING');
    // At full-start retain a real leading audio stream. Arbitrary seeks start
    // its packet window at the selected video RAP on the same source clock.
    let audioPacket = audioSink && (targetTime === 0 ? await audioSink.getFirstPacket() : await audioSink.getPacket(videoPacket.timestamp));
    if (audioSink && !audioPacket) audioPacket = await audioSink.getFirstPacket();
    rpc.check();
    const windowOrigin = 0; // Preserve original source PTS/DTS, including audio preroll.
    const videoConfig = await video.getDecoderConfig(), audioConfig = audio && await audio.getDecoderConfig();
    const guardVideo = createAvcPacketGuard(videoConfig, admission.kind === 'iso');
    const capability = await observeAudioCompatibility(audioConfig); rpc.check();
    if (!capability.eligible) throw new Error('AUDIO_NATIVE_GATE_UNAVAILABLE');
    console.log("COLOR",JSON.stringify(videoConfig.colorSpace));
    if (!videoConfig.colorSpace?.matrix || typeof videoConfig.colorSpace.fullRange !== 'boolean') throw new Error('AUDIO_VIDEO_COLOR_UNQUALIFIED');
    if (Math.abs(videoPacket.timestamp-videoPacket.sideData.q1Dts)>1e-8) throw new Error('AUDIO_REORDERED_VIDEO_UNQUALIFIED');
    const sourcePacketOrigin = await input.getFirstTimestamp([video, audio].filter(Boolean));
    const policy = timelinePolicy && (await input.getFormat()) !== MPEG_TS && await resolveTimelinePolicy(policyRpc, input, [video, audio].filter(Boolean));
    rpc.check();
    windowInfo = { generation, sourcePacketOrigin, windowOrigin, videoStartTimestamp: videoPacket.timestamp,
      sourceEndTimestamp: policy?.declaredEnd ?? duration, policy, videoConfig, videoCodec: video.codec,
      audioCodec: 'opus', inputAudioCodec: audio.codec, status: AUDIO_OUTPUT_STATUS, capability };
    session = runtime.createSession(audioConfig, {generation, sourceStart: audioPacket.timestamp,
      sourceEnd: windowInfo.sourceEndTimestamp, presentationOrigin: policy?.presentationOrigin ?? sourcePacketOrigin}, {signal});
    await session.ready; rpc.check();
    // Decode before exposing any bytes: corrupt first audio cannot become silent video-only success.
    heldPcm = await session.decode(audioPacket); rpc.check();
    const videoSource = new EncodedVideoPacketSource(video.codec);
    const audioSource = new AudioSampleSource({codec:'opus', bitrate:320000,
      onEncoderConfig(config) { if(config.codec!=='opus'||config.sampleRate!==48000||config.numberOfChannels!==2||config.bitrate!==320000) throw new Error('AUDIO_ENCODER_CONFIG_CHANGED'); observedEncoderConfig={codec:config.codec,sampleRate:config.sampleRate,numberOfChannels:config.numberOfChannels}; },
      onEncodedPacket(packet, meta) {
        if(packet.timestamp+packet.duration>windowInfo.sourceEndTimestamp) {packet.sideData.q1DecodeDuration=windowInfo.sourceEndTimestamp-packet.timestamp;packet.duration=windowInfo.sourceEndTimestamp-packet.timestamp;}
        if(packet.timestamp>5.94) console.log("OPUS_END",JSON.stringify({timestamp:packet.timestamp,duration:packet.duration}));
        // Chrome Opus may omit decoderConfig; successful native output confirms
        // the observed encoder configuration (Opus has no required MP4 ASC).
        finalAudioConfig ||= observedEncoderConfig;
        if (meta?.decoderConfig) {
          const config = meta.decoderConfig;
          if(config.codec!=='opus'||config.sampleRate!==48000||config.numberOfChannels!==2) {encoderFailure = new Error('AUDIO_ENCODER_CONFIG_CHANGED');return;}
          finalAudioConfig = {...config, description:config.description && new Uint8Array(config.description).slice()};
        }
      }
    });
    const writable = new WritableStream({ async write({ data, position }) {
      rpc.check();if(encoderFailure)throw encoderFailure;
      if (position !== outputPosition || !Number.isSafeInteger(outputBytes + data.length)) throw new Error('GENERAL_OUTPUT_LIMIT_OR_REWRITE');
      if (data.length > 8 * 1024 * 1024) throw new Error('GENERAL_OUTPUT_BATCH_LIMIT');
      // The writer may flush ftyp before the native encoder emits its first
      // decoderConfig. Hold only that bounded header, never media/file output.
      if (!finalAudioConfig) {
        if(prefixBytes+data.length>65536) throw new Error('AUDIO_FINAL_CONFIG_REQUIRED');
        prefix.push({data:data.slice(),position});prefixBytes+=data.length;peakPrefixBytes=Math.max(peakPrefixBytes,prefixBytes);
        outputPosition+=data.length;outputBytes+=data.length;return;
      }
      if (!windowSent) {
        await onWindow({...windowInfo,audioConfig:finalAudioConfig});rpc.check();windowSent=true;
      }
      const batches=[...prefix,{data,position}];prefix.length=0;prefixBytes=0;
      outputPosition += data.length; outputBytes += data.length;
      // ACK promises apply backpressure into packetSource.add(), not just the sink.
      for(const {data,position} of batches) for (let offset = 0; offset < data.length; offset += maxOutputChunk) {
        rpc.check(); const bytes = data.slice(offset, offset + maxOutputChunk);
        pendingAcks++; peakAcks = Math.max(peakAcks, pendingAcks);
        try { await acknowledgement(onChunk({ generation, bytes, position: position + offset,
          batchSize: data.length, batchEnd: offset + bytes.length === data.length })); }
        finally { pendingAcks--; }
        rpc.check();
      }
      bufferedPacketBytes = 0;
    } }, { highWaterMark: 1 });
    output = new Output({ format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
      target: new StreamTarget(writable) });
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const clocks = [await video.getTimeResolution(), audio ? await audio.getTimeResolution() : 1, audioConfig?.sampleRate ?? 1];
    const commonTimescale = clocks.reduce((a, b) => a / gcd(a, b) * b, 1);
    if (!Number.isSafeInteger(commonTimescale) || commonTimescale <= 0 || commonTimescale > 2 ** 32 - 1) throw new Error('Q1_EXACT_CLOCK_UNREPRESENTABLE');
    output.addVideoTrack(videoSource, { rotation: video.rotation, q1Timescale: commonTimescale, q1Streaming: true });
    if (audioSource) output.addAudioTrack(audioSource, { languageCode: audio.languageCode, q1Timescale: commonTimescale, q1Streaming: true });
    await output.start(); rpc.check(); rpc.beginStreaming();
    let videoFirst = true;
    while (videoPacket || audioPacket) {
      rpc.check();if(encoderFailure)throw encoderFailure;
      // Preserve decode order within each track; interleave tracks for mux bounds.
      const useVideo = videoPacket && (!audioPacket || videoPacket.timestamp <= audioPacket.timestamp);
      const sourcePacket = useVideo ? videoPacket : audioPacket, track = useVideo ? 'video' : 'audio';
      if (sourcePacket.timestamp >= endTime) { if (useVideo) videoPacket = null; else audioPacket = null; continue; }
      const packet = sourcePacket;
      rpc.check();
      // Zero from a demuxer is an unspecified duration, not proof of a zero
      // length sample. This qualified spike fails visibly rather than letting
      // the output muxer silently invent the missing boundary clock.
      if (!(packet.duration > 0)) throw new Error('GENERAL_PACKET_DURATION_UNKNOWN');
      packets++;
      if (packet.data.length > 2 * 1024 * 1024) throw new Error('GENERAL_PACKET_LIMIT');
      if (useVideo) {
        guardVideo(packet);
        if(Math.abs(packet.timestamp-packet.sideData.q1Dts)>1e-8) throw new Error('AUDIO_REORDERED_VIDEO_UNQUALIFIED');
      }
      bufferedPacketBytes += packet.data.length;
      peakBufferedPacketBytes = Math.max(peakBufferedPacketBytes, bufferedPacketBytes);
      if (bufferedPacketBytes > maxBufferedPacketBytes) throw new Error('GENERAL_PACKET_BUFFER_LIMIT');
      if (!Number.isFinite(packet.sideData.q1Dts)) throw new Error('Q1_SOURCE_DTS_REQUIRED');
      const copied = packet.clone({ timestamp: packet.timestamp - windowOrigin, sideData: { ...packet.sideData, q1Dts: packet.sideData.q1Dts - windowOrigin } });
      onPacket({ track, packet, sourcePacket, outputTimestamp: copied.timestamp, windowOrigin });
      if (useVideo) {
        await videoSource.add(copied, videoFirst ? { decoderConfig: videoConfig } : undefined); videoFirst = false;
        videoPacket = await videoSink.getNextPacket(sourcePacket, { verifyKeyPackets: true });
      } else {
        const pcm = heldPcm ?? await session.decode(packet); heldPcm = null; rpc.check();
        const tick = Math.round(pcm.timestamp*pcm.sampleRate);
        if (expectedAudioTick !== undefined && tick !== expectedAudioTick) throw new Error('AUDIO_DISCONTINUITY_UNQUALIFIED');
        expectedAudioTick = tick + pcm.numberOfFrames;
        // Reject gaps before core's silence-padding path; no resampling/downmix.
        const validFrames=Math.min(pcm.numberOfFrames,Math.round(windowInfo.sourceEndTimestamp*48000)-tick);
        if(validFrames<=0){audioPacket=null;continue;}
        let sample = new AudioSample({...pcm,timestamp:pcm.timestamp-windowOrigin});
        if(validFrames<pcm.numberOfFrames){const trimmed=sample.trim(0,validFrames);sample.close();sample=trimmed;}
        try { await audioSource.add(sample); } finally { sample.close(); }
        audioPacket = await audioSink.getNextPacket(sourcePacket);
      }
      rpc.check();
    }
    await output.finalize(); rpc.check();if(encoderFailure)throw encoderFailure;
    if(!windowSent||prefixBytes) throw new Error('AUDIO_FINAL_CONFIG_REQUIRED');
    readyResult = { generation, duration, sourcePacketOrigin, durationSemantics: 'source-clock last video end timestamp; integration must resolve presentation origin separately from AAC preroll', targetTime, windowOrigin,
      policy: policy || null,
      videoCodec: video.codec, audioCodec: audio?.codec ?? null, packets, outputBytes,
      peakPendingAcks: peakAcks, peakBufferedPacketBytes, admission, muxRetention: output._muxer.q1Retention, encodersCreated: 1, videoEncodersCreated: 0, status:AUDIO_OUTPUT_STATUS, capability, finalAudioConfig, peakPrefixBytes, inputFormat: (await input.getFormat()).name };
  } catch (error) { failure = error; }
  finally {
    if (output && output.state !== 'finalized') await output.cancel().catch(() => {});
    heldPcm = null;
    const audioCleanup = await session?.close();
    if(audioCleanup?.settled===false&&!failure)failure=new Error('AUDIO_CLEANUP_UNSETTLED');
    input.dispose();
    const cleanup = await rpc.cleanup();
    if (!cleanup?.settled && !failure) failure = new Error('GENERAL_SOURCE_CLEANUP_UNSETTLED');
    if (failure) { failure.cleanup = cleanup; failure.reads = rpc.metrics; failure.audioCleanup = audioCleanup; failure.audioMetrics = runtime.metrics(); }
    if (readyResult) { readyResult.cleanup = cleanup; readyResult.reads = rpc.metrics; readyResult.audioCleanup = audioCleanup; readyResult.audioMetrics = runtime.metrics(); }
  }
  if (failure) { if (!/^(?:GENERAL|TIMING|Q1_EXACT|Q1_SOURCE|AUDIO)_[A-Z_]+$/.test(failure.message)) { const safe = new Error(failure.message?.startsWith('AUDIO_') ? 'AUDIO_DECODE_FAILED' : 'GENERAL_PIPELINE_FAILED'); safe.audioCleanup = failure.audioCleanup; safe.audioMetrics = failure.audioMetrics; safe.cleanup = failure.cleanup; safe.reads = failure.reads; throw safe; } throw failure; }
  return readyResult;
}
