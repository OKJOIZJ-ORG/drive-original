"""Reproducible narrow QA fork; originals retained in the pinned MPL archive."""
from pathlib import Path
import tarfile,hashlib,json,difflib,shutil
p=Path(__file__).resolve().parent
archive=p.parent/'media-general-routing/vendor/mediabunny-1.60.0.tgz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='c08cb56b40af19fc02e7aa9fccd814d19ff614f22349a0275f6c5aea982fa266'
with tarfile.open(archive) as t:
    t.extractall(p,filter='data')
changes=[]
def edit(file,pairs):
    path=p/'package/src'/file;before=path.read_text(encoding='utf8');after=before
    for old,new,count in pairs:
        assert after.count(old)==count,(file,old[:80],after.count(old),count)
        after=after.replace(old,new)
    path.write_text(after,encoding='utf8',newline='\n')
    changes.append({'path':'package/src/'+file,'before':hashlib.sha256(before.encode()).hexdigest(),'after':hashlib.sha256(after.encode()).hexdigest()})
    return ''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/src/'+file,tofile='b/src/'+file))
diff=''
diff+=edit('packet.ts',[("export type EncodedPacketSideData = {","export type EncodedPacketSideData = {\n\t/** QA-only: source decode clock, carried through clone; never infer from sorted PTS. */\n\tq1Dts?: number;\n\tq1DecodeDuration?: number;",1)])
diff+=edit('isobmff/isobmff-demuxer.ts',[
 ('\t\tsquarePixelWidth: number;', '\t\tq1Sar?: { num: number; den: number };\n\t\tsquarePixelWidth: number;',1),
 ('const den = readU32Be(slice);\n\n\t\t\t\t// https://github.com/Vanilagy/mediabunny/issues/362', 'const den = readU32Be(slice);\n\t\t\t\ttrack.info.q1Sar = { num, den };\n\n\t\t\t\t// https://github.com/Vanilagy/mediabunny/issues/362',1),
 ('config.displayAspectWidth = this.internalTrack.info.squarePixelWidth;', 'config.displayAspectWidth = this.internalTrack.info.q1Sar ? this.internalTrack.info.width * this.internalTrack.info.q1Sar.num : this.internalTrack.info.squarePixelWidth;',1),
 ('config.displayAspectHeight = this.internalTrack.info.squarePixelHeight;', 'config.displayAspectHeight = this.internalTrack.info.q1Sar ? this.internalTrack.info.height * this.internalTrack.info.q1Sar.den : this.internalTrack.info.squarePixelHeight;',1),
 ('this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth', '(this.internalTrack.info.q1Sar && this.internalTrack.info.q1Sar.num !== this.internalTrack.info.q1Sar.den)\n\t\t\t\t|| this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth',1),
 ('type FragmentTrackSample = {','type FragmentTrackSample = {\n\tdecodeTimestamp: number;\n\tdecodeDuration: number;',1),
 ('presentationTimestamp: trackData.currentTimestamp + sampleCompositionTimeOffset,','presentationTimestamp: trackData.currentTimestamp + sampleCompositionTimeOffset,\n\t\t\t\t\t\tdecodeTimestamp: trackData.currentTimestamp,\n\t\t\t\t\t\tdecodeDuration: sampleDuration,',1),
 ('\t\t\tsampleInfo.sampleSize,\n\t\t);','\t\t\tsampleInfo.sampleSize,\n\t\t\t{ q1Dts: (sampleInfo.decodeTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, q1DecodeDuration: sampleInfo.decodeDuration / this.internalTrack.timescale },\n\t\t);',1),
 ('\t\t\tfragmentSample.byteSize,\n\t\t);','\t\t\tfragmentSample.byteSize,\n\t\t\t{ q1Dts: (fragmentSample.decodeTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, q1DecodeDuration: fragmentSample.decodeDuration / this.internalTrack.timescale },\n\t\t);',1),
 ('type SampleInfo = {','type SampleInfo = {\n\tdecodeTimestamp: number;\n\tdecodeDuration: number;',1),
 ('\t\t presentationTimestamp,','unused',0),
 ('\t\tpresentationTimestamp,\n\t\tduration,\n\t\tsampleOffset,','\t\tpresentationTimestamp,\n\t\tdecodeTimestamp,\n\t\tdecodeDuration: timingEntry.delta,\n\t\tduration,\n\t\tsampleOffset,',1),
 ('sample.presentationTimestamp += timestamp;','sample.presentationTimestamp += timestamp;\n\t\tsample.decodeTimestamp += timestamp;',1),
])
diff+=edit('mpeg-ts/mpeg-ts-demuxer.ts',[
 ('\t\tsquarePixelWidth: number;', '\t\tq1Sar?: { num: number; den: number };\n\t\tsquarePixelWidth: number;',1),
 ('const spsInfo = parseAvcSps(spsUnit)!;', 'const spsInfo = parseAvcSps(spsUnit)!;\n elementaryStream.info.q1Sar = spsInfo.pixelAspectRatio;',1),
 ('= elementaryStream.info.squarePixelWidth;', '= elementaryStream.info.q1Sar ? elementaryStream.info.width * elementaryStream.info.q1Sar.num : elementaryStream.info.squarePixelWidth;',1),
 ('= elementaryStream.info.squarePixelHeight;', '= elementaryStream.info.q1Sar ? elementaryStream.info.height * elementaryStream.info.q1Sar.den : elementaryStream.info.squarePixelHeight;',1),
 ('elementaryStream.info.width !== elementaryStream.info.squarePixelWidth', '(elementaryStream.info.q1Sar && elementaryStream.info.q1Sar.num !== elementaryStream.info.q1Sar.den)\n || elementaryStream.info.width !== elementaryStream.info.squarePixelWidth',1),
 ('type PesPacketHeader = {','type PesPacketHeader = {\n\tdts: number | null;',1),
 ('\treturn {\n\t\tsectionStartPos: section.startPos,','\tlet dts = pts;\n\tif (ptsDtsFlags === 0b11) {\n\t\tbitstream.skipBits(1); // final PTS marker\n\t\tbitstream.skipBits(4);\n\t\tdts = bitstream.readBits(3) * 2 ** 30;\n\t\tbitstream.skipBits(1);\n\t\tdts += bitstream.readBits(15) * 2 ** 15;\n\t\tbitstream.skipBits(1);\n\t\tdts += bitstream.readBits(15);\n\t\t// Preserve the signed modulo distance from PTS across the 33-bit wrap.\n\t\tconst modulus = 2 ** 33;\n\t\tdts = pts! + ((dts - pts! + modulus / 2) % modulus + modulus) % modulus - modulus / 2;\n\t}\n\treturn {\n\t\tdts,\n\t\tsectionStartPos: section.startPos,',1),
 ('type SuppliedPacket = {','type SuppliedPacket = {\n\tdts: number;',1),
 ('\t\t\tsuppliedPacket.data.byteLength,','\t\t\tsuppliedPacket.data.byteLength,\n\t\t\t{ q1Dts: suppliedPacket.dts / TIMESCALE },',1),
 ('\t\tthis.lastSuppliedPesPacket = currentPesPacket;','\t\tif (this.elementaryStream.info.type === \'video\' && this.lastSuppliedPesPacket === currentPesPacket) {\n\t\t\tthrow new Error(\'Q1_SOURCE_DTS_AMBIGUOUS_MULTI_AU_PES\');\n\t\t}\n\t\tconst dts = this.elementaryStream.info.type === \'audio\' ? pts : currentPesPacket.dts;\n\t\tif (dts === null) throw new Error(\'Q1_SOURCE_DTS_MISSING\');\n\t\tthis.lastSuppliedPesPacket = currentPesPacket;',1),
 ('\t\tthis.suppliedPacket = {\n\t\t\tpts,','\t\tthis.suppliedPacket = {\n\t\t\tdts,\n\t\t\tpts,',1),
 ('fullRange: !!spsInfo.fullRangeFlag,','fullRange: spsInfo.fullRangeFlag == null ? undefined : !!spsInfo.fullRangeFlag,',2),
])
diff+=edit('codec-data.ts',[
 ('fullRangeFlag: number;','fullRangeFlag: number | undefined;',2),
 ('let fullRangeFlag = 0;','let fullRangeFlag: number | undefined = undefined;',3),
])
diff+=edit('codec.ts', [('fullRange: !!spsInfo.fullRangeFlag,','fullRange: spsInfo.fullRangeFlag == null ? undefined : !!spsInfo.fullRangeFlag,',2)])
diff+=edit('output.ts', [('export type BaseTrackMetadata = {','export type BaseTrackMetadata = {\n\t/** QA-only exact common clock timescale, validated by the Q1 owner. */\n\tq1Timescale?: number;',1)])
diff+=edit('isobmff/isobmff-muxer.ts',[
 ('const timescale = computeRationalApproximation(', 'const timescale = track.metadata.q1Timescale ?? computeRationalApproximation(',1),
('\tdecodeTimestamp: number;','\tdecodeTimestamp: number;\n\tsourceDts?: number;',1),
 ('timescale: decoderConfig.sampleRate,','timescale: track.metadata.q1Timescale ?? decoderConfig.sampleRate,',1),
 ('\t\t\t\tpacket.type,\n\t\t\t);','\t\t\t\tpacket.type,\n\t\t\t\tpacket.sideData.q1Dts,\n\t\t\t\tpacket.sideData.q1DecodeDuration,\n\t\t\t);',2),
 ('\t\ttype: PacketType,\n\t) {','\t\ttype: PacketType,\n\t\tsourceDts?: number,\n\t\tsourceDecodeDuration?: number,\n\t) {',1),
 ('decodeTimestamp: timestamp, // This may be refined later','decodeTimestamp: sourceDts ?? timestamp,\n\t\t\tsourceDts,',1),
 ('timescaleUnitsToNextSample: intoTimescale(duration, trackData.timescale),','timescaleUnitsToNextSample: intoTimescale(sourceDecodeDuration ?? duration, trackData.timescale),',1),
 ('trackData.startTimestampOffset ??= Math.min(sortedTimestamps[0]!, 0);','trackData.startTimestampOffset ??= Math.min(trackData.timestampProcessingQueue[0]!.sourceDts ?? sortedTimestamps[0]!, 0);',1),
 ('sample.decodeTimestamp = sortedTimestamps[i]!;','sample.decodeTimestamp = sample.sourceDts ?? sortedTimestamps[i]!;',1),
 ('if (nextSample !== undefined && trackData.lastSample.timescaleUnitsToNextSample === 0) {','if (nextSample !== undefined && (nextSample.sourceDts !== undefined || trackData.lastSample.timescaleUnitsToNextSample === 0)) {',1),
 ('intoTimescale(nextSample.timestamp, trackData.timescale, false)','intoTimescale(nextSample.sourceDts ?? nextSample.timestamp, trackData.timescale, false)',1),
])
diff+=edit('isobmff/isobmff-boxes.ts',[
 ('u64(intoTimescale(trackData.currentChunk.startTimestamp, trackData.timescale)), // Base Media Decode Time','u64(intoTimescale(trackData.currentChunk.samples[0]!.decodeTimestamp, trackData.timescale)), // Source decode time; presentation minima are not DTS',1),
])
(p/'preferred-source.patch').write_text(diff,encoding='utf8',newline='\n')
(p/'patch-provenance.json').write_text(json.dumps({'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'license':'MPL-2.0','modifiedFiles':changes,'patchSha256':hashlib.sha256(diff.encode()).hexdigest()},indent=2))
for name in ['common-source.mjs','q1-pipeline.mjs','timeline-policy.mjs']:
    shutil.copyfile(p.parent/'media-general-routing'/name,p/name)
f=p/'q1-pipeline.mjs';s=f.read_text(encoding='utf8')
s=s.replace('const copied = packet.clone({ timestamp: packet.timestamp - windowOrigin });',"if (!Number.isFinite(packet.sideData.q1Dts)) throw new Error('Q1_SOURCE_DTS_REQUIRED');\n      const copied = packet.clone({ timestamp: packet.timestamp - windowOrigin, sideData: { ...packet.sideData, q1Dts: packet.sideData.q1Dts - windowOrigin } });")
s=s.replace('output.addVideoTrack(videoSource, { rotation: video.rotation });', '''const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const clocks = [await video.getTimeResolution(), audio ? await audio.getTimeResolution() : 1, audioConfig?.sampleRate ?? 1];
    const commonTimescale = clocks.reduce((a, b) => a / gcd(a, b) * b, 1);
    if (!Number.isSafeInteger(commonTimescale) || commonTimescale <= 0 || commonTimescale > 2 ** 32 - 1) throw new Error('Q1_EXACT_CLOCK_UNREPRESENTABLE');
    output.addVideoTrack(videoSource, { rotation: video.rotation, q1Timescale: commonTimescale });''')
s=s.replace('{ languageCode: audio.languageCode }', '{ languageCode: audio.languageCode, q1Timescale: commonTimescale }')
s=s.replace('timelinePolicy = false', 'timelinePolicy = true')
s=s.replace('const policy = timelinePolicy && await resolveTimelinePolicy', 'const policy = timelinePolicy && (await input.getFormat()) !== MPEG_TS && await resolveTimelinePolicy')
s=s.replace("if (!video) throw new Error('GENERAL_VIDEO_REQUIRED');","if (!video) throw new Error('GENERAL_VIDEO_REQUIRED');\n    if (video.codec !== 'avc' || (audio && !['aac', 'ac3'].includes(audio.codec))) throw new Error('Q1_SPIKE_CODEC_NOT_QUALIFIED');")
f.write_text(s,encoding='utf8',newline='\n')
(p/'vendor').mkdir(exist_ok=True)
shutil.copyfile(p/'package/LICENSE',p/'vendor/LICENSE')
print(json.dumps({'modifiedFiles':len(changes),'patchSha256':hashlib.sha256(diff.encode()).hexdigest()}))
