import { Input, MP4, QTFF, MATROSKA, WEBM, MPEG_TS, EncodedPacketSink,
  EncodedVideoPacketSource, EncodedAudioPacketSource, Output, Mp4OutputFormat,
  StreamTarget } from './vendor/mediabunny.min.mjs';
import { createReadRpc } from './common-source.mjs';
import { resolveTimelinePolicy, createDurationCursor } from './timeline-policy.mjs';

// Pure packet-copy slice. No Decoder/Encoder, Conversion, Blob or full input.
export async function remuxQ1({ source, generation = 1, isCurrent = () => true,
  signal,
  targetTime = 0, endTime = Infinity, onChunk, onPacket = () => {}, onWindow = () => {}, limits = {}, format = null,
  timelinePolicy = true, omittedDurationEvidence = null }) {
  if (typeof onChunk !== 'function') throw new Error('GENERAL_OUTPUT_REQUIRED');
  const rpc = createReadRpc(source, { generation, isCurrent, signal, ...limits });
  const input = new Input({ source: rpc.custom, formats: [MP4, QTFF, MATROSKA, WEBM, MPEG_TS] });
  let output, outputPosition = 0, outputBytes = 0, pendingAcks = 0, peakAcks = 0, packets = 0;
  const maxOutputBytes = limits.maxOutputBytes ?? 8 * 1024 * 1024;
  const maxPackets = limits.maxPackets ?? 10000;
  const maxOutputChunk = limits.maxOutputChunk ?? 256 * 1024;
  const maxBufferedPacketBytes = limits.maxBufferedPacketBytes ?? 4 * 1024 * 1024;
  let bufferedPacketBytes = 0, peakBufferedPacketBytes = 0;
  function acknowledgement(promise) {
    return new Promise((resolve, reject) => {
      const stop = error => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
      const aborted = () => stop(new Error('GENERAL_ACK_CANCELLED'));
      const timer = setTimeout(() => stop(new Error('GENERAL_ACK_TIMEOUT')), limits.ackTimeoutMs ?? 2000);
      signal?.addEventListener('abort', aborted, { once: true });
      Promise.resolve(promise).then(() => stop(), stop);
      if (signal?.aborted) aborted();
    });
  }
  let readyResult, failure;
  try {
    if (!Number.isSafeInteger(maxOutputChunk) || maxOutputChunk <= 0 || maxOutputChunk > 256 * 1024)
      throw new Error('GENERAL_OUTPUT_CHUNK_LIMIT');
    const video = await input.getPrimaryVideoTrack(); rpc.check();
    const audio = await input.getPrimaryAudioTrack(); rpc.check();
    if (!video) throw new Error('GENERAL_VIDEO_REQUIRED');
    if (video.codec !== 'avc' || (audio && !['aac', 'ac3'].includes(audio.codec))) throw new Error('Q1_SPIKE_CODEC_NOT_QUALIFIED');
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
    const sourcePacketOrigin = await input.getFirstTimestamp([video, audio].filter(Boolean));
    const policy = timelinePolicy && (await input.getFormat()) !== MPEG_TS && await resolveTimelinePolicy(rpc, input, [video, audio].filter(Boolean));
    const videoCursor = omittedDurationEvidence && createDurationCursor({ sink: videoSink, kind: 'video', track: video, config: videoConfig, policy, omittedEvidence: omittedDurationEvidence, limits });
    const audioCursor = omittedDurationEvidence && audio && createDurationCursor({ sink: audioSink, kind: 'audio', track: audio, config: audioConfig, policy, omittedEvidence: omittedDurationEvidence, limits });
    let resolvedVideoEnd = 0;
    rpc.check();
    await onWindow({ generation, sourcePacketOrigin, windowOrigin, sourceEndTimestamp: policy?.declaredEnd ?? duration, policy,
      videoConfig, audioConfig, videoCodec: video.codec, audioCodec: audio?.codec ?? null });
    rpc.check();
    const videoSource = new EncodedVideoPacketSource(video.codec);
    const audioSource = audio && new EncodedAudioPacketSource(audio.codec);
    const writable = new WritableStream({ async write({ data, position }) {
      rpc.check();
      if (position !== outputPosition || outputBytes + data.length > maxOutputBytes) throw new Error('GENERAL_OUTPUT_LIMIT_OR_REWRITE');
      outputPosition += data.length; outputBytes += data.length;
      // ACK promises apply backpressure into packetSource.add(), not just the sink.
      for (let offset = 0; offset < data.length; offset += maxOutputChunk) {
        rpc.check(); const bytes = data.slice(offset, offset + maxOutputChunk);
        pendingAcks++; peakAcks = Math.max(peakAcks, pendingAcks);
        try { await acknowledgement(onChunk({ generation, bytes, position: position + offset })); }
        finally { pendingAcks--; }
        rpc.check();
      }
      bufferedPacketBytes = 0;
    } }, { highWaterMark: 1 });
    output = new Output({ format: format || new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
      target: new StreamTarget(writable) });
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const clocks = [await video.getTimeResolution(), audio ? await audio.getTimeResolution() : 1, audioConfig?.sampleRate ?? 1];
    const commonTimescale = clocks.reduce((a, b) => a / gcd(a, b) * b, 1);
    if (!Number.isSafeInteger(commonTimescale) || commonTimescale <= 0 || commonTimescale > 2 ** 32 - 1) throw new Error('Q1_EXACT_CLOCK_UNREPRESENTABLE');
    output.addVideoTrack(videoSource, { rotation: video.rotation, q1Timescale: commonTimescale });
    if (audioSource) output.addAudioTrack(audioSource, { languageCode: audio.languageCode, q1Timescale: commonTimescale });
    await output.start(); rpc.check();
    let videoFirst = true, audioFirst = true;
    while (videoPacket || audioPacket) {
      rpc.check();
      // Preserve decode order within each track; interleave tracks for mux bounds.
      const useVideo = videoPacket && (!audioPacket || videoPacket.timestamp <= audioPacket.timestamp);
      const sourcePacket = useVideo ? videoPacket : audioPacket, track = useVideo ? 'video' : 'audio';
      if (sourcePacket.timestamp >= endTime) { if (useVideo) videoPacket = null; else audioPacket = null; continue; }
      const cursor = useVideo ? videoCursor : audioCursor;
      const resolved = cursor ? await cursor.resolve(sourcePacket) : { packet: sourcePacket, evidence: null }, packet = resolved.packet;
      rpc.check();
      // Zero from a demuxer is an unspecified duration, not proof of a zero
      // length sample. This qualified spike fails visibly rather than letting
      // the output muxer silently invent the missing boundary clock.
      if (!(packet.duration > 0)) throw new Error(`GENERAL_PACKET_DURATION_UNKNOWN:${track}`);
      if (++packets > maxPackets) throw new Error('GENERAL_PACKET_LIMIT');
      bufferedPacketBytes += packet.data.length;
      peakBufferedPacketBytes = Math.max(peakBufferedPacketBytes, bufferedPacketBytes);
      if (bufferedPacketBytes > maxBufferedPacketBytes) throw new Error('GENERAL_PACKET_BUFFER_LIMIT');
      if (!Number.isFinite(packet.sideData.q1Dts)) throw new Error('Q1_SOURCE_DTS_REQUIRED');
      const copied = packet.clone({ timestamp: packet.timestamp - windowOrigin, sideData: { ...packet.sideData, q1Dts: packet.sideData.q1Dts - windowOrigin } });
      onPacket({ track, packet, sourcePacket, durationEvidence: resolved.evidence, outputTimestamp: copied.timestamp, windowOrigin });
      if (useVideo) {
        resolvedVideoEnd = Math.max(resolvedVideoEnd, packet.timestamp + packet.duration);
        await videoSource.add(copied, videoFirst ? { decoderConfig: videoConfig } : undefined); videoFirst = false;
        videoPacket = videoCursor ? await videoCursor.advance(sourcePacket) : await videoSink.getNextPacket(sourcePacket, { verifyKeyPackets: true });
      } else {
        await audioSource.add(copied, audioFirst ? { decoderConfig: audioConfig } : undefined); audioFirst = false;
        audioPacket = audioCursor ? await audioCursor.advance(sourcePacket) : await audioSink.getNextPacket(sourcePacket);
      }
      rpc.check();
    }
    await output.finalize(); rpc.check();
    readyResult = { generation, duration, sourcePacketOrigin, durationSemantics: 'source-clock last video end timestamp; integration must resolve presentation origin separately from AAC preroll', targetTime, windowOrigin,
      policy: policy || null, timingResolution: omittedDurationEvidence ? { sourceComputedVideoEnd: duration, resolvedVideoEnd,
        video: { count: videoCursor.resolutionCount, peakLookaheadBytes: videoCursor.peakBytes, examples: videoCursor.resolutions },
        audio: audioCursor ? { count: audioCursor.resolutionCount, peakLookaheadBytes: audioCursor.peakBytes, examples: audioCursor.resolutions } : null } : null,
      videoCodec: video.codec, audioCodec: audio?.codec ?? null, packets, outputBytes,
      peakPendingAcks: peakAcks, peakBufferedPacketBytes, encodersCreated: 0, inputFormat: (await input.getFormat()).name };
  } catch (error) { failure = error; }
  finally {
    if (output && output.state !== 'finalized') await output.cancel().catch(() => {});
    input.dispose();
    const cleanup = await rpc.cleanup();
    if (!cleanup?.settled && !failure) failure = new Error('GENERAL_SOURCE_CLEANUP_UNSETTLED');
    if (failure) { failure.cleanup = cleanup; failure.reads = rpc.metrics; }
    if (readyResult) { readyResult.cleanup = cleanup; readyResult.reads = rpc.metrics; }
  }
  if (failure) throw failure;
  return readyResult;
}
