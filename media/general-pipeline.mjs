import { Input, MP4, QTFF, MPEG_TS, EncodedPacketSink,
  EncodedVideoPacketSource, EncodedAudioPacketSource, Output, Mp4OutputFormat,
  StreamTarget } from './mediabunny-q1.mjs';
import { createGeneralSource } from './general-source.mjs';
import { admitGeneralInput } from './general-admission.mjs';
import { resolveTimelinePolicy } from './general-timeline.mjs';
import { createAvcPacketGuard } from './general-codec.mjs';

// Pure packet-copy slice. No Decoder/Encoder, Conversion, Blob or full input.
export async function streamGeneralQ1({ source, generation = 1, isCurrent = () => true,
  signal,
  targetTime = 0, endTime = Infinity, onChunk, onPacket = () => {}, onWindow = () => {}, limits = {},
  timelinePolicy = true }) {
  if (typeof onChunk !== 'function') throw new Error('GENERAL_OUTPUT_REQUIRED');
  if (endTime !== Infinity) throw new Error('GENERAL_TRIM_UNQUALIFIED');
  const rpc = createGeneralSource(source, { isCurrent, signal, ...limits });
  let admission;
  try { admission = await admitGeneralInput(rpc); } catch (error) { error.cleanup = await rpc.cleanup(); throw error; }
  const policyRpc = {metrics:{...rpc.metrics,generation,size:rpc.size},request:({start,end})=>rpc.request(start,end)};
  const input = new Input({ source: rpc.custom, formats: [MP4, QTFF, MPEG_TS] });
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
    if (video.codec !== 'avc' || (audio && audio.codec !== 'aac')) throw new Error('GENERAL_CODEC_UNQUALIFIED');
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
    const windowOrigin = Math.min(videoPacket.timestamp, audioPacket?.timestamp ?? Infinity);
    const videoConfig = await video.getDecoderConfig(), audioConfig = audio && await audio.getDecoderConfig();
    const guardVideo = createAvcPacketGuard(videoConfig, admission.kind === 'iso');
    if (audioConfig && (audioConfig.codec !== 'mp4a.40.2' || ![44100, 48000].includes(audioConfig.sampleRate) || ![1, 2].includes(audioConfig.numberOfChannels))) throw new Error('GENERAL_AUDIO_CONFIG_UNQUALIFIED');
    const sourcePacketOrigin = await input.getFirstTimestamp([video, audio].filter(Boolean));
    const policy = timelinePolicy && (await input.getFormat()) !== MPEG_TS && await resolveTimelinePolicy(policyRpc, input, [video, audio].filter(Boolean));
    rpc.check();
    await onWindow({ generation, sourcePacketOrigin, windowOrigin, videoStartTimestamp: videoPacket.timestamp, sourceEndTimestamp: policy?.declaredEnd ?? duration, policy,
      videoConfig, audioConfig, videoCodec: video.codec, audioCodec: audio?.codec ?? null });
    rpc.check();
    const videoSource = new EncodedVideoPacketSource(video.codec);
    const audioSource = audio && new EncodedAudioPacketSource(audio.codec);
    const writable = new WritableStream({ async write({ data, position }) {
      rpc.check();
      if (position !== outputPosition || !Number.isSafeInteger(outputBytes + data.length)) throw new Error('GENERAL_OUTPUT_LIMIT_OR_REWRITE');
      if (data.length > 8 * 1024 * 1024) throw new Error('GENERAL_OUTPUT_BATCH_LIMIT');
      outputPosition += data.length; outputBytes += data.length;
      // ACK promises apply backpressure into packetSource.add(), not just the sink.
      for (let offset = 0; offset < data.length; offset += maxOutputChunk) {
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
    let videoFirst = true, audioFirst = true;
    while (videoPacket || audioPacket) {
      rpc.check();
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
      if (useVideo) guardVideo(packet);
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
        await audioSource.add(copied, audioFirst ? { decoderConfig: audioConfig } : undefined); audioFirst = false;
        audioPacket = await audioSink.getNextPacket(sourcePacket);
      }
      rpc.check();
    }
    await output.finalize(); rpc.check();
    readyResult = { generation, duration, sourcePacketOrigin, durationSemantics: 'source-clock last video end timestamp; integration must resolve presentation origin separately from AAC preroll', targetTime, windowOrigin,
      policy: policy || null,
      videoCodec: video.codec, audioCodec: audio?.codec ?? null, packets, outputBytes,
      peakPendingAcks: peakAcks, peakBufferedPacketBytes, admission, muxRetention: output._muxer.q1Retention, encodersCreated: 0, inputFormat: (await input.getFormat()).name };
  } catch (error) { failure = error; }
  finally {
    if (output && output.state !== 'finalized') await output.cancel().catch(() => {});
    input.dispose();
    const cleanup = await rpc.cleanup();
    if (!cleanup?.settled && !failure) failure = new Error('GENERAL_SOURCE_CLEANUP_UNSETTLED');
    if (failure) { failure.cleanup = cleanup; failure.reads = rpc.metrics; }
    if (readyResult) { readyResult.cleanup = cleanup; readyResult.reads = rpc.metrics; }
  }
  if (failure) { if (!/^(?:GENERAL|TIMING|Q1_EXACT|Q1_SOURCE)_[A-Z_]+$/.test(failure.message)) { const safe = new Error('GENERAL_PIPELINE_FAILED'); safe.cleanup = failure.cleanup; safe.reads = failure.reads; throw safe; } throw failure; }
  return readyResult;
}
