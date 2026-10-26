'use strict';

// Q0 original revision pin ownership, card-intent prewarm and Q1 retirement.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function retireQ0Playback() {
  const owner = q0Playback;
  q0Playback = null;
  return retireQ1Playback(owner);
}

function beginQ0Playback(file, session) {
  const owner = { controller: new AbortController(), fileId: file.id, session,
    account: state.authAccountKey, accountGeneration: state.driveSessionGeneration,
    swGeneration: mediaSourceGeneration, swController: navigator.serviceWorker?.controller,
    requiresSwReadiness: true, setupDone: Promise.resolve(), cleanupOk: true };
  q0Playback = owner;
  return owner;
}

function isCurrentQ0Playback(owner, fileId, sourceGeneration) {
  return Boolean(owner && owner === q0Playback && !owner.controller.signal.aborted
    && state.selected?.id === fileId && owner.fileId === fileId
    && owner.session === state.mediaSession && owner.swGeneration === sourceGeneration
    && sourceGeneration === mediaSourceGeneration && owner.account === state.authAccountKey
    && owner.accountGeneration === state.driveSessionGeneration);
}

function q0OwnerContext(owner, clientId) {
  return { clientId, fileId: owner.fileId, mediaSession: String(owner.session),
    sourceGeneration: owner.swGeneration, accountKey: owner.account,
    accountGeneration: owner.accountGeneration };
}

const q0CapableControllers = new WeakMap();
function hasQ0CapableController() {
  const worker = navigator.serviceWorker?.controller;
  return Boolean(worker && globalThis.DriveRevisionPin?.PROTOCOL
    && q0CapableControllers.get(worker) === DriveRevisionPin.PROTOCOL);
}

function waitForQ0Control(file, kind, session, message, onReady) {
  const serviceWorker = navigator.serviceWorker;
  if (q0ControlWait?.fileId === file.id && q0ControlWait.session === session
    && q0ControlWait.accountKey === state.authAccountKey
    && q0ControlWait.accountGeneration === state.driveSessionGeneration
    && q0ControlWait.sourceGeneration === mediaSourceGeneration
    && !q0ControlWait.controller.signal.aborted) return true;
  q0ControlWait?.controller.abort();
  const controller = new AbortController();
  const owner = { fileId: file.id, session, accountKey: state.authAccountKey,
    accountGeneration: state.driveSessionGeneration,
    sourceGeneration: mediaSourceGeneration, controller };
  q0ControlWait = owner;
  state.mediaAbortController?.abort(); state.mediaAbortController = controller;
  state.mediaAttempt = 'range-preparing';
  showMediaLoading();
  let finished = false, port = null, probedController = null;
  const closePort = () => { if (port) { port.onmessage = null; port.close(); port = null; } };
  const finish = outcome => {
    if (finished) return;
    finished = true;
    closePort();
    clearTimeout(timer);
    serviceWorker.removeEventListener?.('controllerchange', controlled);
    controller.signal.removeEventListener('abort', cancelled);
    const current = q0ControlWait === owner && !controller.signal.aborted
      && state.selected?.id === file.id && state.mediaSession === session
      && state.authAccountKey === owner.accountKey
      && state.driveSessionGeneration === owner.accountGeneration
      && mediaSourceGeneration === owner.sourceGeneration;
    if (q0ControlWait === owner) q0ControlWait = null;
    if (state.mediaAbortController === controller) state.mediaAbortController = null;
    if (!current) return;
    if (outcome === 'ready') {
      if (onReady) onReady();
      else startOriginalRangePlayback(file, kind, session, message);
    }
    else if (outcome === 'timeout') {
      state.mediaAttempt = 'failed';
      showMediaError('원본 재생 연결 준비가 지연되고 있습니다. 앱을 새로 연 뒤 다시 시도하세요.',
        { title: '재생 연결 준비 필요', showRetry: false });
    }
  };
  const controlled = () => {
    closePort();
    if (q0ControlWait !== owner || controller.signal.aborted
      || state.selected?.id !== owner.fileId || state.mediaSession !== owner.session
      || state.authAccountKey !== owner.accountKey
      || state.driveSessionGeneration !== owner.accountGeneration
      || mediaSourceGeneration !== owner.sourceGeneration) return finish('cancelled');
    const worker = serviceWorker.controller, protocol = globalThis.DriveRevisionPin?.PROTOCOL;
    probedController = worker;
    if (hasQ0CapableController()) return finish('ready');
    if (!worker || !protocol || typeof MessageChannel !== 'function') return;
    const channel = new MessageChannel();
    const requestId = `q0-cap-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    port = channel.port1;
    port.onmessage = event => {
      const data = event.data;
      if (finished || controller.signal.aborted || worker !== probedController
        || serviceWorker.controller !== worker || data?.type !== 'Q0_CAPABILITY_RESPONSE'
        || data.protocol !== protocol || data.requestId !== requestId || data.capable !== true) return;
      q0CapableControllers.set(worker, protocol);
      finish('ready');
    };
    try { worker.postMessage({ type: 'Q0_CAPABILITY_REQUEST', protocol, requestId }, [channel.port2]); }
    catch (_) { closePort(); channel.port2.close(); }
  };
  const cancelled = () => finish('cancelled');
  const timer = setTimeout(() => finish('timeout'), 12000);
  controller.signal.addEventListener('abort', cancelled, { once: true });
  serviceWorker.addEventListener?.('controllerchange', controlled);
  controlled();
  return true;
}

function sameQ0Context(a, b) {
  return ['clientId','fileId','mediaSession','sourceGeneration','accountKey','accountGeneration']
    .every(key => a?.[key] === b?.[key]);
}

// Card intent (hover dwell or press) acquires the same immutable revision pin
// the SW would acquire after the click. The SW adopts it through its existing
// retained-pin 'get' handshake, validates it and still reauthorizes before any
// original bytes. Single use and short-lived, so an open never plays a stale pin.
const Q0_PREWARM_HOVER_MS = 150;
const Q0_PREWARM_MAX_AGE_MS = 30000;
const Q0_PREWARM_GET_WAIT_MS = 1500;
const Q0_PIN_METADATA_FIELDS = 'id,headRevisionId,size,mimeType,modifiedTime,sha256Checksum,trashed,resourceKey,capabilities(canDownload,canReadRevisions)';
let q0Prewarm = null;

async function fetchQ0PinJSON(url, { method = 'GET', resourceKey = null, signal } = {}) {
  if (!hasUsableToken() || !hasAuthCapability('driveRead')) throw DriveRevisionPin.error('AUTH', 401);
  const headers = { Authorization: `Bearer ${state.token}` };
  if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = resourceKey;
  const response = await fetch(url, { method, headers, signal, redirect: 'error', cache: 'no-store' });
  if (!response.ok) {
    response.body?.cancel().catch(() => {});
    throw DriveRevisionPin.error(response.status === 401 ? 'AUTH' : 'PROVIDER_DENIAL', response.status);
  }
  const text = await response.text();
  if (text.length > 32768) throw DriveRevisionPin.error('JSON_LIMIT');
  try { return JSON.parse(text); } catch (_) { throw DriveRevisionPin.error('JSON_INVALID'); }
}

function isPrewarmableMedia(file) {
  return /^(video|image)\//.test(file?.mimeType || '');
}

function prewarmRevisionPin(file) {
  const account = state.authAccountKey, accountGeneration = state.driveSessionGeneration;
  if (state.demo || !file?.id || !isPrewarmableMedia(file) || file.capabilities?.canDownload === false
    || !account || !hasUsableToken() || !hasAuthCapability('driveRead') || !globalThis.DriveRevisionPin
    || !navigator.serviceWorker?.controller) return null;
  const existing = q0Prewarm;
  if (existing?.fileId === file.id && existing.account === account && existing.accountGeneration === accountGeneration
    && (!existing.settledAt || performance.now() - existing.settledAt < Q0_PREWARM_MAX_AGE_MS)) return existing;
  existing?.controller.abort();
  const controller = new AbortController();
  const entry = { fileId: file.id, account, accountGeneration, controller, pin: null, settledAt: 0 };
  const resourceKeyHeader = key => (key || file.resourceKey) ? `${file.id}/${key || file.resourceKey}` : null;
  const fileUrl = `${DRIVE_API}/files/${encodeURIComponent(file.id)}`;
  q0Prewarm = entry;
  entry.promise = DriveRevisionPin.acquire({
    context: { fileId: file.id, accountKey: account, accountGeneration },
    revisionHint: file.headRevisionId, signal: controller.signal, maxPolls: 0,
    isCurrent: () => q0Prewarm === entry && state.authAccountKey === account
      && state.driveSessionGeneration === accountGeneration,
    readMetadata: ({ signal }) => fetchQ0PinJSON(`${fileUrl}?${new URLSearchParams({
      fields: Q0_PIN_METADATA_FIELDS, supportsAllDrives: 'true' })}`, { resourceKey: resourceKeyHeader(), signal }),
    startDownload: ({ revisionId, resourceKey, signal }) => fetchQ0PinJSON(
      `${fileUrl}/download?${new URLSearchParams({ revisionId })}`,
      { method: 'POST', resourceKey: resourceKeyHeader(resourceKey), signal })
  }).then(pin => {
    entry.pin = pin;
    entry.settledAt = performance.now();
    return pin;
  }, () => {
    if (q0Prewarm === entry) q0Prewarm = null;
    return null;
  });
  return entry;
}

// Once the current item is on screen, the item the primary gesture opens next
// (vertical deck on touch layouts, sequential next otherwise) gets its pin in
// the same single slot, so that open skips the provider acquisition.
function prewarmNextPlaybackPin() {
  if (el.playerSheet?.hidden !== false || !state.selected) return null;
  const list = getPlaybackFileList();
  const deck = isMobileDevice() ? ensureVerticalPlaybackDeck(state.selected, list) : null;
  const next = deck ? getPlaybackFileById(deck.below?.[0], list) : resolveSequentialPlaybackTarget('left', list);
  if (!next || next.id === state.selected.id) return null;
  return prewarmRevisionPin(next);
}

// Hands a matching prewarmed pin to the current Q0 owner at most once. An
// in-flight prewarm is joined for a bounded time below the SW handshake limit.
async function takePrewarmedRevisionPin(owner) {
  const entry = q0Prewarm;
  if (!entry || entry.fileId !== owner.fileId || entry.account !== owner.account
    || entry.accountGeneration !== owner.accountGeneration) return null;
  let timer;
  const pin = entry.pin || await Promise.race([entry.promise,
    new Promise(resolve => { timer = setTimeout(() => resolve(null), Q0_PREWARM_GET_WAIT_MS); })]);
  clearTimeout(timer);
  if (q0Prewarm === entry) q0Prewarm = null;
  if (!pin || performance.now() - entry.settledAt > Q0_PREWARM_MAX_AGE_MS) return null;
  return pin;
}

function installCardPinPrewarm(button, file) {
  if (!isPrewarmableMedia(file)) return;
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  button.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch' || state.selectionMode) return;
    cancel();
    timer = setTimeout(() => { timer = null; prewarmRevisionPin(file); }, Q0_PREWARM_HOVER_MS);
  });
  button.addEventListener('pointerleave', cancel);
  button.addEventListener('pointerdown', (event) => {
    cancel();
    if (event.button === 0 && !state.selectionMode) prewarmRevisionPin(file);
  });
}

async function handleQ0PinMessage(event, data) {
  const port = event.ports?.[0], owner = q0Playback;
  if (!port) return;
  const protocol = globalThis.DriveRevisionPin?.PROTOCOL;
  const isValid = () => protocol && data.protocol === protocol && /^[A-Za-z0-9_-]{1,80}$/.test(data.requestId || '')
    && typeof data.clientId === 'string' && data.clientId.length > 0 && data.clientId.length <= 512
    && event.source === owner?.swController && navigator.serviceWorker?.controller === owner?.swController
    && isCurrentQ0Playback(owner, data.fileId, data.sourceGeneration);
  let valid = isValid();
  if (valid && data.type === 'Q0_PIN_REQUEST' && data.mode === 'get' && !q0PinnedSource) {
    const prewarmed = await takePrewarmedRevisionPin(owner);
    valid = isValid();
    if (valid && prewarmed && !q0PinnedSource) {
      try {
        const pin = DriveRevisionPin.validatePin(prewarmed, q0OwnerContext(owner, data.clientId));
        q0PinnedSource = Object.freeze({ ...pin, descriptor: Object.freeze({ ...pin.descriptor }) });
      } catch (_) { /* The SW acquires its own pin. */ }
    }
  }
  const context = valid ? q0OwnerContext(owner, data.clientId) : null;
  if (data.type === 'Q0_OWNER_REQUEST') {
    port.postMessage({ type: 'Q0_OWNER_RESPONSE', protocol, requestId: data.requestId,
      requestCurrent: Boolean(valid), context,
      resourceKey: valid ? state.selected.resourceKey || null : null,
      revisionHint: valid ? state.selected.headRevisionId || null : null,
      traceId: valid ? getMediaDiagnosticTraceId(state.mediaSession) : '',
      acknowledgeAbuse: valid && state.mediaAbuseAcknowledged === true });
  } else {
    let error = null;
    const authorized = valid && sameQ0Context(data.context, context);
    try {
      if (!authorized) throw new Error('OWNER');
      if (data.mode === 'bind') {
        const pin = DriveRevisionPin.validatePin(data.pin, context);
        if (q0PinnedSource && !DriveRevisionPin.samePin(q0PinnedSource, pin)) throw new Error('PIN_REPLACEMENT');
        q0PinnedSource ||= Object.freeze({ ...pin, descriptor: Object.freeze({ ...pin.descriptor }) });
        if (!owner.audioProbeStarted && state.selected?.id === owner.fileId && !el.videoPlayer.hidden) {
          owner.audioProbeStarted = true;
          const pinned = q0PinnedSource;
          owner.formatDecision = new Promise(resolve => { owner.resolveFormatDecision = resolve; });
          // Retirement must join the probe, including late source cancellation.
          owner.setupDone = Promise.resolve().then(() => planPinnedOriginalAudio(owner, pinned));
          // The handoff may retire this owner, so it must run outside setupDone.
          void owner.setupDone.then(async mimeType => {
            if (mimeType) return presentPinnedOriginalImage(owner, pinned, mimeType);
          }).catch(() => {}).finally(() => owner.resolveFormatDecision());
        }
      } else if (data.mode !== 'get') throw new Error('PROTOCOL');
    } catch (_) { error = 'PIN_REJECTED'; }
    port.postMessage({ type: 'Q0_PIN_RESPONSE', protocol, requestId: data.requestId, context,
      requestCurrent: Boolean(authorized && !error), pin: authorized && !error ? q0PinnedSource : null, error });
  }
  port.close?.();
}

function retireQ1Playback(owner) {
  if (!owner || owner.retirement) return owner?.retirement;
  owner.controller.abort();
  const immediate = owner.player?.dispose();
  const previous = q1Retirement;
  owner.retirement = (async () => {
    await owner.setupDone;
    await owner.q3ProbeDone;
    const cleanup = await (immediate || owner.player?.dispose());
    const workerSettled = !owner.requiresSwReadiness || await confirmQ1WorkerRetirement(owner);
    const prior = await previous;
    return { settled: prior.settled && owner.cleanupOk !== false && cleanup?.settled !== false && workerSettled };
  })().catch(() => ({ settled: false })).then(result => {
    if (q1Retirement === owner.retirement) q1RetirementResult = result;
    return result;
  });
  q1Retirement = owner.retirement;
  q1RetirementResult = null;
  return owner.retirement;
}

function confirmQ1WorkerRetirement(owner) {
  const serviceWorker = navigator.serviceWorker, controller = owner.swController;
  if (!controller || serviceWorker?.controller !== controller || typeof MessageChannel !== 'function') return Promise.resolve(false);
  const generation = owner.swGeneration;
  if (!Number.isSafeInteger(generation) || generation < 0) return Promise.resolve(false);
  return new Promise(resolve => {
    const channel = new MessageChannel(), requestId = `q1-retire-${++q1RetirementSequence}`;
    let ended = false;
    const finish = settled => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      serviceWorker.removeEventListener?.('controllerchange', replaced);
      channel.port1.onmessage = null; channel.port1.onmessageerror = null;
      channel.port1.close(); channel.port2.close();
      resolve(settled === true && serviceWorker.controller === controller);
    };
    const replaced = () => finish(false);
    const timer = setTimeout(() => finish(false), 2000);
    channel.port1.onmessage = ({ data }) => finish(data?.type === 'Q1_RETIRE_RESPONSE'
      && data.protocol === Q1_RETIRE_PROTOCOL && data.requestId === requestId
      && data.retiredThroughGeneration === generation && data.settled === true);
    channel.port1.onmessageerror = replaced;
    serviceWorker.addEventListener?.('controllerchange', replaced);
    try {
      controller.postMessage({ type: 'Q1_RETIRE_REQUEST', protocol: Q1_RETIRE_PROTOCOL,
        requestId, retiredThroughGeneration: generation }, [channel.port2]);
    } catch (_) { finish(false); }
  });
}
