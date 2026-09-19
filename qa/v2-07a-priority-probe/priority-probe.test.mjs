import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePriorityProbe, PriorityProbeError } from './priority-probe.mjs';

const privateExpectation = Object.freeze({
  sampleAlias: 'sample-primary-1',
  drive: {
    name: 'private-name.mp4',
    mimeType: 'video/mp4',
    size: 208001508,
    driveApiIntegerVersion: 15
  },
  localBytes: {
    sha256: 'A'.repeat(64)
  }
});

const mpegTsProbe = Object.freeze({
  format: {
    format_name: 'mpegts',
    format_long_name: 'MPEG-TS (MPEG-2 Transport Stream)',
    duration: '1609.344000',
    start_time: '1.445333',
    bit_rate: '1033969',
    probe_score: 100
  },
  streams: [
    {
      index: 0,
      codec_name: 'h264',
      profile: 'High',
      codec_type: 'video',
      width: 360,
      height: 640,
      pix_fmt: 'yuv420p',
      bits_per_raw_sample: '8',
      level: 30,
      color_range: 'tv',
      color_space: 'bt709',
      color_transfer: 'bt709',
      color_primaries: 'bt709',
      r_frame_rate: '30/1',
      avg_frame_rate: '30/1',
      disposition: { default: 0 }
    },
    {
      index: 1,
      codec_name: 'aac',
      profile: 'LC',
      codec_type: 'audio',
      sample_rate: '48000',
      channels: 2,
      channel_layout: 'stereo',
      tags: { language: 'und' },
      disposition: { default: 0 }
    }
  ]
});

function analyze(overrides = {}) {
  return analyzePriorityProbe({
    ffprobe: mpegTsProbe,
    expected: privateExpectation,
    actualSize: 208001508,
    actualSha256Before: 'A'.repeat(64),
    actualSha256After: 'A'.repeat(64),
    sourceStateUnchanged: true,
    elapsedMs: 250.4,
    ffprobeVersion: 'ffprobe version fixture',
    driveVersionBefore: 22,
    driveVersionAfter: 22,
    ...overrides
  });
}

test('MPEG-TS under MP4 metadata is a Q1 container-only candidate, not playback success', () => {
  const report = analyze();
  assert.equal(report.classification.metadataContainerMismatch, true);
  assert.equal(report.classification.exactH264AacPair, true);
  assert.equal(report.classification.qPathCandidate, 'Q1-container-only-stream-copy');
  assert.equal(report.classification.currentProductPlaybackVerified, false);
  assert.equal(report.classification.physicalIphoneOrPwaVerified, false);
  assert.equal(report.classification.corruptionConfirmed, false);
  assert.equal(report.coverage.decodedInThisRunCount, 0);
});

test('redacted report keeps paths, IDs, revisions and hashes out of serialized evidence', () => {
  const serialized = JSON.stringify(analyze({
    expected: {
      ...privateExpectation,
      sampleAlias: 'person@example.com C:\\private\\sample.mp4 /Users/private/sample.mp4 DRIVE_ID_SENTINEL'
    }
  }));
  assert.doesNotMatch(
    serialized,
    /private-name|person@example|DRIVE_ID_SENTINEL|REVISION_SENTINEL|AAAAAA|sha256|\\|:\//i
  );
  assert.match(serialized, /"label":"priority-sample-1"/);
  assert.doesNotMatch(serialized, /filesVersionBefore|filesVersionAfter|"driveApiIntegerVersion"/);
  assert.match(serialized, /privateIdentityValues":"omitted/);
  assert.match(serialized, /checksums":"omitted/);
});

test('changed size, fingerprint or file state fails before a risk conclusion', () => {
  for (const overrides of [
    { actualSize: 208001507 },
    { actualSha256Before: 'B'.repeat(64) },
    { actualSha256After: 'B'.repeat(64) },
    { sourceStateUnchanged: false }
  ]) {
    assert.throws(
      () => analyze(overrides),
      (error) => error instanceof PriorityProbeError
        && ['IDENTITY_MISMATCH', 'SOURCE_CHANGED'].includes(error.code)
    );
  }
});

test('matching MP4 packaging is not promoted to Q1 merely because tracks are H.264/AAC', () => {
  const report = analyze({
    ffprobe: {
      ...mpegTsProbe,
      format: { ...mpegTsProbe.format, format_name: 'mov,mp4,m4a,3gp,3g2,mj2' }
    }
  });
  assert.equal(report.classification.metadataContainerMismatch, false);
  assert.equal(report.classification.qPathCandidate, 'unverified');
});

test('extra or different tracks remain unverified instead of silently dropping streams', () => {
  const report = analyze({
    ffprobe: {
      ...mpegTsProbe,
      streams: [
        ...mpegTsProbe.streams,
        { index: 2, codec_type: 'subtitle', codec_name: 'dvb_subtitle' }
      ]
    }
  });
  assert.equal(report.classification.metadataContainerMismatch, true);
  assert.equal(report.classification.exactH264AacPair, false);
  assert.equal(report.classification.qPathCandidate, 'unverified');
  assert.equal(report.configuredContainerAnalysis.subtitles.length, 1);
});

test('hidden data tracks and low-confidence signatures cannot become Q1 candidates', () => {
  const hiddenTrack = analyze({
    ffprobe: {
      ...mpegTsProbe,
      streams: [...mpegTsProbe.streams, { index: 2, codec_type: 'data', codec_name: 'bin_data' }]
    }
  });
  assert.equal(hiddenTrack.classification.exactH264AacPair, false);
  assert.equal(hiddenTrack.classification.qPathCandidate, 'unverified');
  assert.deepEqual(hiddenTrack.configuredContainerAnalysis.otherStreamTypes, ['data']);

  const lowConfidence = analyze({
    ffprobe: {
      ...mpegTsProbe,
      format: { ...mpegTsProbe.format, probe_score: 1 }
    }
  });
  assert.equal(lowConfidence.classification.exactH264AacPair, true);
  assert.equal(lowConfidence.configuredContainerAnalysis.probeConfidence, 'low');
  assert.equal(lowConfidence.classification.qPathCandidate, 'unverified');
});

test('display-matrix rotation and HDR side-data fields remain visible in the probe result', () => {
  const report = analyze({
    ffprobe: {
      ...mpegTsProbe,
      streams: [
        {
          ...mpegTsProbe.streams[0],
          side_data_list: [
            { side_data_type: 'Display Matrix', rotation: 90 },
            { side_data_type: 'Content light level metadata', max_content: 1000, max_average: 400 },
            {
              side_data_type: 'Mastering display metadata',
              red_x: '34000/50000',
              red_y: '16000/50000',
              green_x: '13250/50000',
              green_y: '34500/50000',
              blue_x: '7500/50000',
              blue_y: '3000/50000',
              white_point_x: '15635/50000',
              white_point_y: '16450/50000',
              min_luminance: '1/10000',
              max_luminance: '1000/1'
            }
          ]
        },
        mpegTsProbe.streams[1]
      ]
    }
  });
  assert.equal(report.configuredContainerAnalysis.video.rotationDegrees, 90);
  assert.equal(report.configuredContainerAnalysis.video.rotationSource, 'display-matrix-side-data');
  assert.equal(report.configuredContainerAnalysis.video.hdrMetadataPresent, true);
  assert.equal(report.configuredContainerAnalysis.video.hdrBearing, true);
  assert.match(report.configuredContainerAnalysis.video.hdrSignals.join(','), /static-hdr-side-data/);
  assert.deepEqual(report.configuredContainerAnalysis.video.sideData[1], {
    type: 'Content light level metadata',
    rotationDegrees: null,
    maxContentLightLevel: 1000,
    maxFrameAverageLightLevel: 400,
    masteringDisplay: {
      redX: null,
      redY: null,
      greenX: null,
      greenY: null,
      blueX: null,
      blueY: null,
      whitePointX: null,
      whitePointY: null,
      minLuminance: null,
      maxLuminance: null
    }
  });
  assert.deepEqual(report.configuredContainerAnalysis.video.sideData[2].masteringDisplay, {
    redX: '34000/50000',
    redY: '16000/50000',
    greenX: '13250/50000',
    greenY: '34500/50000',
    blueX: '7500/50000',
    blueY: '3000/50000',
    whitePointX: '15635/50000',
    whitePointY: '16450/50000',
    minLuminance: '1/10000',
    maxLuminance: '1000/1'
  });
  assert.equal(report.classification.qPathCandidate, 'unverified');
});

test('PQ, HLG, BT.2020 high-bit-depth and dynamic HDR signals stay out of Q1', () => {
  const variants = [
    { color_transfer: 'smpte2084', pix_fmt: 'yuv420p10le', color_primaries: 'bt2020' },
    { color_transfer: 'arib-std-b67', pix_fmt: 'yuv420p10le', color_primaries: 'bt2020' },
    { color_transfer: 'bt709', pix_fmt: 'yuv420p10le', color_primaries: 'bt2020' },
    { side_data_list: [{ side_data_type: 'HDR Dynamic Metadata SMPTE2094-40' }] }
  ];
  for (const variant of variants) {
    const report = analyze({
      ffprobe: {
        ...mpegTsProbe,
        streams: [{ ...mpegTsProbe.streams[0], ...variant }, mpegTsProbe.streams[1]]
      }
    });
    assert.equal(report.configuredContainerAnalysis.video.hdrBearing, true);
    assert.notEqual(report.configuredContainerAnalysis.video.hdrSignals.length, 0);
    assert.equal(report.classification.qPathCandidate, 'unverified');
  }
});

test('Drive files.version is required and must fence the local probe', () => {
  assert.throws(
    () => analyze({ driveVersionBefore: undefined }),
    (error) => error instanceof PriorityProbeError && error.code === 'INVALID_DRIVE_FENCE'
  );
  assert.throws(
    () => analyze({ driveVersionBefore: 22, driveVersionAfter: 23 }),
    (error) => error instanceof PriorityProbeError && error.code === 'DRIVE_VERSION_CHANGED'
  );
  assert.throws(
    () => analyze({
      expected: {
        ...privateExpectation,
        drive: { ...privateExpectation.drive, driveApiIntegerVersion: 999 }
      }
    }),
    (error) => error instanceof PriorityProbeError && error.code === 'DRIVE_VERSION_REGRESSION'
  );
  assert.deepEqual(analyze().driveFence, {
    filesVersionMatchedBeforeAfter: true,
    filesVersionAtOrAbovePrivateBaseline: true,
    filesVersionAdvancedSincePrivateBaseline: true,
    privateValues: 'omitted'
  });
});

test('analysis options and unmeasured I/O, index, seek and decode stay distinct', () => {
  const report = analyze();
  assert.equal(report.configuredContainerAnalysis.probeAnalysisSizeOptionBytes, 8 * 1024 * 1024);
  assert.equal(report.configuredContainerAnalysis.totalInputBytesReadMeasured, false);
  assert.equal(report.configuredContainerAnalysis.indexPresence, 'not-measured');
  assert.equal(report.configuredContainerAnalysis.seekBehavior, 'not-measured');
  assert.equal(report.limitations.ffprobeAnalysisOptionsAreNotTotalIoBounds, true);
  assert.equal(report.limitations.decodeOrPlaybackPerformed, false);
  assert.deepEqual(report.coverage, {
    metadataInventoryCount: 1,
    configuredContainerAnalysisCount: 1,
    decodedInThisRunCount: 0
  });
});
