'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, process.argv[2] || 'functional');
fs.mkdirSync(out, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
function installQaSlowTailFixture() {
  const CONFIG = 'DRIVE_ORIGINAL_QA_SLOW_TAIL_CONFIG';
  const STATE = 'DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE';
  const RELEASE = 'DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASE';
  const ARM_SEEK = 'DRIVE_ORIGINAL_QA_SLOW_TAIL_ARM_SEEK';
  const RELEASE_STREAM = 'DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASE_STREAM';
  const DISPOSE = 'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE';
  const nativeFetch = self.fetch.bind(self);
  let fixture = null;

  const snapshot = (active) => ({
    fixtureId: active.fixtureId,
    fileId: active.fileId,
    mode: active.mode,
    mimeType: active.mimeType,
    byteLength: active.bytes.byteLength,
    logicalTotalBytes: active.logicalTotalBytes,
    indexStart: active.indexStart,
    indexEnd: active.indexEnd,
    phase: active.phase,
    baselineEnd: active.baselineEnd,
    seekAStart: active.seekAStart,
    seekAEnd: active.seekAEnd,
    seekBStart: active.seekBStart,
    seekBEnd: active.seekBEnd,
    configured: fixture === active,
    streams: [...active.streams.values()].map((stream) => ({
      streamId: stream.streamId,
      openedSequence: stream.openedSequence,
      phaseAtOpen: stream.phaseAtOpen,
      role: stream.role,
      range: stream.range,
      start: stream.start,
      end: stream.end,
      status: 206,
      contentRange: stream.contentRange,
      contentLength: stream.responseLength,
      responseLength: stream.responseLength,
      deliveredBytes: stream.deliveredBytes,
      bodyComplete: stream.bodyComplete,
      waitingForRelease: stream.waitingForRelease,
      intersectsIndex: stream.intersectsIndex,
      isTailIndexRequest: stream.isTailIndexRequest,
      isFaststartInitialChunk: stream.isFaststartInitialChunk,
      isFaststartWarmupChunk: stream.isFaststartWarmupChunk,
      overlapStart: stream.overlapStart,
      overlapEnd: stream.overlapEnd,
      deliveredEnd: stream.deliveredBytes > 0 ? stream.start + stream.deliveredBytes - 1 : null,
      openedAt: stream.openedAt,
      terminal: stream.terminal,
      terminalAt: stream.terminalAt,
      abortSignalSeen: stream.abortSignalSeen,
      consumerCancelSeen: stream.consumerCancelSeen,
      lateReleaseAttempted: stream.lateReleaseAttempted,
      lateReleaseOutcome: stream.lateReleaseOutcome
    }))
  });
  const post = (active, message) => {
    try { active.port.postMessage({ fixtureId: active.fixtureId, ...message }); } catch (_) {}
  };
  const observe = (active, stream) => post(active, {
    type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_OBSERVATION',
    stream: snapshot(active).streams.find((item) => item.streamId === stream.streamId)
  });
  const markTerminal = (active, stream, terminal) => {
    if (stream.terminal) return false;
    stream.terminal = terminal;
    stream.terminalAt = Date.now();
    stream.waitingForRelease = false;
    stream.detachAbort?.();
    stream.detachAbort = null;
    const resolve = stream.resolvePendingPull;
    stream.resolvePendingPull = null;
    resolve?.();
    observe(active, stream);
    return true;
  };
  const releaseStream = (active, stream, { late = false } = {}) => {
    if (late) stream.lateReleaseAttempted = true;
    if (stream.terminal) {
      if (late) stream.lateReleaseOutcome = `ignored-${stream.terminal}`;
      observe(active, stream);
      return;
    }
    stream.released = true;
    if (late) stream.lateReleaseOutcome = 'released';
    const resolve = stream.resolvePendingPull;
    stream.resolvePendingPull = null;
    if (!stream.controller) {
      resolve?.();
      return;
    }
    try {
      const tailStart = stream.start + stream.deliveredBytes;
      if (tailStart <= stream.end) {
        const tail = active.bytes.slice(tailStart, stream.end + 1);
        stream.controller.enqueue(tail);
        stream.deliveredBytes += tail.byteLength;
      }
      stream.controller.close();
      stream.bodyComplete = true;
      markTerminal(active, stream, 'complete');
    } catch (_) {
      markTerminal(active, stream, 'release-error');
    } finally {
      resolve?.();
    }
  };
  const disposeStream = (active, stream) => {
    if (stream.terminal) return;
    try { stream.controller?.error(new DOMException('Fixture disposed', 'AbortError')); } catch (_) {}
    markTerminal(active, stream, 'disposed');
  };
  const bindControlPort = (active) => {
    active.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.fixtureId !== active.fixtureId) return;
      if (data.type === STATE) {
        post(active, { type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE_RESULT', requestId: data.requestId, state: snapshot(active) });
      }
      if (data.type === RELEASE) {
        for (const stream of active.streams.values()) releaseStream(active, stream);
        if (fixture === active) fixture = null;
        post(active, { type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASED', requestId: data.requestId, state: snapshot(active) });
      }
      if (data.type === ARM_SEEK && active.mode === 'seek-range-race') {
        const label = String(data.label || '').toUpperCase();
        if (label === 'A' || label === 'B') active.phase = label;
        post(active, {
          type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_SEEK_ARMED',
          requestId: data.requestId,
          label,
          state: snapshot(active)
        });
      }
      if (data.type === RELEASE_STREAM && active.mode === 'seek-range-race') {
        const stream = active.streams.get(String(data.streamId || ''));
        if (stream) releaseStream(active, stream, { late: data.late === true });
        post(active, {
          type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_STREAM_RELEASED',
          requestId: data.requestId,
          streamId: String(data.streamId || ''),
          state: snapshot(active)
        });
      }
      if (data.type === DISPOSE) {
        for (const stream of active.streams.values()) disposeStream(active, stream);
        if (fixture === active) fixture = null;
        post(active, { type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED', requestId: data.requestId, state: snapshot(active) });
      }
    };
    active.port.start?.();
  };

  self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type !== CONFIG) return;
    const port = event.ports?.[0];
    const bytes = data.bytes instanceof ArrayBuffer ? new Uint8Array(data.bytes) : null;
    if (!port || !bytes?.byteLength || !data.fixtureId || !data.fileId) return;
    const requestedMode = String(data.mode || '');
    const mode = requestedMode === 'tail-index'
      ? 'tail-index'
      : requestedMode === 'sparse-offset'
        ? 'sparse-offset'
        : requestedMode === 'faststart-chunked'
          ? 'faststart-chunked'
          : requestedMode === 'seek-range-race' ? 'seek-range-race' : 'slow-tail';
    const logicalTotalBytes = mode === 'sparse-offset'
      ? Number(data.logicalTotalBytes)
      : bytes.byteLength;
    if (!Number.isSafeInteger(logicalTotalBytes) || logicalTotalBytes <= 0) return;
    const active = {
      fixtureId: String(data.fixtureId),
      fileId: String(data.fileId),
      mode,
      mimeType: String(data.mimeType || 'video/webm'),
      prefixBytes: Math.max(1, Number(data.prefixBytes) || 1),
      initialChunkBytes: Math.max(8, Number(data.initialChunkBytes) || 24 * 1024),
      warmupChunkBytes: Math.max(8, Number(data.warmupChunkBytes) || 64 * 1024),
      indexStart: Math.max(0, Number(data.indexStart) || 0),
      indexEnd: Math.max(0, Number(data.indexEnd) || 0),
      phase: mode === 'seek-range-race' ? 'baseline' : '',
      baselineEnd: Math.max(0, Number(data.baselineEnd) || 0),
      seekAStart: Math.max(0, Number(data.seekAStart) || 0),
      seekAEnd: Math.max(0, Number(data.seekAEnd) || 0),
      seekBStart: Math.max(0, Number(data.seekBStart) || 0),
      seekBEnd: Math.max(0, Number(data.seekBEnd) || 0),
      logicalTotalBytes,
      bytes,
      port,
      streamSequence: 0,
      streams: new Map()
    };
    if (mode === 'seek-range-race' && (
      active.baselineEnd >= logicalTotalBytes
      || active.seekAStart > active.seekAEnd || active.seekAEnd >= logicalTotalBytes
      || active.seekBStart > active.seekBEnd || active.seekBEnd >= logicalTotalBytes
    )) return;
    fixture = active;
    bindControlPort(active);
    post(active, { type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_CONFIGURED', requestId: data.requestId, state: snapshot(active) });
  });

  self.fetch = async (input, init = {}) => {
    const active = fixture;
    if (!active) return nativeFetch(input, init);
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || String(input));
    const fileId = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (
      url.origin !== 'https://www.googleapis.com'
      || !url.pathname.startsWith('/drive/v3/files/')
      || url.searchParams.get('alt') !== 'media'
      || fileId !== active.fileId
    ) return nativeFetch(input, init);

    const headers = new Headers(request?.headers);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const range = headers.get('Range') || '';
    const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
    if (!match || (!match[1] && !match[2])) return nativeFetch(input, init);
    const totalBytes = active.logicalTotalBytes;
    const suffixLength = !match[1] ? Number(match[2]) : null;
    const start = suffixLength == null
      ? Number(match[1])
      : Math.max(0, totalBytes - suffixLength);
    const requestedEnd = suffixLength == null && match[2]
      ? Number(match[2])
      : totalBytes - 1;
    let end = Math.min(requestedEnd, totalBytes - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || (suffixLength != null && (!Number.isSafeInteger(suffixLength) || suffixLength <= 0))
      || start < 0 || start > end) {
      return nativeFetch(input, init);
    }

    const isFaststartInitialChunk = active.mode === 'faststart-chunked'
      && active.streams.size === 0 && start === 0;
    const isFaststartWarmupChunk = active.mode === 'faststart-chunked'
      && !isFaststartInitialChunk && start < active.warmupChunkBytes;
    const isSeekRangeRace = active.mode === 'seek-range-race';
    const phaseAtOpen = isSeekRangeRace ? active.phase : '';
    const requestedOverlapsA = isSeekRangeRace
      && start <= active.seekAEnd && requestedEnd >= active.seekAStart;
    const requestedOverlapsB = isSeekRangeRace
      && start <= active.seekBEnd && requestedEnd >= active.seekBStart;
    let role = '';
    let raceHoldAfterPrefix = false;
    if (isFaststartInitialChunk) {
      end = Math.min(end, active.initialChunkBytes - 1);
    } else if (isFaststartWarmupChunk) {
      end = Math.min(end, active.warmupChunkBytes - 1);
    }
    if (isSeekRangeRace) {
      if (active.streams.size === 0 && phaseAtOpen === 'baseline' && start === 0) {
        role = 'initial';
        end = Math.min(end, active.baselineEnd);
      } else if (phaseAtOpen === 'baseline') {
        role = 'speculative';
        end = Math.min(end, start + 64 * 1024 - 1);
        raceHoldAfterPrefix = false;
      } else if (phaseAtOpen === 'A' && requestedOverlapsA) {
        role = 'seek-A';
        end = Math.min(end, active.seekAEnd);
        raceHoldAfterPrefix = true;
      } else if (phaseAtOpen === 'B' && requestedOverlapsB) {
        role = 'seek-B';
      } else {
        role = 'unrelated';
        if (phaseAtOpen === 'A') {
          end = Math.min(end, start + 64 * 1024 - 1);
          raceHoldAfterPrefix = true;
        }
      }
    }
    const responseLength = end - start + 1;
    if (!Number.isSafeInteger(responseLength) || responseLength <= 0
      || (active.mode === 'sparse-offset'
        && (responseLength !== 1 || active.bytes.byteLength !== 1))) {
      return nativeFetch(input, init);
    }
    const isTailIndexRequest = active.mode === 'tail-index'
      && start > 0
      && start >= Math.max(1, active.indexStart - active.prefixBytes * 2)
      && end >= active.indexEnd;
    const holdAfterPrefix = isSeekRangeRace
      ? raceHoldAfterPrefix
      : !isFaststartInitialChunk && !isFaststartWarmupChunk
        && active.mode !== 'sparse-offset'
        && (active.mode === 'slow-tail' || !isTailIndexRequest);
    const prefixLength = active.mode === 'sparse-offset'
      ? 1
      : holdAfterPrefix
      ? Math.min(active.prefixBytes, Math.max(1, responseLength - 1))
      : responseLength;
    const roleStart = role === 'seek-A' ? active.seekAStart : role === 'seek-B' ? active.seekBStart : null;
    const roleEnd = role === 'seek-A' ? active.seekAEnd : role === 'seek-B' ? active.seekBEnd : null;
    const openedSequence = ++active.streamSequence;
    const stream = {
      streamId: `${active.fixtureId}-${openedSequence}`,
      openedSequence,
      phaseAtOpen,
      role,
      range,
      start,
      end,
      contentRange: `bytes ${start}-${end}/${totalBytes}`,
      responseLength,
      deliveredBytes: 0,
      bodyComplete: false,
      waitingForRelease: false,
      holdAfterPrefix,
      intersectsIndex: active.mode !== 'sparse-offset'
        && active.indexEnd >= active.indexStart
        && start <= active.indexEnd && end >= active.indexStart,
      isTailIndexRequest,
      isFaststartInitialChunk,
      isFaststartWarmupChunk,
      overlapStart: roleStart == null ? null : Math.max(start, roleStart),
      overlapEnd: roleEnd == null ? null : Math.min(end, roleEnd),
      openedAt: Date.now(),
      terminal: null,
      terminalAt: null,
      abortSignalSeen: false,
      consumerCancelSeen: false,
      lateReleaseAttempted: false,
      lateReleaseOutcome: '',
      released: false,
      controller: null,
      resolvePendingPull: null,
      detachAbort: null
    };
    active.streams.set(stream.streamId, stream);
    const signal = init.signal || request?.signal;
    const body = new ReadableStream({
      start(controller) {
        stream.controller = controller;
        if (signal) {
          const abort = () => {
            if (stream.terminal) return;
            stream.abortSignalSeen = true;
            try { controller.error(signal.reason || new DOMException('Aborted', 'AbortError')); } catch (_) {}
            markTerminal(active, stream, 'aborted');
          };
          if (signal.aborted) abort();
          else {
            signal.addEventListener('abort', abort, { once: true });
            stream.detachAbort = () => signal.removeEventListener('abort', abort);
          }
        }
      },
      pull(controller) {
        if (stream.terminal) return;
        if (stream.deliveredBytes === 0) {
          const prefix = active.mode === 'sparse-offset'
            ? active.bytes.slice(0, 1)
            : active.bytes.slice(start, start + prefixLength);
          controller.enqueue(prefix);
          stream.deliveredBytes = prefix.byteLength;
          if (!stream.holdAfterPrefix || stream.deliveredBytes >= stream.responseLength) {
            controller.close();
            stream.bodyComplete = true;
            markTerminal(active, stream, 'complete');
            return;
          }
          stream.waitingForRelease = true;
          observe(active, stream);
          return;
        }
        if (stream.released) {
          releaseStream(active, stream);
          return;
        }
        return new Promise((resolve) => { stream.resolvePendingPull = resolve; });
      },
      cancel() {
        stream.consumerCancelSeen = true;
        markTerminal(active, stream, 'cancelled');
      }
    }, { highWaterMark: 0 });
    post(active, {
      type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_REQUEST',
      request: { streamId: stream.streamId, fileId, range, usedFixture: true }
    });
    return new Response(body, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': active.mimeType,
        'Content-Range': stream.contentRange,
        'Content-Length': String(responseLength),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range,Content-Length,Accept-Ranges,Content-Type',
        'Cache-Control': 'no-store'
      }
    });
  };
}
const qaSlowTailServiceWorkerFixture = `;(${installQaSlowTailFixture.toString()})();`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/sibling/sw.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('self.addEventListener("install",()=>self.skipWaiting());'); return; }
  let relative = decodeURIComponent(url.pathname).replace(/^\/drive-original\//, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  if (relative === 'sw.js') {
    res.end(`${fs.readFileSync(file, 'utf8')}\n${qaSlowTailServiceWorkerFixture}`);
    return;
  }
  fs.createReadStream(file).pipe(res);
});
const results = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function parseIsoBmffTopLevelBoxes(bytes) {
  const boxes=[];let offset=0;
  while(offset<bytes.length) {
    assert(offset+8<=bytes.length,'ISO-BMFF box header must fit inside the fixture');
    const size32=bytes.readUInt32BE(offset);const type=bytes.toString('ascii',offset+4,offset+8);
    let size=size32;let headerSize=8;
    if(size32===1) {
      assert(offset+16<=bytes.length,'ISO-BMFF large-size header must fit inside the fixture');
      const size64=bytes.readBigUInt64BE(offset+8);assert(size64<=BigInt(Number.MAX_SAFE_INTEGER));
      size=Number(size64);headerSize=16;
    } else if(size32===0) size=bytes.length-offset;
    assert(size>=headerSize&&offset+size<=bytes.length,`invalid ISO-BMFF ${type} box`);
    boxes.push({type,offset,size,end:offset+size});offset+=size;
  }
  return boxes;
}
function expandTailIndexFixture(seed, freeBoxBytes=4*1024*1024) {
  const boxes=parseIsoBmffTopLevelBoxes(seed);
  const mdat=boxes.find(box=>box.type==='mdat');const moov=boxes.find(box=>box.type==='moov');
  assert(mdat&&moov&&moov.offset>=mdat.end,'seed must keep moov behind mdat');
  assert(Number.isSafeInteger(freeBoxBytes)&&freeBoxBytes>=8&&freeBoxBytes<=0xffffffff);
  const free=Buffer.alloc(freeBoxBytes);free.writeUInt32BE(freeBoxBytes,0);free.write('free',4,4,'ascii');
  const bytes=Buffer.concat([seed.subarray(0,moov.offset),free,seed.subarray(moov.offset)]);
  const expanded=parseIsoBmffTopLevelBoxes(bytes);const expandedMoov=expanded.find(box=>box.type==='moov');
  assert.equal(expandedMoov.offset,moov.offset+freeBoxBytes);
  return {bytes,indexStart:expandedMoov.offset,indexEnd:expandedMoov.end-1,boxes:expanded};
}
function appendFaststartTrailingFreeBox(seed, freeBoxBytes=4*1024*1024) {
  const boxes=parseIsoBmffTopLevelBoxes(seed);
  const mdat=boxes.find(box=>box.type==='mdat');const moov=boxes.find(box=>box.type==='moov');
  assert(mdat&&moov&&moov.end<=mdat.offset,'faststart seed must keep moov ahead of mdat');
  assert.equal(boxes.some(box=>box.type==='moof'),false,'faststart seed must not be fragmented');
  assert(Number.isSafeInteger(freeBoxBytes)&&freeBoxBytes>=8&&freeBoxBytes<=0xffffffff);
  assert.equal(boxes.at(-1)?.end,seed.length,'faststart seed must end on a box boundary');
  const free=Buffer.alloc(freeBoxBytes);free.writeUInt32BE(freeBoxBytes,0);free.write('free',4,4,'ascii');
  const bytes=Buffer.concat([seed,free]);
  assert(bytes.subarray(0,seed.length).equals(seed),'the immutable faststart seed must remain an exact prefix');
  assert.equal(bytes.length,seed.length+freeBoxBytes);
  const expanded=parseIsoBmffTopLevelBoxes(bytes);
  const expandedMdat=expanded.find(box=>box.type==='mdat');const trailingFree=expanded.at(-1);
  assert.deepEqual(expandedMdat,mdat,'appending the slow tail must not move or rewrite mdat');
  assert.equal(trailingFree.type,'free');assert.equal(trailingFree.offset,seed.length);assert.equal(trailingFree.size,freeBoxBytes);
  return {bytes,boxes:expanded,trailingFreeStart:trailingFree.offset,trailingFreeEnd:trailingFree.end-1};
}
const seekRangeLayout = Object.freeze({
  baselineEnd: 65535,
  seekAStart: 2631163,
  seekAEnd: 2722528,
  seekBStart: 4705854,
  seekBEnd: 4795162
});
let base, browser, video, tailIndexSeed, tailIndexVideo, faststartSeed, faststartVideo, seekRangeSeed;
const poster = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#182c43"/><circle cx="320" cy="170" r="90" fill="#4c94d2"/><text x="320" y="190" text-anchor="middle" fill="white" font-size="32">Original fixture</text></svg>');
function record(name, details = {}) { const r = { name, status:'passed', ...details }; results.push(r); console.log(JSON.stringify(r)); }
async function check(name, callback) {
  try { await callback(); }
  catch (error) { results.push({ name, status:'failed', error:error.stack }); fs.writeFileSync(path.join(out,'results.json'), JSON.stringify(results,null,2)); throw error; }
}
async function generateVideo() {
  // Reuse an explicitly supplied, bounded QA seed when MediaRecorder in the
  // test browser cannot settle. Never interpret generator hangs as app proof.
  if (process.argv[3]) {
    const seedPath=path.resolve(root,process.argv[3]);
    assert(seedPath.startsWith(path.join(root,'qa')+path.sep),'fixture must stay inside QA');
    assert.equal(path.basename(seedPath),'fixture.webm');
    const stat=fs.statSync(seedPath);
    assert(stat.isFile() && stat.size>0 && stat.size<=16*1024*1024,'bounded synthetic fixture required');
    video=fs.readFileSync(seedPath);
    fs.writeFileSync(path.join(out,'fixture.webm'),video);
    console.log(JSON.stringify({fixtureReused:true,bytes:video.length,sha256:createHash('sha256').update(video).digest('hex')}));
    return;
  }
  const page = await browser.newPage();
  await page.goto(base);
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width=640; canvas.height=360;
    const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(24);
    const media = new MediaRecorder(stream, { mimeType:'video/webm;codecs=vp8', videoBitsPerSecond:300000 });
    const chunks=[]; media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    let deadline;
    const done = new Promise((resolve,reject)=>{
      deadline=setTimeout(()=>{stream.getTracks().forEach(t=>t.stop());reject(new Error('QA MediaRecorder did not settle within 20 seconds'));},20000);
      media.onerror=()=>{clearTimeout(deadline);reject(new Error('QA MediaRecorder failed'));};
      media.onstop=async()=>{clearTimeout(deadline);resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]);};
    });
    // Attach immediately: recording errors can precede the drawing interval.
    // Returning the original promise below still propagates the failure.
    done.catch(()=>{});
    let frame=0;
    const draw = () => { ctx.fillStyle='#172b43';ctx.fillRect(0,0,640,360);ctx.fillStyle='#56a3ed';ctx.fillRect((frame*3)%540,70,100,160);ctx.fillStyle='white';ctx.font='26px sans-serif';ctx.fillText('Exact-original test '+frame,24,320);frame++; };
    draw(); media.start(); const timer=setInterval(draw,1000/24);
    await new Promise(resolve=>setTimeout(resolve,7000)); clearInterval(timer);media.stop();stream.getTracks().forEach(t=>t.stop());return done;
  });
  await page.close(); video=Buffer.from(bytes);fs.writeFileSync(path.join(out,'fixture.webm'),video);
}
async function environment({ mobile=false, disableOpfs=false, rangeFault=null, bulkFault=null, mediaBytes=video, mediaMimeType='video/webm', mediaName='긴 제목과 공백을 포함한 영상.webm', mediaMetadata={width:640,height:360,durationMillis:'2500'} }={}) {
  const context = await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  if(disableOpfs) await context.addInitScript(()=>{Object.defineProperty(navigator.storage,'getDirectory',{value:undefined,configurable:true});});
  // This audit writes only to the per-context in-memory fixture below. The
  // checked-in candidate and every real Drive surface remain write-disabled.
  await context.route('**/runtime-config.js*', route=>route.fulfill({
    contentType:'text/javascript',
    body:'globalThis.__DRIVE_ORIGINAL_RUNTIME__=Object.freeze({candidate:true,driveMutationsEnabled:true});'
  }));
  const store = new Map(); const calls=[]; let mediaCalls=0,tokenCounter=0;
  for (const [i,id] of ['video-A','video-B','video-C','video-outside'].entries()) store.set(id,{id,name:`원본 테스트 ${i+1} — ${mediaName}`,mimeType:mediaMimeType,size:String(mediaBytes.length),modifiedTime:`2026-09-${10+i}T12:00:00Z`,parents:[id==='video-outside'?'folder-Q':'root'],resourceKey:'fixture-key',thumbnailLink:poster,capabilities:{canDownload:true,canTrash:true,canMoveItemWithinDrive:true},videoMediaMetadata:mediaMetadata});
  store.set('photo-A',{id:'photo-A',name:'이미지 모음.svg',mimeType:'image/svg+xml',size:'128',parents:['root'],thumbnailLink:poster,capabilities:{canDownload:true,canTrash:true}});
  store.set('folder-Q',{id:'folder-Q',name:'다른 폴더',mimeType:'application/vnd.google-apps.folder',parents:['root']});
  const account = new Map([['state-legacy',{id:'state-legacy',name:'drive-original-account-state.json',modifiedTime:'2026-09-01T00:00:00Z',data:{schemaVersion:1,updatedAt:20,viewed:{},favorites:{'video-outside':{liked:true,updatedAt:20}}}}]]);
  await context.route('**/api/session/credential', async route=>{
    const request=route.request();const headers=await request.allHeaders();
    assert.equal(request.method(),'POST');assert.equal(headers['x-drive-original-csrf'],'1');
    tokenCounter++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      accessToken:`fixture-${tokenCounter}`,
      expiresAt:Date.now()+60*60*1000,
      account:'fixture-account',
      revision:tokenCounter
    })});
  });
  await context.route('**/auth/google/start?**', route=>route.fulfill({
    status:303,
    headers:{Location:base,'Cache-Control':'no-store'}
  }));
  await context.route('https://www.googleapis.com/**',async route=>{
    const req=route.request(); const url=new URL(req.url()); const id=url.pathname.split('/').pop(); const method=req.method(); const headers=await req.allHeaders();
    const entry={method,path:url.pathname,query:Object.fromEntries(url.searchParams),range:headers.range||null,sw:Boolean(req.serviceWorker()),authorization:headers.authorization,resourceKey:headers['x-goog-drive-resource-keys']};calls.push(entry);
    const reply=(data,status=200,extra={})=>route.fulfill({status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store',...extra},body:JSON.stringify(data)});
    if (method==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Access-Control-Allow-Headers':'*'}});
    if (id==='about') return reply({user:{permissionId:'fixture-account'}});
    if (url.searchParams.get('alt')==='media' && account.has(id)) return reply(account.get(id).data);
    if (url.pathname.includes('/upload/')) {
      if(method==='PATCH'){account.get(id).data=JSON.parse(req.postData());account.get(id).modifiedTime=new Date().toISOString();return reply({id});}
      const parts=req.postData().split('\r\n\r\n').slice(1).map(p=>p.split('\r\n--')[0]);const meta=JSON.parse(parts[0]);const data=JSON.parse(parts[1]);const created='state-'+account.size;account.set(created,{...meta,id:created,data,modifiedTime:new Date().toISOString()});return reply({id:created});
    }
    if (url.searchParams.get('spaces')==='appDataFolder') return reply({files:[...account.values()].map(({data,...rest})=>rest)});
    if(method==='PATCH') {
      if(id===bulkFault) return reply({error:{errors:[{reason:'insufficientFilePermissions'}],message:'Fixture permission denied'}},403);
      const file=store.get(id);Object.assign(file,JSON.parse(req.postData()||'{}'));
      if(url.searchParams.has('addParents'))file.parents=[url.searchParams.get('addParents')];return reply(file);
    }
    if(url.searchParams.get('alt')==='media') {
      mediaCalls++;
      if(headers.range){
        if(rangeFault==='401-once' && mediaCalls===1)return reply({error:{errors:[{reason:'authError'}]}},401);
        const match=/bytes=(\d+)-(\d*)/.exec(headers.range);const start=Number(match?.[1]||0);const end=Math.min(mediaBytes.length-1,match?.[2]?Number(match[2]):mediaBytes.length-1);
        if(start>=mediaBytes.length)return reply({error:{message:'range'}},416,{'Content-Range':`bytes */${mediaBytes.length}`});
        const bytes=mediaBytes.subarray(start,end+1);const length=rangeFault==='invalid'?'1':String(bytes.length);
        return route.fulfill({status:206,headers:{'Content-Type':mediaMimeType,'Content-Range':`bytes ${start}-${end}/${mediaBytes.length}`,'Content-Length':length,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range,Content-Length','Cache-Control':'no-store'},body:bytes});
      }
      return route.fulfill({status:200,headers:{'Content-Type':mediaMimeType,'Content-Length':String(mediaBytes.length),'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'},body:mediaBytes});
    }
    if(store.has(id))return reply(store.get(id));
    if(id==='root')return reply({id:'root',name:'내 드라이브',mimeType:'application/vnd.google-apps.folder'});
    if(id==='files') {
      const query=url.searchParams.get('q')||'';const parent=/'([^']+)' in parents/.exec(query)?.[1];
      return reply({files:[...store.values()].filter(f=>!f.trashed&&(!parent||f.parents?.includes(parent)))});
    }
    return reply({error:{message:'Unexpected test API call'}},404);
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>{
    try { return state.accountStateLoaded && state.files.length===4 && !state.loading; }
    catch (_) { return false; }
  },null,{timeout:20000});
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  return {context,page,calls,account,store,errors};
}
async function openVideo(page,id='video-A') {
  await page.evaluate(id=>openPlayer(state.files.find(f=>f.id===id)||state.favoriteFiles.find(f=>f.id===id)),id);
  await page.waitForFunction(()=>el.videoPlayer.readyState>=2 && el.mediaLoading.hidden && state.mediaTransportVerified,{timeout:20000});
  await page.evaluate(()=>{el.videoPlayer.pause();el.videoPlayer.currentTime=.4;resetControlsTimer();});
}
async function exactBufferedBytes(page) {
  return hash(Buffer.from(await page.evaluate(async()=>[...new Uint8Array(await (await fetch(el.videoPlayer.src)).arrayBuffer())])));
}
async function configureSlowTailFixture(page, { fileId='video-A', prefixBytes=64*1024, initialChunkBytes=24*1024, warmupChunkBytes=64*1024, bytes=video, mode='slow-tail', mimeType='video/webm', indexStart=0, indexEnd=0, logicalTotalBytes=null, baselineEnd=0, seekAStart=0, seekAEnd=0, seekBStart=0, seekBEnd=0 }={}) {
  const fixtureId = `${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return page.evaluate(async ({ encoded, fileId, fixtureId, prefixBytes, initialChunkBytes, warmupChunkBytes, mode, mimeType, indexStart, indexEnd, logicalTotalBytes, baselineEnd, seekAStart, seekAEnd, seekBStart, seekBEnd }) => {
    if (mode !== 'sparse-offset'
      && typeof HTMLVideoElement.prototype.requestVideoFrameCallback !== 'function') {
      return { supported: false, fixtureId };
    }
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const controller = navigator.serviceWorker.controller;
    if (!controller) throw new Error('Slow-tail fixture requires a controlling service worker');
    const channel = new MessageChannel();
    const pending = new Map();
    let sequence = 0;
    globalThis.__driveOriginalQaSlowTailMessages = [];
    globalThis.__driveOriginalQaMediaStages = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => {
      globalThis.__driveOriginalQaMediaStages.push({ ...event });
    };
    channel.port1.onmessage = (event) => {
      const data = event.data || {};
      globalThis.__driveOriginalQaSlowTailMessages.push(data);
      const waiter = pending.get(data.requestId);
      if (!waiter) return;
      pending.delete(data.requestId);
      clearTimeout(waiter.timeout);
      waiter.resolve(data);
    };
    channel.port1.start();
    const request = (type, payload = {}) => new Promise((resolve, reject) => {
      const requestId = `${fixtureId}-${++sequence}`;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Slow-tail control timeout: ${type}`));
      }, 2000);
      pending.set(requestId, { resolve, timeout });
      channel.port1.postMessage({ type, fixtureId, requestId, ...payload });
    });
    globalThis.__driveOriginalQaSlowTailRequest = request;
    const requestId = `${fixtureId}-${++sequence}`;
    const configured = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Slow-tail configuration timeout'));
      }, 2000);
      pending.set(requestId, { resolve, timeout });
    });
    controller.postMessage({
      type: 'DRIVE_ORIGINAL_QA_SLOW_TAIL_CONFIG',
      fixtureId,
      fileId,
      prefixBytes,
      initialChunkBytes,
      warmupChunkBytes,
      mode,
      mimeType,
      indexStart,
      indexEnd,
      logicalTotalBytes,
      baselineEnd,
      seekAStart,
      seekAEnd,
      seekBStart,
      seekBEnd,
      requestId,
      bytes: bytes.buffer
    }, [bytes.buffer, channel.port2]);
    await configured;
    return { supported: true, fixtureId };
  }, { encoded: bytes.toString('base64'), fileId, fixtureId, prefixBytes, initialChunkBytes, warmupChunkBytes, mode, mimeType, indexStart, indexEnd, logicalTotalBytes, baselineEnd, seekAStart, seekAEnd, seekBStart, seekBEnd });
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/drive-original/`;
  browser=await chromium.launch({channel:'chrome',headless:true});
  tailIndexSeed=fs.readFileSync(path.join(root,'qa','tail-index-h264-aac.mp4'));
  tailIndexVideo=expandTailIndexFixture(tailIndexSeed);
  faststartSeed=fs.readFileSync(path.join(root,'qa','faststart-h264-aac.mp4'));
  faststartVideo=appendFaststartTrailingFreeBox(faststartSeed);
  seekRangeSeed=fs.readFileSync(path.join(root,'qa','seek-range-h264-aac.mp4'));
  try {
    await generateVideo();
    await check('immersive bottom-only chrome, pointer focus, keyboard access and fullscreen',async()=>{
      const {page,context,errors}=await environment();
      try {
        await openVideo(page);
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>el.playerModal.classList.contains('controls-idle')),true);
        assert.equal(await page.locator('#stageCenterPlayBtn').isVisible(),false);
        await page.mouse.move(620,390);await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true,'central mouse movement must not reveal');
        await page.mouse.move(620,797);await page.waitForTimeout(200);
        assert.equal(await page.evaluate(()=>playerChrome.inert),false);
        const bounds=await page.locator('.custom-video-controls').evaluate(e=>({width:e.getBoundingClientRect().width,bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderTopWidth}));
        assert(bounds.width>1150);assert.equal(bounds.bg,'rgba(0, 0, 0, 0)');assert.equal(bounds.border,'0px');
        await page.locator('#ctrlMute').click();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'mediaStage');
        const muted=await page.evaluate(()=>el.videoPlayer.muted);
        await page.mouse.move(630,380);await page.waitForTimeout(550);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true);
        await page.keyboard.press('Space');await page.waitForTimeout(80);
        assert.equal(await page.evaluate(()=>el.videoPlayer.paused),false);
        assert.equal(await page.evaluate(()=>el.videoPlayer.muted),muted,'Space must not reactivate mute');
        await page.keyboard.press('Space');
        assert.equal(await page.evaluate(()=>el.videoPlayer.paused),true);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true,'pause does not reveal chrome');
        await page.screenshot({path:path.join(out,'desktop-paused-immersive.png')});
        await page.keyboard.press('Tab');await page.locator('#ctrlMute').focus();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'ctrlMute','Tab must synchronously expose keyboard focus');
        await page.keyboard.press('Space');
        assert.equal(await page.evaluate(()=>el.videoPlayer.muted),!muted,'intentional keyboard button activation stays native');
        assert.equal(await page.evaluate(()=>el.videoPlayer.paused),true);
        const clipped=await page.locator('.player-chrome button:visible').evaluateAll(nodes=>nodes.filter(n=>{
          const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight;
        }).map(n=>n.id));assert.deepEqual(clipped,[],'controls must not slide outside the viewport when revealed');
        await page.screenshot({path:path.join(out,'desktop-bottom-chrome.png')});
        await page.locator('#ctrlMute').click();await page.mouse.move(640,300);await page.waitForTimeout(550);
        assert.equal(await page.evaluate(()=>playerChrome.inert),true,'pointer takeover after keyboard use still hides on exit');
        await page.keyboard.press('f');await page.waitForFunction(()=>Boolean(document.fullscreenElement));
        assert.equal(await page.evaluate(()=>document.fullscreenElement.contains(playerChrome)),true);
        await page.keyboard.press('f');await page.waitForFunction(()=>!document.fullscreenElement);
        assert.deepEqual(errors,[]);record('immersive bottom-only chrome, pointer focus, keyboard access and fullscreen',{bounds});
      }finally{await context.close();}
    });
    await check('player edge closes exactly one history entry; interior swipe keeps player open',async()=>{
      const {page,context,errors}=await environment({mobile:true});
      try {
        await openVideo(page);
        const folder=await page.evaluate(()=>state.currentFolderId);
        const cdp=await context.newCDPSession(page);
        const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=0])=>({x,y,id,radiusX:1,radiusY:1,force:1}))});
        const drag=async xs=>{await send('touchStart',[[xs[0],350]]);for(const x of xs.slice(1)){await page.waitForTimeout(45);await send('touchMove',[[x,350]]);}await send('touchEnd',[]);};
        const before=await page.evaluate(()=>state.selected.id);
        await drag([4,65,210,85]);await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>el.playerSheet.hidden),false);
        assert.equal(await page.evaluate(()=>state.selected.id),before,'reverse edge must not change video');
        await drag([4,65,160,245]);
        await page.waitForFunction(()=>el.playerSheet.hidden&&!playerHistoryPending);
        assert.equal(await page.evaluate(()=>state.currentFolderId),folder);
        assert.equal(await page.evaluate(()=>el.playerSheet.style.transform),'');
        assert.equal(await page.locator('.library-edge-transition').count(),0);
        await openVideo(page,'video-B');
        await drag([100,155,230,290]);
        await page.waitForFunction(()=>state.selected?.id!=='video-B'&&!swipeCommitPending);
        assert.equal(await page.evaluate(()=>el.playerSheet.hidden),false);
        await page.goBack();await page.waitForFunction(()=>el.playerSheet.hidden);
        assert.equal(await page.evaluate(()=>state.currentFolderId),folder);
        assert.deepEqual(errors,[]);record('player edge closes exactly one history entry; interior swipe keeps player open',{physicalDevice:false});
      }finally{await context.close();}
    });
    await check('real pointer long press cancels native selection and consumes release click',async()=>{
      const {page,context,errors}=await environment();
      try {
        const button=page.locator('.file-card-open').first();const r=await button.boundingBox();
        await page.mouse.move(r.x+r.width/2,r.y+40);await page.mouse.down();await page.waitForTimeout(620);
        assert.equal(await page.evaluate(()=>state.selectionMode),true);
        await page.mouse.up();await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>el.playerSheet.hidden),true);
        assert.equal(await page.evaluate(()=>String(window.getSelection())), '');
        assert.equal(await button.evaluate(n=>getComputedStyle(n).userSelect),'none');
        await page.locator('#selectionCancelBtn').click();
        await page.mouse.move(r.x+r.width/2,r.y+40);await page.mouse.down();
        await page.mouse.move(r.x+r.width/2+50,r.y+80);await page.waitForTimeout(620);await page.mouse.up();
        assert.equal(await page.evaluate(()=>state.selectionMode),false,'movement cancels pending selection');
        if(!await page.evaluate(()=>el.playerSheet.hidden)) await page.keyboard.press('Escape');
        await page.locator('#searchInput').fill('selection remains available');
        await page.locator('#searchInput').focus();await page.keyboard.press('Control+a');
        assert.equal(await page.locator('#searchInput').evaluate(n=>n.selectionEnd-n.selectionStart),27);
        assert.deepEqual(errors,[]);record('real pointer long press cancels native selection and consumes release click');
      }finally{await context.close();}
    });
    await check('same-account fixture renewal preserves playback and the expired library',async()=>{
      const {page,context,errors}=await environment();
      try {
        await openVideo(page);
        const proof=await page.evaluate(async()=>{
          const files=state.files, selected=state.selected, session=state.mediaSession;
          const generation=state.driveSessionGeneration, revision=state.tokenRevision;
          const ok=await requestSessionCredential({background:false,force:true,rejectedRevision:revision});
          clearRejectedToken({status:401,rejectedTokenRevision:revision,rejectedAccountGeneration:generation});
          return {ok,sameFiles:state.files===files,sameSelected:state.selected===selected,
            sameMedia:state.mediaSession===session,sameAccountGeneration:state.driveSessionGeneration===generation,
            renewed:state.tokenRevision>revision,usable:hasUsableToken(),paused:el.videoPlayer.paused,time:el.videoPlayer.currentTime};
        });
        assert(proof.ok&&proof.sameFiles&&proof.sameSelected&&proof.sameMedia&&proof.sameAccountGeneration&&proof.renewed&&proof.usable&&proof.paused);
        assert(Math.abs(proof.time-.4)<.15);
        await page.keyboard.press('Escape');await page.waitForFunction(()=>el.playerSheet.hidden&&!playerHistoryPending);
        await page.setViewportSize({width:320,height:568});
        const preserved=await page.evaluate(async()=>{
          const files=state.files;state.expiresAt=Date.now()-1;await loadFiles({append:false});
          return state.files===files&&!el.libraryView.hidden;
        });assert.equal(preserved,true);
        assert.equal(await page.locator('#reconnectButton').isVisible(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.screenshot({path:path.join(out,'320-reconnect-preserves-library.png')});
        await page.locator('#reconnectButton').click();
        await page.waitForFunction(()=>{
          try { return hasUsableToken()&&!document.getElementById('reconnectButton').disabled; }
          catch (_) { return false; }
        },null,{timeout:20000});
        assert.equal(await page.locator('#reconnectButton').isVisible(),false);
        assert.deepEqual(errors,[]);record('same-account fixture renewal preserves playback and the expired library',{proof});
      }finally{await context.close();}
    });
    await check('initial route stays Range-first when writable OPFS is available',async()=>{
      const {page,context,calls,errors}=await environment();
      try {
        await openVideo(page);
        const mode=await page.evaluate(()=>state.mediaPlaybackMode);assert.equal(mode,'original-range');
        const media=calls.filter(c=>c.query.alt==='media'&&!c.path.includes('state'));
        assert(media.length>0);assert(media[0].range);assert(media[0].sw);
        assert.equal(media.some(c=>!c.range),false,'initial playback must not start a full-file recovery request');
        assert.deepEqual(errors,[]);record('initial route stays Range-first when writable OPFS is available',{mode,mediaRequests:media.length});
      } finally{await context.close();}
    });
    await check('decoded first frame precedes slow Range body completion',async()=>{
      const {page,context,calls,errors}=await environment();
      let configured=false;
      try {
        const setup=await configureSlowTailFixture(page);
        assert.equal(setup.supported,true,'QA-TR-01 requires requestVideoFrameCallback');
        configured=true;
        await page.evaluate(()=>openPlayer(state.files.find(file=>file.id==='video-A')));
        await page.waitForFunction(
          ()=>globalThis.__driveOriginalQaMediaStages?.some(event=>event.stage==='first-decoded-frame'&&event.confidence==='decoded-frame'),
          null,
          {timeout:8000}
        );
        const proof=await page.evaluate(async()=>{
          const stateReply=await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE');
          const stages=globalThis.__driveOriginalQaMediaStages.slice();
          const frame=stages.find(event=>event.stage==='first-decoded-frame');
          const stream=stateReply.state.streams.find(item=>item.waitingForRelease&&!item.terminal);
          return {
            frame,
            stream,
            stagesThroughSnapshot:stages.map(event=>({
              stage:event.stage,
              sequence:event.sequence,
              route:event.route,
              requestId:event.requestId,
              requestedRange:event.requestedRange,
              rangeSatisfied:event.rangeSatisfied,
              playbackMode:event.playbackMode,
              bytes:event.bytes,
              totalBytes:event.totalBytes,
              confidence:event.confidence
            })),
            mode:state.mediaPlaybackMode,
            transportVerified:state.mediaTransportVerified,
            rangeIntegrity:state.mediaRangeIntegrity,
            fullRequestCount:state.mediaFullRequestCount,
            previewHidden:el.drivePreview.hidden,
            readyState:el.videoPlayer.readyState
          };
        });
        assert(proof.frame,'decoded-frame stage must be emitted');
        assert.equal(proof.frame.confidence,'decoded-frame');
        assert(proof.stream,'a held Range stream must still be active at the frame boundary');
        assert(proof.stream.range,'the controlled request must contain a Range header');
        assert(proof.stream.deliveredBytes>0,'the playable prefix must reach the product worker');
        assert(proof.stream.deliveredBytes<proof.stream.responseLength,'the response body must remain incomplete');
        assert.equal(proof.stream.bodyComplete,false);
        assert.equal(proof.stream.waitingForRelease,true);
        assert.equal(proof.stream.terminal,null);
        const firstByte=proof.stagesThroughSnapshot.find(event=>event.stage==='first-byte'&&event.route==='range');
        assert(firstByte,'the production service worker must emit its Range first-byte evidence');
        assert(firstByte.requestId,'the Range first-byte evidence must be request-correlated');
        assert.equal(firstByte.requestedRange,proof.stream.range);
        assert.equal(firstByte.rangeSatisfied,true);
        assert.equal(firstByte.playbackMode,'original-range');
        assert.equal(firstByte.bytes,proof.stream.deliveredBytes);
        assert.equal(firstByte.totalBytes,proof.stream.responseLength);
        assert.equal(proof.stagesThroughSnapshot.some(event=>event.stage==='body-complete'),false);
        assert.equal(proof.stagesThroughSnapshot.some(event=>['first-byte-timeout','body-no-progress'].includes(event.stage)),false);
        assert.equal(proof.mode,'original-range');
        assert.equal(proof.transportVerified,true);
        assert.equal(proof.rangeIntegrity,'valid');
        assert.equal(proof.fullRequestCount,0);
        assert.equal(proof.previewHidden,true);
        assert.equal(calls.some(call=>call.query.alt==='media'&&call.path.endsWith('/video-A')),false,'buffered Playwright fulfillment must not supply this media body');
        assert.deepEqual(errors,[]);
        await page.evaluate(()=>closePlayer());
        const cleanup=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASE'));
        assert.equal(cleanup.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASED');
        assert.equal(cleanup.state.configured,false);
        configured=false;
        record('decoded first frame precedes slow Range body completion',{
          mode:proof.mode,
          range:proof.stream.range,
          deliveredBytes:proof.stream.deliveredBytes,
          responseLength:proof.stream.responseLength,
          bodyComplete:proof.stream.bodyComplete,
          confidence:proof.frame.confidence,
          readyState:proof.readyState
        });
      } finally {
        if(configured) {
          try { await page.evaluate(()=>{ if(!el.playerSheet.hidden) closePlayer(); }); } catch (_) {}
          try { await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest?.('DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASE')); } catch (_) {}
        }
        await context.close();
      }
    });
    await check('tail-index MP4 reaches a decoded frame through a coherent tail Range',async()=>{
      const {page,context,calls,errors}=await environment({
        mediaBytes:tailIndexVideo.bytes,
        mediaMimeType:'video/mp4',
        mediaName:'tail-index H.264 AAC.mp4',
        mediaMetadata:{width:320,height:180,durationMillis:'3000'}
      });
      let configured=false;
      const seedHash=hash(tailIndexSeed);
      try {
        const setup=await configureSlowTailFixture(page,{
          bytes:tailIndexVideo.bytes,
          mode:'tail-index',
          mimeType:'video/mp4',
          prefixBytes:64*1024,
          indexStart:tailIndexVideo.indexStart,
          indexEnd:tailIndexVideo.indexEnd
        });
        assert.equal(setup.supported,true,'QA-TR-02 requires requestVideoFrameCallback');
        configured=true;
        await page.evaluate(()=>openPlayer(state.files.find(file=>file.id==='video-A')));
        await page.waitForFunction(()=>{
          const stages=globalThis.__driveOriginalQaMediaStages||[];
          return el.videoPlayer.readyState>=2
            && stages.some(event=>event.stage==='first-decoded-frame'&&event.confidence==='decoded-frame')
            && stages.some(event=>event.stage==='body-complete'&&event.route==='range');
        },null,{timeout:10000});
        const proof=await page.evaluate(async()=>{
          const stateReply=await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE');
          const streams=stateReply.state.streams;
          const intervals=streams.filter(stream=>stream.deliveredBytes>0)
            .map(stream=>[stream.start,stream.start+stream.deliveredBytes-1])
            .sort((a,b)=>a[0]-b[0]);
          const merged=[];
          for(const interval of intervals) {
            const last=merged.at(-1);
            if(!last||interval[0]>last[1]+1) merged.push(interval.slice());
            else last[1]=Math.max(last[1],interval[1]);
          }
          const deliveredUniqueBytes=merged.reduce((sum,interval)=>sum+interval[1]-interval[0]+1,0);
          return {
            fixture:stateReply.state,
            deliveredUniqueBytes,
            stages:(globalThis.__driveOriginalQaMediaStages||[]).map(event=>({
              stage:event.stage,sequence:event.sequence,route:event.route,requestId:event.requestId,
              status:event.status,requestedRange:event.requestedRange,rangeSatisfied:event.rangeSatisfied,
              playbackMode:event.playbackMode,bytes:event.bytes,totalBytes:event.totalBytes,
              confidence:event.confidence,stale:event.stale
            })),
            readyState:el.videoPlayer.readyState,
            duration:el.videoPlayer.duration,
            width:el.videoPlayer.videoWidth,
            height:el.videoPlayer.videoHeight,
            mode:state.mediaPlaybackMode,
            attempt:state.mediaAttempt,
            retryCount:state.mediaRetryCount,
            fullRequestCount:state.mediaFullRequestCount,
            bufferStorageMode:state.mediaBufferStorageMode,
            hasTempStorage:Boolean(state.mediaTempStorage),
            transportVerified:state.mediaTransportVerified,
            rangeIntegrity:state.mediaRangeIntegrity,
            decodeVerified:state.mediaDecodeVerified,
            previewHidden:el.drivePreview.hidden
          };
        });
        const streams=proof.fixture.streams;
        const front=streams.find(stream=>stream.start===0);
        const tail=streams.find(stream=>stream.isTailIndexRequest&&stream.bodyComplete);
        assert(front,'the media element must begin at the front of the MP4');
        assert(front.deliveredBytes>0&&front.deliveredBytes<front.responseLength,'front delivery must stop before the full response');
        assert.equal(front.bodyComplete,false);
        assert(tail,'the media element must request and complete a non-zero Range crossing moov');
        assert(tail.start<=proof.fixture.indexStart&&tail.end>=proof.fixture.indexEnd);
        assert.equal(tail.status,206);
        assert.equal(tail.contentRange,`bytes ${tail.start}-${tail.end}/${proof.fixture.byteLength}`);
        assert.equal(tail.contentLength,tail.end-tail.start+1);
        assert.equal(tail.deliveredBytes,tail.contentLength);
        assert.equal(tail.terminal,'complete');
        const tailFirstByte=proof.stages.find(event=>event.stage==='first-byte'&&event.requestedRange===tail.range&&event.rangeSatisfied===true);
        assert(tailFirstByte,'production worker must report first-byte for the tail Range');
        assert.equal(tailFirstByte.playbackMode,'original-range');
        assert.equal(tailFirstByte.totalBytes,tail.responseLength);
        const tailComplete=proof.stages.find(event=>event.stage==='body-complete'&&event.requestId===tailFirstByte.requestId);
        assert(tailComplete,'production worker must complete the same tail request');
        assert.equal(tailComplete.requestedRange,tail.range);
        assert.equal(tailComplete.bytes,tail.responseLength);
        assert.equal(tailComplete.totalBytes,tail.responseLength);
        assert(proof.stages.some(event=>event.stage==='headers'&&event.requestId===tailFirstByte.requestId&&event.status===206));
        assert(proof.stages.some(event=>event.stage==='first-decoded-frame'&&event.confidence==='decoded-frame'));
        assert(proof.readyState>=2&&Number.isFinite(proof.duration)&&proof.duration>0);
        assert(proof.width>0&&proof.height>0);
        assert(proof.deliveredUniqueBytes<proof.fixture.byteLength,`decoded readiness must precede unique whole-file delivery: ${JSON.stringify(streams)}`);
        assert(streams.every(stream=>Boolean(stream.range)),'every fixture media request must carry Range');
        assert.equal(proof.mode,'original-range');
        assert.equal(proof.attempt,'range');
        assert.equal(proof.retryCount,0);
        assert.equal(proof.fullRequestCount,0);
        assert.equal(proof.bufferStorageMode,'');
        assert.equal(proof.hasTempStorage,false);
        assert.equal(proof.transportVerified,true);
        assert.equal(proof.rangeIntegrity,'valid');
        assert.equal(proof.decodeVerified,true);
        assert.equal(proof.previewHidden,true);
        assert.equal(proof.stages.some(event=>event.route==='full-original'),false);
        assert.equal(calls.some(call=>call.query.alt==='media'&&call.path.endsWith('/video-A')),false,'Playwright fulfillment must not bypass the product worker fixture');
        assert.deepEqual(errors,[]);
        assert.equal(hash(fs.readFileSync(path.join(root,'qa','tail-index-h264-aac.mp4'))),seedHash,'the committed seed must remain unchanged');

        await page.evaluate(()=>closePlayer());
        await page.waitForFunction(async()=>{
          const reply=await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE');
          return reply.state.streams.every(stream=>Boolean(stream.terminal));
        },null,{timeout:2000});
        const closed=await page.evaluate(async()=>({
          fixture:(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state,
          selectedId:state.selected?.id||null,
          attempt:state.mediaAttempt,
          previewHidden:el.drivePreview.hidden
        }));
        assert(closed.fixture.streams.filter(stream=>!stream.bodyComplete).every(stream=>['cancelled','aborted'].includes(stream.terminal)));
        assert.equal(closed.selectedId,null);
        assert.equal(closed.attempt,'idle');
        assert.equal(closed.previewHidden,true);
        const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
        assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
        assert.equal(disposed.state.configured,false);
        assert.deepEqual(errors,[],'close and dispose must not emit a page error');
        configured=false;
        record('tail-index MP4 reaches a decoded frame through a coherent tail Range',{
          mode:proof.mode,
          range:tail.range,
          contentRange:tail.contentRange,
          deliveredUniqueBytes:proof.deliveredUniqueBytes,
          fileBytes:proof.fixture.byteLength,
          moovStart:proof.fixture.indexStart,
          readyState:proof.readyState
        });
      } finally {
        if(configured) {
          try { await page.evaluate(()=>{ if(!el.playerSheet.hidden) closePlayer(); }); } catch (_) {}
          try { await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest?.('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE')); } catch (_) {}
        }
        await context.close();
      }
    });
    await check('non-faststart MP4 stays undecodable while its tail index is withheld',async()=>{
      const {page,context,calls,errors}=await environment({
        disableOpfs:true,
        mediaBytes:tailIndexVideo.bytes,
        mediaMimeType:'video/mp4',
        mediaName:'non-faststart H.264 AAC control.mp4',
        mediaMetadata:{width:320,height:180,durationMillis:'3000'}
      });
      let configured=false;
      try {
        const setup=await configureSlowTailFixture(page,{
          bytes:tailIndexVideo.bytes,
          mode:'faststart-chunked',
          mimeType:'video/mp4',
          initialChunkBytes:24*1024,
          warmupChunkBytes:tailIndexSeed.length,
          prefixBytes:96*1024,
          indexStart:tailIndexVideo.indexStart,
          indexEnd:tailIndexVideo.indexEnd
        });
        assert.equal(setup.supported,true,'QA-TR-01 control requires requestVideoFrameCallback');
        configured=true;
        await page.evaluate(()=>{
          const video=el.videoPlayer;
          video.muted=true;
          globalThis.__driveOriginalQaPresentedFrames=[];
          globalThis.__driveOriginalQaFrameCaptureActive=true;
          const capture=()=>video.requestVideoFrameCallback((_now,metadata)=>{
            globalThis.__driveOriginalQaPresentedFrames.push({
              at:Date.now(),mediaTime:Number(metadata?.mediaTime)||0
            });
            if(globalThis.__driveOriginalQaFrameCaptureActive
              &&globalThis.__driveOriginalQaPresentedFrames.length<120)capture();
          });
          capture();
          openPlayer(state.files.find(file=>file.id==='video-A'));
          void video.play().catch(()=>{});
        });
        await page.waitForFunction(async()=>{
          const reply=await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE');
          return reply.state.streams.some(stream=>stream.waitingForRelease&&!stream.terminal);
        },null,{timeout:3000});
        await page.waitForTimeout(2500);
        const proof=await page.evaluate(async()=>({
          fixture:(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state,
          frames:(globalThis.__driveOriginalQaPresentedFrames||[]).slice(),
          stages:(globalThis.__driveOriginalQaMediaStages||[]).map(event=>({
            stage:event.stage,traceId:event.traceId,route:event.route,requestId:event.requestId,
            requestedRange:event.requestedRange,rangeSatisfied:event.rangeSatisfied,
            playbackMode:event.playbackMode,bytes:event.bytes,totalBytes:event.totalBytes
          })),
          currentTime:el.videoPlayer.currentTime,
          readyState:el.videoPlayer.readyState,
          mode:state.mediaPlaybackMode,
          attempt:state.mediaAttempt,
          retryCount:state.mediaRetryCount,
          fullRequestCount:state.mediaFullRequestCount,
          bufferStorageMode:state.mediaBufferStorageMode,
          hasTempStorage:Boolean(state.mediaTempStorage),
          transportVerified:state.mediaTransportVerified,
          rangeIntegrity:state.mediaRangeIntegrity,
          previewHidden:el.drivePreview.hidden
        }));
        const held=proof.fixture.streams.find(stream=>stream.waitingForRelease&&!stream.terminal);
        assert(held,'the control must keep the Range that leads toward the tail index open');
        assert.equal(held.bodyComplete,false);
        assert(held.start<=proof.fixture.indexStart&&held.start+held.deliveredBytes<=proof.fixture.indexEnd,
          'at least the final tail-index byte must remain withheld from the non-faststart control');
        const heldFirstBytes=proof.stages.filter(event=>event.stage==='first-byte'
          &&event.route==='range'&&event.requestedRange===held.range);
        assert.equal(heldFirstBytes.length,1,'the held control Range must have unique production-worker first-byte evidence');
        const heldFirstByte=heldFirstBytes[0];
        assert(heldFirstByte.requestId);
        assert.equal(heldFirstByte.rangeSatisfied,true);
        assert.equal(heldFirstByte.playbackMode,'original-range');
        assert.equal(heldFirstByte.bytes,held.deliveredBytes);
        assert.equal(heldFirstByte.totalBytes,held.responseLength);
        assert.equal(proof.stages.some(event=>event.stage==='body-complete'
          &&event.requestId===heldFirstByte.requestId),false);
        assert.equal(proof.stages.some(event=>event.stage==='first-decoded-frame'),false);
        assert.equal(proof.frames.some(frame=>frame.mediaTime>=2),false);
        assert(proof.currentTime<2);
        assert(proof.readyState<2);
        assert.equal(proof.mode,'original-range');
        assert.equal(proof.attempt,'range');
        assert.equal(proof.retryCount,0);
        assert.equal(proof.fullRequestCount,0);
        assert.equal(proof.bufferStorageMode,'');
        assert.equal(proof.hasTempStorage,false);
        assert.equal(proof.transportVerified,true);
        assert.equal(proof.rangeIntegrity,'valid');
        assert.equal(proof.previewHidden,true);
        assert.equal(calls.some(call=>call.query.alt==='media'&&call.path.endsWith('/video-A')),false,
          'Playwright fulfillment must not bypass the production worker control fixture');

        await page.evaluate(()=>{globalThis.__driveOriginalQaFrameCaptureActive=false;closePlayer();});
        await page.waitForFunction(async()=>{
          const reply=await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE');
          return reply.state.streams.every(stream=>Boolean(stream.terminal));
        },null,{timeout:2000});
        const closed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE'));
        const closedHeld=closed.state.streams.find(stream=>stream.streamId===held.streamId);
        assert(closedHeld&&!closedHeld.bodyComplete&&['cancelled','aborted'].includes(closedHeld.terminal));
        const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
        assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
        assert.equal(disposed.state.configured,false);
        configured=false;
        assert.deepEqual(errors,[]);
        record('non-faststart MP4 stays undecodable while its tail index is withheld',{
          range:held.range,deliveredBytes:held.deliveredBytes,moovStart:proof.fixture.indexStart,
          currentTime:proof.currentTime,readyState:proof.readyState
        });
      } finally {
        try {
          if(configured){
            await page.evaluate(()=>{globalThis.__driveOriginalQaFrameCaptureActive=false;if(!el.playerSheet.hidden)closePlayer();});
            const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
            assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
            assert.equal(disposed.state.configured,false);
          }
        } finally { await context.close(); }
      }
    });
    await check('faststart MP4 presents two seconds before whole-file Range completion',async()=>{
      const {page,context,calls,errors}=await environment({
        disableOpfs:true,
        mediaBytes:faststartVideo.bytes,
        mediaMimeType:'video/mp4',
        mediaName:'faststart H.264 AAC.mp4',
        mediaMetadata:{width:320,height:180,durationMillis:'10000'}
      });
      let configured=false;
      try {
        const setup=await configureSlowTailFixture(page,{
          bytes:faststartVideo.bytes,
          mode:'faststart-chunked',
          mimeType:'video/mp4',
          initialChunkBytes:24*1024,
          warmupChunkBytes:faststartSeed.length,
          prefixBytes:96*1024
        });
        assert.equal(setup.supported,true,'QA-TR-01 requires requestVideoFrameCallback');
        configured=true;
        await page.evaluate(()=>{
          const video=el.videoPlayer;
          video.muted=true;
          globalThis.__driveOriginalQaPlayResult='pending';
          globalThis.__driveOriginalQaPresentedFrames=[];
          globalThis.__driveOriginalQaFrameCaptureActive=true;
          const capture=()=>video.requestVideoFrameCallback((_now,metadata)=>{
            globalThis.__driveOriginalQaPresentedFrames.push({
              at:Date.now(),
              mediaTime:Number(metadata?.mediaTime)||0,
              presentedFrames:Number(metadata?.presentedFrames)||0
            });
            if(globalThis.__driveOriginalQaFrameCaptureActive
              &&globalThis.__driveOriginalQaPresentedFrames.length<600)capture();
          });
          capture();
          openPlayer(state.files.find(file=>file.id==='video-A'));
          void video.play().then(
            ()=>{globalThis.__driveOriginalQaPlayResult='resolved';},
            error=>{globalThis.__driveOriginalQaPlayResult=`rejected:${error?.name||'Error'}`;}
          );
        });
        try {
          await page.waitForFunction(()=>{
            const frames=globalThis.__driveOriginalQaPresentedFrames||[];
            const stages=globalThis.__driveOriginalQaMediaStages||[];
            return frames.some(frame=>frame.mediaTime>=2)
              &&el.videoPlayer.currentTime>=2
              &&stages.some(event=>event.stage==='first-decoded-frame'&&event.confidence==='decoded-frame');
          },null,{timeout:10000});
        } catch (error) {
          const diagnostic=await page.evaluate(async()=>({
            playResult:globalThis.__driveOriginalQaPlayResult,
            frames:(globalThis.__driveOriginalQaPresentedFrames||[]).slice(-8),
            stages:(globalThis.__driveOriginalQaMediaStages||[]).map(event=>({
              stage:event.stage,route:event.route,traceId:event.traceId,requestId:event.requestId,
              requestedRange:event.requestedRange,bytes:event.bytes,totalBytes:event.totalBytes
            })),
            fixture:(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state,
            currentTime:el.videoPlayer.currentTime,readyState:el.videoPlayer.readyState,
            networkState:el.videoPlayer.networkState,
            mediaError:el.videoPlayer.error?{code:el.videoPlayer.error.code,message:el.videoPlayer.error.message}:null,
            attempt:state.mediaAttempt,mode:state.mediaPlaybackMode
          }));
          throw new Error(`Faststart progress timed out: ${error.message}\n${JSON.stringify(diagnostic)}`,{cause:error});
        }
        const proof=await page.evaluate(async()=>{
          const fixture=(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state;
          const stages=(globalThis.__driveOriginalQaMediaStages||[]).map(event=>({
            stage:event.stage,sequence:event.sequence,at:event.at,traceId:event.traceId,
            route:event.route,requestId:event.requestId,
            requestedRange:event.requestedRange,rangeSatisfied:event.rangeSatisfied,
            playbackMode:event.playbackMode,bytes:event.bytes,totalBytes:event.totalBytes,
            confidence:event.confidence,terminal:event.terminal
          }));
          const frames=(globalThis.__driveOriginalQaPresentedFrames||[]).slice();
          return {
            fixture,stages,frames,
            maxPresentedMediaTime:Math.max(0,...frames.map(frame=>frame.mediaTime)),
            currentTime:el.videoPlayer.currentTime,
            readyState:el.videoPlayer.readyState,
            playResult:globalThis.__driveOriginalQaPlayResult,
            mode:state.mediaPlaybackMode,
            attempt:state.mediaAttempt,
            retryCount:state.mediaRetryCount,
            fullRequestCount:state.mediaFullRequestCount,
            bufferStorageMode:state.mediaBufferStorageMode,
            hasTempStorage:Boolean(state.mediaTempStorage),
            transportVerified:state.mediaTransportVerified,
            rangeIntegrity:state.mediaRangeIntegrity,
            previewHidden:el.drivePreview.hidden
          };
        });
        const initial=proof.fixture.streams.find(stream=>stream.isFaststartInitialChunk);
        assert(initial,'the cold open-ended request must complete only the bounded metadata chunk');
        assert.equal(initial.start,0);
        assert.equal(initial.end,24*1024-1);
        assert.equal(initial.responseLength,24*1024);
        assert.equal(initial.bodyComplete,true);
        assert.equal(initial.terminal,'complete');
        const warmup=proof.fixture.streams.find(stream=>stream.isFaststartWarmupChunk);
        assert(warmup,'a bounded media warmup Range must complete before the held continuation');
        assert.equal(warmup.start,initial.end+1);
        assert.equal(warmup.end,faststartSeed.length-1);
        assert.equal(warmup.responseLength,faststartSeed.length-24*1024);
        assert.equal(initial.responseLength+warmup.responseLength,faststartSeed.length);
        assert.equal(warmup.bodyComplete,true);
        assert.equal(warmup.terminal,'complete');
        const heldStreams=proof.fixture.streams.filter(stream=>stream.waitingForRelease&&!stream.terminal);
        assert.equal(heldStreams.length,1,'exactly one continuation Range must remain held');
        assert.equal(proof.fixture.streams.length,3,'the cold path must use two bounded seed Ranges and one held tail Range');
        const front=heldStreams[0];
        assert.equal(front.isFaststartInitialChunk,false);
        assert.equal(front.isFaststartWarmupChunk,false);
        assert.equal(front.start,warmup.end+1);
        assert(front.deliveredBytes>0&&front.deliveredBytes<front.responseLength);
        assert.equal(front.start,faststartVideo.trailingFreeStart,
          'the held response must begin exactly after the immutable MP4 seed in trailing free bytes');
        assert.equal(front.responseLength,4*1024*1024);
        assert.equal(front.bodyComplete,false);
        assert.equal(front.waitingForRelease,true);
        assert.equal(front.terminal,null);
        assert(proof.fixture.streams.every(stream=>stream.range));
        assert.equal(new Set(proof.fixture.streams.map(stream=>stream.range)).size,proof.fixture.streams.length,
          'each fixture stream must have a unique Range for request correlation');
        const traceIds=[...new Set(proof.stages.map(event=>event.traceId).filter(Boolean))];
        assert.equal(traceIds.length,1,'the cold playback must emit exactly one diagnostic trace');
        const traceId=traceIds[0];
        const matchingFirstBytes=proof.stages.filter(event=>event.stage==='first-byte'
          &&event.route==='range'&&event.traceId===traceId&&event.requestedRange===front.range);
        assert.equal(matchingFirstBytes.length,1,'held Range first-byte evidence must be unique');
        const firstByte=matchingFirstBytes[0];
        assert(firstByte,'the production worker must own the held Range first byte');
        assert.equal(firstByte.rangeSatisfied,true);
        assert.equal(firstByte.playbackMode,'original-range');
        assert.equal(firstByte.bytes,front.deliveredBytes);
        assert.equal(firstByte.totalBytes,front.responseLength);
        assert(firstByte.at>=front.openedAt);
        const decoded=proof.stages.find(event=>event.stage==='first-decoded-frame'
          &&event.confidence==='decoded-frame'&&event.traceId===traceId);
        assert(decoded,'the product must observe a browser-decoded frame');
        assert(firstByte.sequence<decoded.sequence,'the decoded frame must follow the held Range first byte');
        const completedStages=proof.stages.filter(event=>event.stage==='body-complete');
        const initialFirstByte=proof.stages.find(event=>event.stage==='first-byte'
          &&event.traceId===traceId&&event.requestedRange===initial.range);
        const warmupFirstByte=proof.stages.find(event=>event.stage==='first-byte'
          &&event.traceId===traceId&&event.requestedRange===warmup.range);
        assert(initialFirstByte,'the bounded metadata Range must have first-byte evidence');
        assert(warmupFirstByte,'the bounded media warmup Range must have first-byte evidence');
        assert.equal(completedStages.length,2,'only the two bounded prefix Ranges may complete before proof');
        assert.deepEqual(new Set(completedStages.map(event=>event.requestId)),
          new Set([initialFirstByte.requestId,warmupFirstByte.requestId]));
        assert.equal(proof.stages.some(event=>event.stage==='body-complete'
          &&event.requestId===firstByte.requestId),false);
        assert.equal(proof.stages.some(event=>['first-byte-timeout','body-no-progress'].includes(event.stage)),false);
        assert(proof.frames.length>=2);
        for(let index=1;index<proof.frames.length;index++){
          assert(proof.frames[index].mediaTime>=proof.frames[index-1].mediaTime,'presented media time must be monotonic');
        }
        assert(new Set(proof.frames.map(frame=>frame.mediaTime)).size>=2,'presentation must advance across distinct frames');
        const twoSecondFrame=proof.frames.find(frame=>frame.mediaTime>=2);
        assert(twoSecondFrame&&twoSecondFrame.at>=firstByte.at,'two-second presentation must follow the held Range first byte');
        assert(proof.maxPresentedMediaTime>=2);
        assert(proof.currentTime>=2);
        assert(proof.readyState>=2);
        assert.equal(proof.playResult,'resolved');
        assert.equal(proof.mode,'original-range');
        assert.equal(proof.attempt,'range');
        assert.equal(proof.retryCount,0);
        assert.equal(proof.fullRequestCount,0);
        assert.equal(proof.bufferStorageMode,'');
        assert.equal(proof.hasTempStorage,false);
        assert.equal(proof.transportVerified,true);
        assert.equal(proof.rangeIntegrity,'valid');
        assert.equal(proof.previewHidden,true);
        assert.equal(proof.stages.some(event=>event.route==='full-original'),false);
        assert.equal(calls.some(call=>call.query.alt==='media'&&call.path.endsWith('/video-A')),false,
          'Playwright fulfillment must not bypass the production worker slow-tail fixture');

        await page.evaluate(()=>{globalThis.__driveOriginalQaFrameCaptureActive=false;closePlayer();});
        await page.waitForFunction(async()=>{
          const reply=await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE');
          return reply.state.streams.every(stream=>Boolean(stream.terminal));
        },null,{timeout:2000});
        const closed=await page.evaluate(async()=>({
          fixture:(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state,
          selected:state.selected,
          attempt:state.mediaAttempt
        }));
        const closedFront=closed.fixture.streams.find(stream=>stream.streamId===front.streamId);
        assert(closedFront,'the held continuation Range must remain identifiable during cleanup');
        assert.equal(closedFront.bodyComplete,false);
        assert(['cancelled','aborted'].includes(closedFront.terminal));
        assert.equal(closed.selected,null);
        assert.equal(closed.attempt,'idle');
        const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
        assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
        assert.equal(disposed.state.configured,false);
        configured=false;
        assert.deepEqual(errors,[]);
        record('faststart MP4 presents two seconds before whole-file Range completion',{
          initialRange:initial.range,
          warmupRange:warmup.range,
          range:front.range,
          deliveredBytes:front.deliveredBytes,
          responseLength:front.responseLength,
          maxPresentedMediaTime:proof.maxPresentedMediaTime,
          currentTime:proof.currentTime,
          readyState:proof.readyState
        });
      } finally {
        try {
          if(configured){
            await page.evaluate(()=>{globalThis.__driveOriginalQaFrameCaptureActive=false;if(!el.playerSheet.hidden)closePlayer();});
            const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
            assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
            assert.equal(disposed.state.configured,false);
          }
        } finally { await context.close(); }
      }
    });
    await check('same faststart MP4 settles 10/50/90 percent seeks and fences superseded work',async()=>{
      const {page,context,calls,errors}=await environment({
        disableOpfs:true,
        mediaBytes:faststartVideo.bytes,
        mediaMimeType:'video/mp4',
        mediaName:'faststart seek H.264 AAC.mp4',
        mediaMetadata:{width:320,height:180,durationMillis:'10000'}
      });
      let configured=false;
      try {
        const setup=await configureSlowTailFixture(page,{
          bytes:faststartVideo.bytes,
          mode:'faststart-chunked',
          mimeType:'video/mp4',
          initialChunkBytes:24*1024,
          warmupChunkBytes:faststartSeed.length,
          prefixBytes:96*1024
        });
        assert.equal(setup.supported,true,'QA-TR-03 requires requestVideoFrameCallback');
        configured=true;
        await page.evaluate(()=>{
          el.videoPlayer.muted=true;
          openPlayer(state.files.find(file=>file.id==='video-A'));
          void el.videoPlayer.play().catch(()=>{});
        });
        await page.waitForFunction(()=>el.videoPlayer.readyState>=2
          &&state.mediaTransportVerified&&state.mediaDecodeVerified
          &&el.videoPlayer.currentTime>.2,null,{timeout:10000});
        const baseline=await page.evaluate(()=>({
          duration:el.videoPlayer.duration,
          decodedVideoFrames:Number(el.videoPlayer.webkitDecodedFrameCount)||0,
          decodedAudioBytes:Number(el.videoPlayer.webkitAudioDecodedByteCount)||0,
          src:el.videoPlayer.currentSrc||el.videoPlayer.src,
          mediaSession:state.mediaSession,sourceGeneration:mediaSourceGeneration
        }));
        assert(Math.abs(baseline.duration-10)<.05,`unexpected seek fixture duration ${baseline.duration}`);
        assert(baseline.decodedVideoFrames>0,'Chrome must decode video before seek evidence begins');
        assert(baseline.decodedAudioBytes>0,'Chrome must decode AAC before seek evidence begins');
        const preSeekFixture=(await page.evaluate(()=>(
          globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')
        ))).state;
        const completedSeedStreams=preSeekFixture.streams
          .filter(stream=>stream.bodyComplete&&stream.terminal==='complete'
            &&stream.start<faststartVideo.trailingFreeStart)
          .sort((left,right)=>left.start-right.start);
        assert.equal(completedSeedStreams.length,2,
          'the immutable MP4 seed must be complete in exactly two bounded responses before seeking');
        let contiguousSeedEnd=-1;
        for(const stream of completedSeedStreams){
          assert.equal(stream.start,contiguousSeedEnd+1,'completed pre-seek seed bytes must be contiguous');
          contiguousSeedEnd=stream.end;
        }
        assert.equal(contiguousSeedEnd,faststartVideo.trailingFreeStart-1,
          'every immutable MP4 seed byte must arrive before seeking');
        const preSeekHeld=preSeekFixture.streams.filter(stream=>stream.waitingForRelease&&!stream.terminal);
        assert.equal(preSeekHeld.length,1,'exactly one trailing response may remain held before seeking');
        assert.equal(preSeekHeld[0].start,faststartVideo.trailingFreeStart);
        assert.equal(preSeekHeld[0].bodyComplete,false);
        assert.equal(preSeekFixture.streams.length,completedSeedStreams.length+preSeekHeld.length,
          'no additional media stream may be hidden before seeking');

        const runSeek=async(percent,{rapidFromPercent=null}={})=>{
          const issued=await page.evaluate(({percent,rapidFromPercent})=>{
            const video=el.videoPlayer;
            const target=video.duration*percent;
            let staleGeneration=null;
            let staleTarget=null;
            if(Number.isFinite(rapidFromPercent)){
              staleTarget=video.duration*rapidFromPercent;
              if(!setPlayerCurrentTime(video,staleTarget,'qa-tr-03-superseded')){
                throw new Error('Superseded seek was not assigned');
              }
              staleGeneration=mediaSeekGeneration;
            }
            if(!setPlayerCurrentTime(video,target,'qa-tr-03')){
              throw new Error('Target seek was not assigned');
            }
            return {percent,target,generation:mediaSeekGeneration,staleGeneration,staleTarget};
          },{percent,rapidFromPercent});
          assert(Number.isSafeInteger(issued.generation)&&issued.generation>0);
          if(issued.staleGeneration!=null)assert(issued.generation>issued.staleGeneration);
          await page.waitForFunction(({generation,target})=>{
            const completion=(globalThis.__driveOriginalQaMediaStages||[])
              .find(event=>event.stage==='seek-frame'&&event.seekGeneration===generation
                &&event.confidence==='decoded-frame');
            return Boolean(completion)
              &&Math.abs(Number(completion.presentedMediaTime)-target)<=Number(completion.tolerance)
              &&mediaSeekWatchdog===null&&!state.isSeeking&&el.videoPlayer.seeking===false;
          },issued,{timeout:5000});
          const proof=await page.evaluate(({generation,staleGeneration,target})=>{
            const stages=(globalThis.__driveOriginalQaMediaStages||[]).filter(event=>
              event.seekGeneration===generation||event.seekGeneration===staleGeneration
            ).map(event=>({
              stage:event.stage,sequence:event.sequence,traceId:event.traceId,
              seekGeneration:event.seekGeneration,currentTime:event.currentTime,
              targetTime:event.targetTime,presentedMediaTime:event.presentedMediaTime,
              tolerance:event.tolerance,confidence:event.confidence,terminal:event.terminal
            }));
            return {
              stages,target,currentTime:el.videoPlayer.currentTime,
              readyState:el.videoPlayer.readyState,error:el.videoPlayer.error?.code||0,
              settledGeneration:mediaSeekSettledGeneration,
              activeSeek:mediaSeekWatchdog!==null,isSeeking:state.isSeeking
            };
          },issued);
          const seeking=proof.stages.filter(event=>event.stage==='seeking'
            &&event.seekGeneration===issued.generation);
          const seeked=proof.stages.filter(event=>event.stage==='seeked'
            &&event.seekGeneration===issued.generation);
          const completed=proof.stages.filter(event=>event.stage==='seek-frame'
            &&event.seekGeneration===issued.generation);
          assert.equal(seeking.length,1);
          assert.equal(seeked.length,1);
          assert.equal(completed.length,1);
          assert(seeking[0].sequence<seeked[0].sequence&&seeked[0].sequence<completed[0].sequence);
          assert.equal(completed[0].confidence,'decoded-frame');
          assert(Math.abs(completed[0].targetTime-issued.target)<=.001);
          assert(Math.abs(completed[0].presentedMediaTime-issued.target)<=completed[0].tolerance);
          assert(Math.abs(proof.currentTime-issued.target)<=.5);
          assert(proof.readyState>=2);
          assert.equal(proof.error,0);
          assert(proof.settledGeneration>=issued.generation);
          assert.equal(proof.activeSeek,false);
          assert.equal(proof.isSeeking,false);
          assert.equal(proof.stages.some(event=>event.stage==='seek-no-progress'),false);
          if(issued.staleGeneration!=null){
            const staleTerminal=proof.stages.filter(event=>event.seekGeneration===issued.staleGeneration
              &&['seeked','seek-frame','seek-no-progress'].includes(event.stage));
            assert.deepEqual(staleTerminal,[],'superseded seek work must not emit a terminal stage');
          }
          return {issued,completion:completed[0],currentTime:proof.currentTime};
        };

        const seeks=[];
        seeks.push(await runSeek(.1));
        seeks.push(await runSeek(.5));
        seeks.push(await runSeek(.9,{rapidFromPercent:.25}));
        await page.waitForTimeout(250);

        const proof=await page.evaluate(async()=>{
          const fixture=(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state;
          const video=el.videoPlayer;
          let audioTracks=null;
          if(typeof video.captureStream==='function'){
            const stream=video.captureStream();
            audioTracks=stream.getAudioTracks().length;
            stream.getTracks().forEach(track=>track.stop());
          }
          return {
            fixture,audioTracks,
            stages:(globalThis.__driveOriginalQaMediaStages||[]).map(event=>({
              stage:event.stage,sequence:event.sequence,traceId:event.traceId,
              route:event.route,requestId:event.requestId,requestedRange:event.requestedRange,
              playbackMode:event.playbackMode,seekGeneration:event.seekGeneration,
              currentTime:event.currentTime,targetTime:event.targetTime,
              presentedMediaTime:event.presentedMediaTime,tolerance:event.tolerance,
              confidence:event.confidence,terminal:event.terminal
            })),
            decodedVideoFrames:Number(video.webkitDecodedFrameCount)||0,
            decodedAudioBytes:Number(video.webkitAudioDecodedByteCount)||0,
            src:video.currentSrc||video.src,
            mediaSession:state.mediaSession,sourceGeneration:mediaSourceGeneration,
            seekGeneration:mediaSeekGeneration,settledGeneration:mediaSeekSettledGeneration,
            activeSeek:mediaSeekWatchdog!==null,isSeeking:state.isSeeking,videoSeeking:video.seeking,
            mode:state.mediaPlaybackMode,attempt:state.mediaAttempt,
            retryCount:state.mediaRetryCount,fullRequestCount:state.mediaFullRequestCount,
            bufferStorageMode:state.mediaBufferStorageMode,
            hasTempStorage:Boolean(state.mediaTempStorage),previewHidden:el.drivePreview.hidden,
            seekNoProgress:(globalThis.__driveOriginalQaMediaStages||[])
              .filter(event=>event.stage==='seek-no-progress').length
          };
        });
        assert.equal(proof.src,baseline.src,'all targets must stay on the same exact-original source');
        assert.equal(proof.mediaSession,baseline.mediaSession,'all targets must stay in one media session');
        assert.equal(proof.sourceGeneration,baseline.sourceGeneration,
          'all targets must stay in one source generation');
        assert(proof.decodedVideoFrames>baseline.decodedVideoFrames);
        assert(proof.decodedAudioBytes>baseline.decodedAudioBytes);
        assert.equal(proof.audioTracks,1,'the decoded MP4 must expose one AAC audio track');
        assert.equal(proof.mode,'original-range');
        assert.equal(proof.attempt,'range');
        assert.equal(proof.retryCount,0);
        assert.equal(proof.fullRequestCount,0);
        assert.equal(proof.bufferStorageMode,'');
        assert.equal(proof.hasTempStorage,false);
        assert.equal(proof.previewHidden,true);
        assert.equal(proof.seekNoProgress,0);
        assert.equal(proof.activeSeek,false);
        assert.equal(proof.isSeeking,false);
        assert.equal(proof.videoSeeking,false);
        assert.equal(proof.seekGeneration,seeks.at(-1).issued.generation);
        assert(proof.settledGeneration>=proof.seekGeneration);
        const traceIds=[...new Set(proof.stages.map(event=>event.traceId).filter(Boolean))];
        assert.equal(traceIds.length,1,'all seek evidence must stay in one diagnostic trace');
        for(const seek of seeks){
          const generation=seek.issued.generation;
          const live=proof.stages.filter(event=>event.seekGeneration===generation);
          for(const stage of ['seeking','seek-watchdog-armed','seeked','seek-frame']){
            assert.equal(live.filter(event=>event.stage===stage).length,1,
              `seek generation ${generation} must emit exactly one ${stage}`);
          }
          assert.equal(live.some(event=>['seek-no-progress','seek-presentation-fallback'].includes(event.stage)),false);
        }
        const staleGeneration=seeks.at(-1).issued.staleGeneration;
        const stale=proof.stages.filter(event=>event.seekGeneration===staleGeneration);
        assert.equal(stale.filter(event=>event.stage==='seeking').length,1);
        assert.equal(stale.filter(event=>event.stage==='seek-watchdog-armed').length,1);
        assert.equal(stale.some(event=>['seeked','seek-frame','seek-no-progress','seek-presentation-fallback']
          .includes(event.stage)),false,'late superseded seek evidence must remain fenced after the grace period');
        assert(proof.fixture.streams.every(stream=>Boolean(stream.range)),
          'every fixture media request must be a Range request');
        assert.equal(calls.some(call=>call.query.alt==='media'&&call.path.endsWith('/video-A')),false,
          'Playwright fulfillment must not bypass the production worker seek fixture');
        const held=proof.fixture.streams.find(stream=>stream.waitingForRelease&&!stream.terminal);
        assert(held&&held.start===faststartVideo.trailingFreeStart&&!held.bodyComplete);
        const heldFirstBytes=proof.stages.filter(event=>event.stage==='first-byte'
          &&event.route==='range'&&event.traceId===traceIds[0]
          &&event.requestedRange===held.range);
        assert.equal(heldFirstBytes.length,1,'held continuation must cross the production worker exactly once');
        assert.equal(heldFirstBytes[0].playbackMode,'original-range');
        assert.equal(proof.stages.some(event=>event.stage==='body-complete'
          &&event.requestId===heldFirstBytes[0].requestId),false);
        assert.equal(proof.stages.some(event=>event.route==='full-original'),false);

        await page.evaluate(()=>closePlayer());
        await page.waitForFunction(async()=>{
          const reply=await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE');
          return reply.state.streams.every(stream=>Boolean(stream.terminal));
        },null,{timeout:2000});
        const closed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE'));
        const closedHeld=closed.state.streams.find(stream=>stream.streamId===held.streamId);
        assert(closedHeld&&!closedHeld.bodyComplete&&['cancelled','aborted'].includes(closedHeld.terminal));
        const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
        assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
        assert.equal(disposed.state.configured,false);
        configured=false;
        assert.deepEqual(errors,[]);
        record('same faststart MP4 settles 10/50/90 percent seeks and fences superseded work',{
          targets:seeks.map(item=>({percent:item.issued.percent,target:item.issued.target,
            presented:item.completion.presentedMediaTime,generation:item.issued.generation,
            staleGeneration:item.issued.staleGeneration})),
          decodedVideoFrames:proof.decodedVideoFrames,
          decodedAudioBytes:proof.decodedAudioBytes,
          audioTracks:proof.audioTracks
        });
      } finally {
        try {
          if(configured){
            await page.evaluate(()=>{if(!el.playerSheet.hidden)closePlayer();});
            const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
            assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
            assert.equal(disposed.state.configured,false);
          }
        } finally { await context.close(); }
      }
    });
    await check('uncached seek supersession fences a pending original Range from the final target',async()=>{
      const {page,context,calls,errors}=await environment({
        disableOpfs:true,
        mediaBytes:seekRangeSeed,
        mediaMimeType:'video/mp4',
        mediaName:'seek Range H.264 AAC.mp4',
        mediaMetadata:{width:640,height:360,durationMillis:'60000'}
      });
      let configured=false;
      const intervalCovered=(streams,start,end)=>{
        let cursor=start;
        for(const stream of streams
          .filter(item=>item.deliveredEnd!=null&&item.deliveredEnd>=start&&item.start<=end)
          .sort((left,right)=>left.start-right.start)){
          if(stream.start>cursor)break;
          cursor=Math.max(cursor,stream.deliveredEnd+1);
          if(cursor>end)return true;
        }
        return false;
      };
      const contiguousDeliveredEnd=(streams,start=0)=>{
        let cursor=start;
        for(const stream of streams
          .filter(item=>item.deliveredEnd!=null&&item.deliveredEnd>=start)
          .sort((left,right)=>left.start-right.start)){
          if(stream.start>cursor)break;
          cursor=Math.max(cursor,stream.deliveredEnd+1);
        }
        return cursor-1;
      };
      const fixtureState=()=>page.evaluate(async()=>(
        await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')
      ).state);
      const waitForFixture=async(predicate,label,timeoutMs=5000)=>{
        const deadline=Date.now()+timeoutMs;
        let latest=null;
        while(Date.now()<deadline){
          latest=await fixtureState();
          if(predicate(latest))return latest;
          await new Promise(resolve=>setTimeout(resolve,25));
        }
        throw new Error(`${label}: ${JSON.stringify(latest)}`);
      };
      const waitForFixtureQuiet=async(label,quietMs=500,timeoutMs=10000)=>{
        const deadline=Date.now()+timeoutMs;
        let latest=null;
        let lastCount=-1;
        let quietSince=Date.now();
        while(Date.now()<deadline){
          latest=await fixtureState();
          if(latest.streams.length!==lastCount){
            lastCount=latest.streams.length;
            quietSince=Date.now();
          }
          if(latest.streams.every(stream=>Boolean(stream.terminal))
            &&Date.now()-quietSince>=quietMs)return latest;
          await new Promise(resolve=>setTimeout(resolve,25));
        }
        throw new Error(`${label}: ${JSON.stringify(latest)}`);
      };
      const snapshot=()=>page.evaluate(async()=>{
        const fixture=(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state;
        const video=el.videoPlayer;
        let audioTracks=null;
        if(typeof video.captureStream==='function'){
          const stream=video.captureStream();
          audioTracks=stream.getAudioTracks().length;
          stream.getTracks().forEach(track=>track.stop());
        }
        return {
          fixture,audioTracks,
          stages:(globalThis.__driveOriginalQaMediaStages||[]).map(event=>({
            stage:event.stage,sequence:event.sequence,traceId:event.traceId,
            route:event.route,requestId:event.requestId,requestedRange:event.requestedRange,
            playbackMode:event.playbackMode,seekGeneration:event.seekGeneration,
            currentTime:event.currentTime,targetTime:event.targetTime,
            presentedMediaTime:event.presentedMediaTime,tolerance:event.tolerance,
            confidence:event.confidence,terminal:event.terminal
          })),
          duration:video.duration,currentTime:video.currentTime,
          readyState:video.readyState,error:video.error?.code||0,
          decodedVideoFrames:Number(video.webkitDecodedFrameCount)||0,
          decodedAudioBytes:Number(video.webkitAudioDecodedByteCount)||0,
          src:video.currentSrc||video.src,
          mediaSession:state.mediaSession,sourceGeneration:mediaSourceGeneration,
          seekGeneration:mediaSeekGeneration,settledGeneration:mediaSeekSettledGeneration,
          activeSeek:mediaSeekWatchdog!==null,isSeeking:state.isSeeking,videoSeeking:video.seeking,
          mode:state.mediaPlaybackMode,attempt:state.mediaAttempt,
          retryCount:state.mediaRetryCount,fullRequestCount:state.mediaFullRequestCount,
          bufferStorageMode:state.mediaBufferStorageMode,
          hasTempStorage:Boolean(state.mediaTempStorage),previewHidden:el.drivePreview.hidden
        };
      });
      try {
        const setup=await configureSlowTailFixture(page,{
          bytes:seekRangeSeed,
          mode:'seek-range-race',
          mimeType:'video/mp4',
          prefixBytes:64,
          ...seekRangeLayout
        });
        assert.equal(setup.supported,true,'QA-TR-03 transport requires requestVideoFrameCallback');
        configured=true;
        await page.evaluate(()=>{
          const video=el.videoPlayer;
          video.muted=true;
          openPlayer(state.files.find(file=>file.id==='video-A'));
          state.pendingPlay=false;
          video.pause();
        });
        try {
          await page.waitForFunction(()=>el.videoPlayer.readyState>=1
            &&state.mediaTransportVerified,null,{timeout:10000});
        } catch (error) {
          const diagnostic=await snapshot();
          throw new Error(`paused seek baseline did not load: ${JSON.stringify(diagnostic)}`,
            {cause:error});
        }
        await page.evaluate(()=>el.videoPlayer.pause());
        await waitForFixtureQuiet('paused metadata preload did not reach a quiet boundary');
        const baseline=await snapshot();
        assert(Math.abs(baseline.duration-60)<.05,
          `unexpected seek transport fixture duration ${baseline.duration}`);
        const initial=baseline.fixture.streams.find(stream=>stream.role==='initial');
        assert(initial,'baseline must include the initial bounded response');
        assert(initial&&initial.start===0&&initial.end===seekRangeLayout.baselineEnd);
        assert.equal(initial.bodyComplete,true);
        assert.equal(initial.terminal,'complete');
        assert(baseline.fixture.streams.every(stream=>Boolean(stream.terminal)));
        assert(baseline.fixture.streams.every(stream=>['initial','speculative'].includes(stream.role)));
        const baselineDeliveredEnd=contiguousDeliveredEnd(baseline.fixture.streams);
        assert(baselineDeliveredEnd>=seekRangeLayout.baselineEnd);
        assert(baselineDeliveredEnd<seekRangeLayout.seekAStart,
          'paused preload must stop before the A target GOP');
        assert.equal(intervalCovered(baseline.fixture.streams,seekRangeLayout.seekAStart,seekRangeLayout.seekAEnd),false,
          'A target bytes were already delivered before seek A; transport race is not discriminating');
        assert.equal(intervalCovered(baseline.fixture.streams,seekRangeLayout.seekBStart,seekRangeLayout.seekBEnd),false,
          'B target bytes were already delivered before seek A; transport race is not discriminating');

        const armedA=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest(
          'DRIVE_ORIGINAL_QA_SLOW_TAIL_ARM_SEEK',{label:'A'}));
        assert.equal(armedA.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_SEEK_ARMED');
        assert.equal(armedA.state.phase,'A');
        await page.waitForTimeout(500);
        const noSeekControl=await snapshot();
        assert.equal(noSeekControl.fixture.phase,'A');
        assert.equal(noSeekControl.fixture.streams.length,baseline.fixture.streams.length,
          'arming seek A without a native currentTime change must not create a Range');
        assert(noSeekControl.fixture.streams.every(stream=>Boolean(stream.terminal)));
        assert.equal(noSeekControl.seekGeneration,baseline.seekGeneration);
        assert(Math.abs(noSeekControl.currentTime-baseline.currentTime)<.001);
        assert.equal(noSeekControl.stages.filter(event=>event.stage==='seeking').length,0);
        const seekA=await page.evaluate(()=>{
          const video=el.videoPlayer;
          if(!setPlayerCurrentTime(video,30,'qa-tr-03-transport-a'))throw new Error('seek A was not assigned');
          void video.play().catch(()=>{});
          return {generation:mediaSeekGeneration,target:30};
        });
        await waitForFixture(state=>state.streams.some(stream=>stream.role==='seek-A'
          &&stream.waitingForRelease&&!stream.terminal),
        'seek A did not cause an attributable uncached Range');
        const pendingA=await snapshot();
        const aStreams=pendingA.fixture.streams.filter(stream=>stream.role==='seek-A');
        assert(aStreams.length>=1,
          `seek A did not cause an attributable uncached Range: ${JSON.stringify(pendingA.fixture)}`);
        assert(aStreams.some(stream=>stream.waitingForRelease&&!stream.terminal));
        assert(aStreams.some(stream=>stream.start>baselineDeliveredEnd+1
          &&stream.start<=seekRangeLayout.seekAStart&&stream.end>=seekRangeLayout.seekAStart),
        'seek A must open a non-contiguous target Range beyond paused sequential preload');
        assert.equal(intervalCovered(aStreams,seekRangeLayout.seekAStart,seekRangeLayout.seekAEnd),false);
        assert.equal(pendingA.stages.some(event=>event.seekGeneration===seekA.generation
          &&['seeked','seek-frame','seek-no-progress','seek-presentation-fallback'].includes(event.stage)),false,
          'seek A must still be pending before supersession');

        const armedB=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest(
          'DRIVE_ORIGINAL_QA_SLOW_TAIL_ARM_SEEK',{label:'B'}));
        assert.equal(armedB.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_SEEK_ARMED');
        assert.equal(armedB.state.phase,'B');
        const seekB=await page.evaluate(()=>{
          const video=el.videoPlayer;
          if(!setPlayerCurrentTime(video,54,'qa-tr-03-transport-b'))throw new Error('seek B was not assigned');
          void video.play().catch(()=>{});
          return {generation:mediaSeekGeneration,target:54};
        });
        assert(seekB.generation>seekA.generation);
        await page.waitForTimeout(250);
        const supersededTransport=await fixtureState();
        assert.equal(supersededTransport.phase,'B');
        const aAtSupersession=supersededTransport.streams.filter(stream=>stream.role==='seek-A');
        assert(aAtSupersession.length>=1);
        assert(aAtSupersession.some(stream=>stream.waitingForRelease&&!stream.terminal)
          ||aAtSupersession.some(stream=>['cancelled','aborted'].includes(stream.terminal)),
        'seek A must still be pending or observably cancelled after seek B supersedes it');
        for(const stream of aAtSupersession.filter(item=>item.waitingForRelease&&!item.terminal)){
          const released=await page.evaluate(streamId=>globalThis.__driveOriginalQaSlowTailRequest(
            'DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASE_STREAM',{streamId,late:true}),stream.streamId);
          assert.equal(released.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_STREAM_RELEASED');
        }
        try {
          await page.waitForFunction(({generation,target})=>{
            const completion=(globalThis.__driveOriginalQaMediaStages||[])
              .find(event=>event.stage==='seek-frame'&&event.seekGeneration===generation
                &&event.confidence==='decoded-frame');
            return Boolean(completion)
              &&Math.abs(Number(completion.presentedMediaTime)-target)<=Number(completion.tolerance)
              &&mediaSeekWatchdog===null&&!state.isSeeking&&el.videoPlayer.seeking===false;
          },seekB,{timeout:10000});
        } catch (error) {
          const diagnostic=await snapshot();
          throw new Error(`seek B did not settle after superseding/releasing A: ${JSON.stringify(diagnostic)}`,
            {cause:error});
        }
        await page.evaluate(()=>el.videoPlayer.pause());
        const beforeLateRelease=await snapshot();
        const bStreams=beforeLateRelease.fixture.streams.filter(stream=>stream.role==='seek-B');
        assert(bStreams.length>=1,'seek B must cause a Range overlapping uncached target bytes');
        assert(bStreams.some(stream=>stream.start>seekRangeLayout.seekAEnd+1
          &&stream.start<=seekRangeLayout.seekBStart&&stream.end>=seekRangeLayout.seekBEnd),
        'seek B must open a non-contiguous Range covering its later target GOP');
        assert.equal(intervalCovered(bStreams,seekRangeLayout.seekBStart,seekRangeLayout.seekBEnd),true,
          'completed seek B transport must cover the target GOP');
        const bStages=beforeLateRelease.stages.filter(event=>event.seekGeneration===seekB.generation);
        for(const stage of ['seeking','seek-watchdog-armed','seeked','seek-frame']){
          assert.equal(bStages.filter(event=>event.stage===stage).length,1,
            `seek B must emit exactly one ${stage}`);
        }
        assert.equal(bStages.some(event=>['seek-no-progress','seek-presentation-fallback'].includes(event.stage)),false);
        const completion=bStages.find(event=>event.stage==='seek-frame');
        assert.equal(completion.confidence,'decoded-frame');
        assert(Math.abs(completion.presentedMediaTime-seekB.target)<=completion.tolerance);
        assert(Math.abs(beforeLateRelease.currentTime-seekB.target)<=.5);
        assert.equal(beforeLateRelease.activeSeek,false);
        assert.equal(beforeLateRelease.isSeeking,false);
        assert.equal(beforeLateRelease.videoSeeking,false);
        assert(beforeLateRelease.settledGeneration>=seekB.generation);

        const aBeforeRelease=beforeLateRelease.fixture.streams.filter(stream=>stream.role==='seek-A');
        assert(aBeforeRelease.length>=1);
        assert(aBeforeRelease.every(stream=>stream.terminal==null||stream.terminal==='complete'
          ||['cancelled','aborted'].includes(stream.terminal)));
        for(const stream of aBeforeRelease){
          if(['cancelled','aborted'].includes(stream.terminal)){
            assert(stream.abortSignalSeen||stream.consumerCancelSeen,
              'a cancelled seek-A stream must identify the observed cancellation boundary');
          }
          if(stream.lateReleaseAttempted)continue;
          const released=await page.evaluate(streamId=>globalThis.__driveOriginalQaSlowTailRequest(
            'DRIVE_ORIGINAL_QA_SLOW_TAIL_RELEASE_STREAM',{streamId,late:true}),stream.streamId);
          assert.equal(released.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_STREAM_RELEASED');
        }
        await page.waitForTimeout(500);
        const final=await snapshot();
        const finalA=final.fixture.streams.filter(stream=>stream.role==='seek-A');
        assert.equal(finalA.length,aBeforeRelease.length);
        assert(finalA.every(stream=>stream.lateReleaseAttempted));
        assert(finalA.every(stream=>stream.terminal==='complete'
          ||['cancelled','aborted'].includes(stream.terminal)));
        for(const stream of finalA){
          if(stream.terminal==='complete')assert.equal(stream.lateReleaseOutcome,'released');
          else {
            assert.equal(stream.lateReleaseOutcome,`ignored-${stream.terminal}`);
            assert(stream.abortSignalSeen||stream.consumerCancelSeen);
          }
        }
        assert.equal(final.stages.some(event=>event.seekGeneration===seekA.generation
          &&['seeked','seek-frame','seek-no-progress','seek-presentation-fallback'].includes(event.stage)),false,
          'late seek-A bytes must not mutate app state after seek B settles');
        assert(Math.abs(final.currentTime-seekB.target)<=.5);
        assert.equal(final.seekGeneration,seekB.generation);
        assert(final.settledGeneration>=seekB.generation);
        assert.equal(final.activeSeek,false);
        assert.equal(final.isSeeking,false);
        assert.equal(final.videoSeeking,false);
        assert.equal(final.src,baseline.src);
        assert.equal(final.mediaSession,baseline.mediaSession);
        assert.equal(final.sourceGeneration,baseline.sourceGeneration);
        assert(final.decodedVideoFrames>baseline.decodedVideoFrames);
        assert(final.decodedAudioBytes>baseline.decodedAudioBytes);
        assert.equal(final.audioTracks,1);
        assert.equal(final.error,0);
        assert.equal(final.mode,'original-range');
        assert.equal(final.attempt,'range');
        assert.equal(final.retryCount,0);
        assert.equal(final.fullRequestCount,0);
        assert.equal(final.bufferStorageMode,'');
        assert.equal(final.hasTempStorage,false);
        assert.equal(final.previewHidden,true);
        assert(final.fixture.streams.every(stream=>Boolean(stream.range)));
        const traceIds=[...new Set(final.stages.map(event=>event.traceId).filter(Boolean))];
        assert.equal(traceIds.length,1);
        const bSeeking=final.stages.find(event=>event.stage==='seeking'
          &&event.seekGeneration===seekB.generation);
        assert(bSeeking);
        for(const role of ['seek-A','seek-B']){
          const streams=final.fixture.streams.filter(stream=>stream.role===role);
          assert(streams.some(stream=>final.stages.some(event=>event.stage==='first-byte'
            &&event.route==='range'&&event.traceId===traceIds[0]
            &&event.requestedRange===stream.range)),`${role} must cross the production worker`);
        }
        for(const stream of finalA){
          const firstByte=final.stages.find(event=>event.stage==='first-byte'
            &&event.route==='range'&&event.traceId===traceIds[0]
            &&event.requestedRange===stream.range);
          assert(firstByte,`seek-A ${stream.range} must have a correlated first byte`);
          const terminalStage=final.stages.find(event=>event.requestId===firstByte.requestId
            &&event.stage===(stream.terminal==='complete'?'body-complete':'request-cancelled'));
          assert(terminalStage,`seek-A ${stream.range} must have a correlated terminal stage`);
          assert(bSeeking.sequence<terminalStage.sequence,
            'seek-A transport must terminate only after seek B owns the app generation');
        }
        assert.equal(final.stages.some(event=>event.route==='full-original'),false);
        assert.equal(calls.some(call=>call.query.alt==='media'&&call.path.endsWith('/video-A')),false,
          'Playwright fulfillment must not bypass the production worker seek-race fixture');

        await page.evaluate(()=>closePlayer());
        await waitForFixture(state=>state.streams.every(stream=>Boolean(stream.terminal)),
          'closing the player must terminate every seek-race stream',2000);
        const closed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest(
          'DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE'));
        assert(closed.state.streams.every(stream=>Boolean(stream.terminal)));
        const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest(
          'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
        assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
        assert.equal(disposed.state.configured,false);
        configured=false;
        assert.deepEqual(errors,[]);
        record('uncached seek supersession fences a pending original Range from the final target',{
          baseline:{streamCount:baseline.fixture.streams.length,deliveredEnd:baselineDeliveredEnd,
            noSeekControlMs:500},
          seekA:{generation:seekA.generation,
            pendingAfterGrace:aAtSupersession.filter(stream=>stream.waitingForRelease&&!stream.terminal).length,
            cancelledAfterGrace:aAtSupersession.filter(stream=>['cancelled','aborted'].includes(stream.terminal)).length,
            streams:finalA.map(stream=>({
            range:stream.range,terminal:stream.terminal,abortSignalSeen:stream.abortSignalSeen,
            consumerCancelSeen:stream.consumerCancelSeen,lateReleaseOutcome:stream.lateReleaseOutcome
          }))},
          seekB:{generation:seekB.generation,target:seekB.target,presented:completion.presentedMediaTime,
            streams:bStreams.map(stream=>stream.range)},
          decodedVideoFrames:final.decodedVideoFrames,
          decodedAudioBytes:final.decodedAudioBytes,
          audioTracks:final.audioTracks
        });
      } finally {
        try {
          if(configured){
            await page.evaluate(()=>{if(!el.playerSheet.hidden)closePlayer();});
            const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest(
              'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
            assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
            assert.equal(disposed.state.configured,false);
          }
        } finally { await context.close(); }
      }
    });
    await check('2/4 GiB sparse Range crosses the production service worker without allocation',async()=>{
      const {page,context,calls,errors}=await environment();
      let configured=false;
      const logicalTotalBytes=4294967297;
      const cases=[
        {name:'2 GiB',range:'bytes=2147483648-2147483648'},
        {name:'4 GiB',range:'bytes=4294967296-4294967296'}
      ];
      const invalidRange='bytes=4294967296-4294967295';
      try {
        const setup=await configureSlowTailFixture(page,{
          bytes:Buffer.from([0x5a]),
          mode:'sparse-offset',
          mimeType:'application/octet-stream',
          prefixBytes:1,
          logicalTotalBytes
        });
        assert.equal(setup.supported,true);
        configured=true;
        const proof=await page.evaluate(async ({ logicalTotalBytes, cases, invalidRange })=>{
          const workerMessages=[];
          const onWorkerMessage=(event)=>{
            const data=event.data||{};
            if(!['MEDIA_PROXY_STATUS','MEDIA_PROXY_ERROR','MEDIA_TRACE_EVENT'].includes(data.type))return;
            workerMessages.push({
              type:data.type,
              traceId:data.traceId||null,
              requestId:data.requestId||null,
              status:Number(data.status)||0,
              category:data.category||null,
              driveReason:data.driveReason||null,
              requestedRange:data.requestedRange||null,
              contentRange:data.contentRange||null,
              contentRangeInferred:data.contentRangeInferred===true,
              rangeSatisfied:data.rangeSatisfied===true,
              playbackMode:data.playbackMode||null,
              stage:data.stage||null,
              reason:data.reason||null,
              bytes:Number(data.bytes)||0,
              totalBytes:Number(data.totalBytes)||0,
              terminal:data.terminal===true
            });
          };
          navigator.serviceWorker.addEventListener('message',onWorkerMessage);
          const file={
            id:'video-A',mimeType:'video/mp4',size:String(logicalTotalBytes),resourceKey:'fixture-key'
          };
          const request=async(testCase,index)=>{
            const traceId=`qa-sparse-${index+1}`;
            const url=new URL(buildMediaUrl(file));
            url.searchParams.set('_trace',traceId);
            const response=await fetch(url,{headers:{Range:testCase.range},cache:'no-store'});
            const body=[...new Uint8Array(await response.arrayBuffer())];
            return {
              ...testCase,traceId,status:response.status,body,
              contentRange:response.headers.get('Content-Range'),
              contentLength:response.headers.get('Content-Length'),
              acceptRanges:response.headers.get('Accept-Ranges')
            };
          };
          try {
            const responses=[];
            for(let index=0;index<cases.length;index++)responses.push(await request(cases[index],index));
            const invalidUrl=new URL(buildMediaUrl(file));
            invalidUrl.searchParams.set('_trace','qa-sparse-invalid');
            const invalidResponse=await fetch(invalidUrl,{headers:{Range:invalidRange},cache:'no-store'});
            const invalidBody=await invalidResponse.text();
            const deadline=Date.now()+2000;
            while(Date.now()<deadline){
              const statuses=workerMessages.filter(message=>message.type==='MEDIA_PROXY_STATUS'
                &&cases.some(item=>item.range===message.requestedRange));
              const completions=workerMessages.filter(message=>message.type==='MEDIA_TRACE_EVENT'
                &&message.stage==='body-complete'&&/^qa-sparse-[12]$/.test(message.traceId||''));
              const invalidError=workerMessages.some(message=>message.type==='MEDIA_PROXY_ERROR'
                &&message.requestedRange===invalidRange&&message.status===400);
              const invalidTrace=workerMessages.some(message=>message.type==='MEDIA_TRACE_EVENT'
                &&message.traceId==='qa-sparse-invalid'&&message.stage==='range-error');
              if(statuses.length===cases.length&&completions.length===cases.length&&invalidError&&invalidTrace)break;
              await new Promise(resolve=>setTimeout(resolve,10));
            }
            const fixture=(await globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_STATE')).state;
            return {
              responses,
              invalid:{status:invalidResponse.status,body:invalidBody},
              fixture,
              workerMessages,
              appState:{
                fullRequestCount:state.mediaFullRequestCount,
                bufferStorageMode:state.mediaBufferStorageMode,
                hasTempStorage:Boolean(state.mediaTempStorage),
                selectedId:state.selected?.id||null
              }
            };
          } finally {
            navigator.serviceWorker.removeEventListener('message',onWorkerMessage);
          }
        },{logicalTotalBytes,cases,invalidRange});

        assert.equal(proof.responses.length,cases.length);
        for(const response of proof.responses){
          assert.equal(response.status,206,response.name);
          const match=response.range.match(/^bytes=(\d+)-(\d+)$/);
          assert(match,response.name);
          const offset=Number(match[1]);
          assert.equal(response.contentRange,`bytes ${offset}-${offset}/${logicalTotalBytes}`,response.name);
          assert.equal(response.contentLength,'1',response.name);
          assert.equal(response.acceptRanges,'bytes',response.name);
          assert.deepEqual(response.body,[0x5a],response.name);
          const stream=proof.fixture.streams.find(item=>item.range===response.range);
          assert(stream,response.name);
          assert.equal(stream.start,offset,response.name);
          assert.equal(stream.end,offset,response.name);
          assert.equal(stream.responseLength,1,response.name);
          assert.equal(stream.deliveredBytes,1,response.name);
          assert.equal(stream.bodyComplete,true,response.name);
          assert.equal(stream.terminal,'complete',response.name);
          const status=proof.workerMessages.find(message=>message.type==='MEDIA_PROXY_STATUS'
            &&message.requestedRange===response.range);
          assert(status,response.name);
          assert.equal(status.status,206,response.name);
          assert.equal(status.contentRange,response.contentRange,response.name);
          assert.equal(status.contentRangeInferred,false,response.name);
          assert.equal(status.rangeSatisfied,true,response.name);
          assert.equal(status.playbackMode,'original-range',response.name);
          const firstByte=proof.workerMessages.find(message=>message.type==='MEDIA_TRACE_EVENT'
            &&message.traceId===response.traceId&&message.stage==='first-byte');
          const complete=proof.workerMessages.find(message=>message.type==='MEDIA_TRACE_EVENT'
            &&message.traceId===response.traceId&&message.stage==='body-complete');
          assert(firstByte&&complete,response.name);
          assert.equal(firstByte.requestedRange,response.range,response.name);
          assert.equal(firstByte.rangeSatisfied,true,response.name);
          assert.equal(firstByte.bytes,1,response.name);
          assert.equal(firstByte.totalBytes,1,response.name);
          assert.equal(complete.requestId,firstByte.requestId,response.name);
          assert.equal(complete.bytes,1,response.name);
          assert.equal(complete.totalBytes,1,response.name);
        }
        assert.equal(proof.fixture.mode,'sparse-offset');
        assert.equal(proof.fixture.byteLength,1);
        assert.equal(proof.fixture.logicalTotalBytes,logicalTotalBytes);
        assert.equal(proof.invalid.status,400);
        assert.equal(proof.fixture.streams.length,cases.length,'invalid Range must not reach the fixture');
        const invalidError=proof.workerMessages.find(message=>message.type==='MEDIA_PROXY_ERROR'
          &&message.requestedRange===invalidRange);
        assert(invalidError);
        assert.equal(invalidError.status,400);
        assert.equal(invalidError.category,'range-invalid');
        assert.equal(invalidError.driveReason,'rangeInvalid');
        const invalidTrace=proof.workerMessages.filter(message=>message.type==='MEDIA_TRACE_EVENT'
          &&message.traceId==='qa-sparse-invalid');
        assert.deepEqual(invalidTrace.map(message=>message.stage),['range-error']);
        assert.equal(invalidTrace[0].status,400);
        assert.equal(invalidTrace[0].reason,'range-invalid');
        assert.equal(invalidTrace[0].terminal,true);
        assert.equal(proof.appState.fullRequestCount,0);
        assert.equal(proof.appState.bufferStorageMode,'');
        assert.equal(proof.appState.hasTempStorage,false);
        assert.equal(proof.appState.selectedId,null);
        assert.equal(calls.some(call=>call.query.alt==='media'&&call.path.endsWith('/video-A')),false,
          'Playwright fulfillment must not bypass the production worker sparse fixture');
        assert.deepEqual(errors,[]);

        const disposed=await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));
        assert.equal(disposed.type,'DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSED');
        assert.equal(disposed.state.configured,false);
        assert(disposed.state.streams.every(stream=>stream.terminal==='complete'));
        configured=false;
        record('2/4 GiB sparse Range crosses the production service worker without allocation',{
          logicalTotalBytes,
          ranges:proof.responses.map(response=>({range:response.range,contentRange:response.contentRange,bytes:response.body.length})),
          invalidStatus:proof.invalid.status,
          fixtureBytes:proof.fixture.byteLength
        });
      } finally {
        if(configured){
          try{await page.evaluate(()=>globalThis.__driveOriginalQaSlowTailRequest?.('DRIVE_ORIGINAL_QA_SLOW_TAIL_DISPOSE'));}catch(_){}
        }
        await context.close();
      }
    });
    await check('Range recovery OPFS, playback, keyboard, active-tab lease and scoped cleanup',async()=>{
      const {page,context,calls,errors}=await environment({rangeFault:'invalid'});
      try {
        await openVideo(page);
        const mode=await page.evaluate(()=>state.mediaPlaybackMode);assert.equal(mode,'original-opfs');
        assert.equal(await exactBufferedBytes(page),hash(video));
        assert.equal(await page.locator('video').count(),1);
        // Controls are deliberately inert while hidden. Enter them through
        // the real keyboard reveal path rather than focusing invisible DOM.
        await page.keyboard.press('Tab');
        await page.locator('#seekBarContainer').focus();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'seekBarContainer','explicit keyboard reveal must make the seekbar focusable');
        await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
        const seek=await page.evaluate(()=>({time:el.videoPlayer.currentTime,duration:el.videoPlayer.duration,
          active:document.activeElement.id,idle:el.playerModal.classList.contains('controls-idle'),inert:playerChrome.inert,paused:el.videoPlayer.paused}));
        assert(Math.abs(seek.time-Math.min(5,seek.duration))<.15,JSON.stringify(seek));
        await page.evaluate(()=>{el.videoPlayer.currentTime=.5;});
        await page.locator('#ctrlPlayPause').focus();const paused=await page.evaluate(()=>el.videoPlayer.paused);await page.keyboard.press('Space');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>el.videoPlayer.paused),!paused);await page.evaluate(()=>el.videoPlayer.pause());
        await page.keyboard.press('Control+f');assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),false);
        await page.screenshot({path:path.join(out,'opfs-player.png')});
        await page.evaluate(()=>{window.fixtureTemp=state.mediaTempStorage;});
        const second=await context.newPage();await second.goto(base);await second.waitForFunction(()=>typeof cleanupStaleOriginalBuffers==='function');await second.evaluate(()=>cleanupStaleOriginalBuffers());
        assert.equal(await page.evaluate(async()=>Boolean(await fixtureTemp.directory.getFileHandle(fixtureTemp.name))),true);
        await second.close();await page.evaluate(()=>closePlayer());await page.waitForTimeout(200);
        assert.equal(await page.evaluate(async()=>{try{await fixtureTemp.directory.getFileHandle(fixtureTemp.name);return false;}catch(e){return e.name==='NotFoundError';}}),true);
        const media=calls.filter(c=>c.query.alt==='media'&&!c.path.includes('state'));
        assert(media.some(c=>c.range));assert(media.some(c=>!c.range));
        assert.deepEqual(errors,[]);record('Range recovery OPFS, playback, keyboard, active-tab lease and scoped cleanup',{mode,sha256:hash(video),requests:media.length});
      } finally{await context.close();}
    });
    for(const fault of [null,'401-once','invalid']) await check(`Range transport ${fault||'valid'}`,async()=>{
      const {page,context,calls,errors}=await environment({disableOpfs:true,rangeFault:fault});
      try{
        await openVideo(page);const mode=await page.evaluate(()=>state.mediaPlaybackMode);
        if(fault==='invalid'){assert.equal(mode,'original-memory');assert.equal(await exactBufferedBytes(page),hash(video));}
        else assert.equal(mode,'original-range');
        const media=calls.filter(c=>c.query.alt==='media'&&!c.path.includes('state'));
        assert(media.some(c=>c.sw&&c.range));
        if(fault==='401-once'){assert.equal(media[0].range,media[1].range);assert.equal(media[0].resourceKey,media[1].resourceKey);assert.notEqual(media[0].authorization,media[1].authorization);}
        assert.equal(await page.evaluate(()=>el.drivePreview.hidden),true);assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(out,`range-${fault||'valid'}.png`)});record(`Range transport ${fault||'valid'}`,{mode,mediaRequests:media.length});
      }finally{await context.close();}
    });
    await check('favorite cross-folder selection and partial bulk failure',async()=>{
      const {page,context,calls,errors}=await environment({bulkFault:'video-B'});
      try{
        await page.locator('[data-filter="favorites"]').click();await page.waitForFunction(()=>!state.loadingFavorites&&state.favoriteFiles.length===1);
        await page.locator('#selectionModeButton').click();await page.locator('#selectionSelectAllBtn').click();
        assert.deepEqual(await page.evaluate(()=>getActionFiles().map(f=>f.id)),['video-outside']);
        await page.locator('#selectionCancelBtn').click();await page.locator('[data-filter="all"]').click();
        await page.evaluate(()=>{enterSelectionMode();['video-A','video-B','video-C'].forEach(id=>state.selectedFileIds.add(id));updateSelectionUI();});
        await page.locator('#selectionDeleteBtn').click();await page.locator('#deleteConfirmButton').click();await page.waitForFunction(()=>!state.bulkAction);
        assert.deepEqual(await page.evaluate(()=>[...state.selectedFileIds]),['video-B']);
        assert.deepEqual(calls.filter(c=>c.method==='PATCH'&&!c.path.includes('/upload/')).map(c=>c.path.split('/').pop()).sort(),['video-A','video-B','video-C']);
        assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'bulk-partial.png')});record('favorite cross-folder selection and partial bulk failure');
      }finally{await context.close();}
    });
    await check('mobile video, overflow actions, seek and double-tap',async()=>{
      const {page,context,errors}=await environment({mobile:true});
      try{
        await openVideo(page);await page.touchscreen.tap(195,838);
        await page.locator('#shortsMoreBtn').click();await page.waitForTimeout(250);
        await page.screenshot({path:path.join(out,'mobile-video-menu.png')});
        const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        fs.writeFileSync(path.join(out,'mobile-video-axe.json'),JSON.stringify(axe.violations,null,2));assert.equal(axe.violations.length,0);
        const rects=await page.locator('#shortsExpandRow button:visible').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height})));assert(rects.every(r=>r.height>=44&&r.top>=0&&r.bottom<=844));
        await page.locator('#shortsMoreBtn').click();
        await page.locator('#mobileShortsProgressTrack').focus();await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>el.videoPlayer.currentTime),0);
        await page.evaluate(()=>{el.mobileShortsProgressTrack.blur();});
        const before=await page.evaluate(()=>isFavoriteFileId(state.selected.id));
        await page.touchscreen.tap(195,360);await page.waitForTimeout(90);await page.touchscreen.tap(195,360);await page.waitForTimeout(360);
        assert.equal(await page.evaluate(()=>isFavoriteFileId(state.selected.id)),!before);
        assert.deepEqual(errors,[]);record('mobile video, overflow actions, seek and double-tap',{axeViolations:0,menuActions:rects.length});
      }finally{await context.close();}
    });
    await check('7384-item desktop/mobile virtualization and stable sort reuse',async()=>{
      const {page,context,errors}=await environment();
      try{
        await page.evaluate(poster=>{
          state.files=Array.from({length:7384},(_,i)=>({id:`scale-${String(i).padStart(5,'0')}`,name:`사진 ${String(i).padStart(5,'0')}.png`,mimeType:'image/png',size:'1234',thumbnailLink:poster}));
          state.folders=[];state.filter='all';state.query='';state.sort='name';state.populationComplete=true;state.nextPageToken=null;
          renderFiles({resetWindow:true});
        },poster);
        const measurements=[];
        for(const [width,height] of [[1280,800],[390,844],[320,568],[844,390]]){
          await page.setViewportSize({width,height});
          await page.evaluate(()=>{state.renderWindowStart=0;renderFiles();window.scrollTo(0,0);});
          await page.waitForTimeout(350);
          for(let i=0;i<4;i++){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);}
          const geometry=await page.evaluate(()=>({count:document.querySelectorAll('.file-card').length,columns:getGridColumnCount(),height:state.renderRowHeight,last:document.querySelector('.file-card:last-child')?.dataset.fileId,overflow:document.documentElement.scrollWidth>innerWidth}));
          assert(geometry.count<=240);assert.equal(geometry.last,'scale-07383');assert.equal(geometry.overflow,false);
          const cached=await page.evaluate(()=>{const data=filteredAndSortedFiles();const start=performance.now();for(let i=0;i<1000;i++){if(filteredAndSortedFiles()!==data)throw new Error('cache not reused');}return performance.now()-start;});
          measurements.push({width,...geometry,cached1000ReadsMs:cached});
          await page.screenshot({path:path.join(out,`scale-${width}.png`)});
        }
        assert.deepEqual(errors,[]);record('7384-item desktop/mobile virtualization and stable sort reuse',{measurements});
      }finally{await context.close();}
    });
    await check('offline first reload uses versioned shell; cache reset preserves sibling app',async()=>{
      const {page,context,errors}=await environment();
      try{
        await page.evaluate(async()=>{await navigator.serviceWorker.register('/sibling/sw.js',{scope:'/sibling/'});await caches.open('sibling-private-cache');});
        await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof APP_VERSION==='string' && typeof closePlayer==='function');
        assert.equal(await page.locator('#brandButton').count(),1);
        await context.setOffline(false);await page.evaluate(()=>clearAppShellStorage());
        const rest=await page.evaluate(async()=>({caches:await caches.keys(),workers:(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname)}));
        assert(rest.caches.includes('sibling-private-cache'));assert(rest.workers.includes('/sibling/'));assert(!rest.workers.includes('/drive-original/'));
        assert.deepEqual(errors,[]);record('offline first reload uses versioned shell; cache reset preserves sibling app');
      }finally{await context.close();}
    });
  }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();browser?.close();});
