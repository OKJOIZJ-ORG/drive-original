'use strict';

// Client of the server trash/move queue (worker/drive-jobs.mjs): submits file IDs, follows
// progress while the page is open and shows it in Settings. The work itself does not need this page.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

const DRIVE_JOB_CHUNK_FILES = 400;
const DRIVE_JOB_SUBMIT_ATTEMPTS = 3;
const DRIVE_JOB_POLL_MS = 3_000;
const DRIVE_JOB_POLL_ERROR_MS = 15_000;
const DRIVE_JOB_SEEN_PREFIX = 'drive-original.drive-jobs-seen.';
const DRIVE_JOB_PANEL_ROWS = 8;

const serverDriveJobs = new Map();
let driveJobSummaries = [];
let driveJobLastSeq = 0;
let driveJobSeqKey = '';
let driveJobPollTimer = null;
let driveJobPollRunning = false;
let driveJobPollQueued = null;

function serverDriveJobsEnabled() {
  return !state.demo && DRIVE_MUTATIONS_ENABLED;
}

async function driveJobRequest(op, body = {}, signal) {
  let response;
  try {
    response = await fetch(new URL(`/api/drive-jobs/${op}`, location.origin), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      mode: 'same-origin',
      redirect: 'error',
      signal,
      headers: { 'Content-Type': 'application/json', 'X-Drive-Original-CSRF': '1' },
      body: JSON.stringify({ ...body, expectedAccount: state.authAccountKey })
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw Object.assign(new Error('서버에 연결하지 못했습니다.'), { mutationState: 'failed', status: 0 });
  }
  if (!response.ok) {
    throw Object.assign(new Error('서버가 파일 작업을 받지 못했습니다.'), { mutationState: 'failed', status: response.status });
  }
  return response.json();
}

async function submitDriveJobChunk(payload, signal) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await driveJobRequest('enqueue', payload, signal); }
    catch (error) {
      // A lost response is safe to resend: the server ignores a chunk it already has.
      const retryable = !error.status || error.status >= 500;
      if (attempt >= DRIVE_JOB_SUBMIT_ATTEMPTS || !retryable || error?.name === 'AbortError') throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function submitServerDriveJob(job) {
  Object.assign(job, { id: globalThis.crypto.randomUUID(), server: true, submitted: false, results: [], localFailures: [] });
  serverDriveJobs.set(job.id, job);
  const target = job.action === 'move'
    ? { id: job.targetRow.id, name: job.targetRow.name || null, resourceKey: job.targetRow.resourceKey || null } : undefined;
  let sent = 0;
  try {
    for (let chunk = 0; sent < job.files.length; chunk += 1) {
      const files = job.files.slice(sent, sent + DRIVE_JOB_CHUNK_FILES).map((file) => ({
        id: file.id, parents: Array.isArray(file.parents) && file.parents.length ? file.parents : null,
        version: file.version || null, resourceKey: file.resourceKey || null
      }));
      await submitDriveJobChunk({ jobId: job.id, action: job.action, chunk, target, files }, job.owner.options?.signal);
      sent += files.length;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return finishDriveActionJob(job);
    job.localFailures = job.files.slice(sent).map((item) => ({ status: 'rejected', item, reason: error }));
    if (!sent) return completeServerDriveJob(job);
  }
  job.submitted = true;
  renderDriveJobPanel();
  scheduleDriveJobPoll(0);
}

function driveJobFailure(row) {
  const message = { conflict: '파일 상태가 바뀌었습니다. 새로고침해 확인해 주세요.',
    uncertain: 'Drive에 반영됐는지 확인하지 못했습니다. 새로고침해 확인해 주세요.',
    cancelled: '취소했습니다.' }[row.state] || 'Drive가 작업을 거절했습니다.';
  const mutationState = row.state === 'cancelled' ? 'cancelled-before-submit' : row.state;
  return Object.assign(new Error(message), { mutationState, status: row.status || 0 });
}

function completeServerDriveJob(job) {
  serverDriveJobs.delete(job.id);
  const known = new Map((job.files.length ? job.files : state.files).map((file) => [file.id, file]));
  const results = job.results.map((row) => {
    const item = known.get(row.fileId) || { id: row.fileId };
    if (row.state !== 'confirmed' && row.state !== 'skipped') return { status: 'rejected', item, reason: driveJobFailure(row) };
    if (job.action === 'move' && row.parents) item.parents = [...row.parents];
    return { status: 'fulfilled', item, value: { skipped: row.state === 'skipped' } };
  });
  try {
    if (job.owner.current()) settleDriveActionResults(job, [...results, ...job.localFailures]);
  } finally {
    finishDriveActionJob(job);
  }
}

// A job this page did not submit: started before a reload, or on another device.
function adoptDriveJob(summary) {
  if (!summary) return null;
  const job = { id: summary.id, action: summary.action, server: true, adopted: true, submitted: true, hide: true,
    targetRow: summary.action === 'move' ? { id: summary.targetId, name: summary.targetName || '' } : null,
    files: [], ids: new Set(), results: [], localFailures: [], done: 0, owner: captureAccountStateRequest() };
  serverDriveJobs.set(job.id, job);
  driveActionJobs.push(job);
  return job;
}

function driveJobSeenKey() {
  return state.accountId ? `${DRIVE_JOB_SEEN_PREFIX}${encodeURIComponent(state.accountId)}` : '';
}

function loadDriveJobSeq() {
  const key = driveJobSeenKey();
  if (key === driveJobSeqKey) return;
  driveJobSeqKey = key;
  driveJobLastSeq = 0;
  try { driveJobLastSeq = Number(localStorage.getItem(key)) || 0; } catch (_) {}
}

function applyDriveJobStatus(data) {
  driveJobSummaries = Array.isArray(data.jobs) ? data.jobs : [];
  const summaries = new Map(driveJobSummaries.map((summary) => [summary.id, summary]));
  for (const row of data.results || []) {
    (serverDriveJobs.get(row.jobId) || adoptDriveJob(summaries.get(row.jobId)))?.results.push(row);
    driveJobLastSeq = Math.max(driveJobLastSeq, row.seq);
  }
  let missingPending = false;
  for (const summary of driveJobSummaries) {
    if (summary.pending > 0 && !serverDriveJobs.has(summary.id)) {
      adoptDriveJob(summary);
      missingPending = true;
    }
  }
  if (data.pendingFiles) {
    missingPending = false;
    const hidden = new Set();
    for (const { jobId, fileId } of data.pendingFiles) {
      const job = serverDriveJobs.get(jobId);
      if (job?.adopted) { job.ids.add(fileId); hidden.add(fileId); }
    }
    if (hidden.size) {
      setHiddenActionFiles(hidden, true);
      renderLibraryAfterDriveAction();
    }
  }
  try { if (driveJobSeqKey) localStorage.setItem(driveJobSeqKey, String(driveJobLastSeq)); } catch (_) {}
  if (!data.moreResults) {
    for (const job of [...serverDriveJobs.values()]) {
      const summary = summaries.get(job.id);
      if (job.submitted && summary?.pending === 0) completeServerDriveJob(job);
    }
  }
  renderDriveJobPanel();
  return { missingPending };
}

function scheduleDriveJobPoll(delay, options) {
  clearTimeout(driveJobPollTimer);
  driveJobPollTimer = setTimeout(() => { void pollDriveJobs(options); }, delay);
}

async function pollDriveJobs(options = {}) {
  clearTimeout(driveJobPollTimer);
  if (!serverDriveJobsEnabled() || !state.authAccountKey || !state.accountId || state.accountIdentityPending) return;
  if (driveJobPollRunning) { driveJobPollQueued = options; return; }
  driveJobPollRunning = true;
  const owner = captureAccountStateRequest();
  let next = null;
  try {
    loadDriveJobSeq();
    const data = await driveJobRequest('status', { after: driveJobLastSeq, includePending: options.includePending === true }, owner.options.signal);
    if (!owner.current()) return;
    const { missingPending } = applyDriveJobStatus(data);
    if (data.moreResults || missingPending) next = { delay: 0, options: { includePending: missingPending } };
    else if (serverDriveJobs.size) next = { delay: DRIVE_JOB_POLL_MS };
  } catch (error) {
    if (error?.name !== 'AbortError' && serverDriveJobs.size) next = { delay: DRIVE_JOB_POLL_ERROR_MS };
  } finally {
    driveJobPollRunning = false;
  }
  if (driveJobPollQueued) {
    next = { delay: 0, options: driveJobPollQueued };
    driveJobPollQueued = null;
  }
  // The server keeps working without this page; a hidden page has nobody to show progress to.
  if (next && document.visibilityState !== 'hidden') scheduleDriveJobPoll(next.delay, next.options);
}

function resetServerDriveJobs() {
  clearTimeout(driveJobPollTimer);
  [...serverDriveJobs.values()].forEach(finishDriveActionJob);
  driveJobSummaries = [];
  driveJobSeqKey = '';
  driveJobLastSeq = 0;
  renderDriveJobPanel();
}

async function cancelDriveJobs() {
  if (el.driveJobCancelButton) el.driveJobCancelButton.disabled = true;
  try {
    await driveJobRequest('cancel');
    await pollDriveJobs();
  } catch (error) {
    showToast(`취소하지 못했습니다: ${humanizeDriveError(error)}`);
  } finally {
    if (el.driveJobCancelButton) el.driveJobCancelButton.disabled = false;
  }
}

function driveJobLabel(action, targetName) {
  if (action === 'trash') return '휴지통으로 이동';
  if (action === 'rename') return '이름 바꾸기';
  return `'${targetName || '폴더'}'(으)로 이동`;
}

function driveJobRow(label, count, note) {
  const row = document.createElement('li');
  row.className = 'drive-job-row';
  const name = document.createElement('span');
  name.className = 'drive-job-name';
  name.textContent = label;
  const detail = document.createElement('span');
  detail.className = 'drive-job-detail';
  detail.textContent = [count, note].filter(Boolean).join(' · ');
  row.append(name, detail);
  return row;
}

function renderDriveJobPanel() {
  const list = el.driveJobList;
  if (!list) return;
  const number = (value) => value.toLocaleString('ko-KR');
  const rows = [];
  // Jobs the server does not own: rename, demo mode and files still being handed over.
  for (const job of driveActionJobs) {
    if (job.submitted) continue;
    rows.push(driveJobRow(driveJobLabel(job.action, job.targetRow?.name),
      `${number(job.done)}/${number(job.files.length)}`, job.server ? '서버로 보내는 중' : '진행 중'));
  }
  const summaries = [...driveJobSummaries].sort((a, b) => (b.pending > 0) - (a.pending > 0) || b.updatedAt - a.updatedAt);
  for (const summary of summaries.slice(0, DRIVE_JOB_PANEL_ROWS)) {
    const done = summary.total - summary.pending;
    const failed = summary.failed ? `실패·취소 ${number(summary.failed)}개` : '';
    rows.push(driveJobRow(driveJobLabel(summary.action, summary.targetName), `${number(done)}/${number(summary.total)}`,
      [summary.pending > 0 ? '진행 중' : '완료', failed].filter(Boolean).join(' · ')));
  }
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'drive-job-empty';
    empty.textContent = '최근 파일 작업이 없습니다.';
    rows.push(empty);
  }
  list.replaceChildren(...rows);
  if (el.driveJobCancelButton) el.driveJobCancelButton.hidden = !summaries.some((summary) => summary.pending > 0);
}
