(()=>{var ownWriterFactory = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // qa/v2-own-writer/own-writer-entry.mjs
  var own_writer_entry_exports = {};
  __export(own_writer_entry_exports, {
    default: () => createOwnWriterHandle
  });

  // qa/v2-state-snapshot/snapshot.mjs
  var API = "https://www.googleapis.com/drive/v3";
  var LEGACY = "drive-original-account-state.json";
  var WRITER = /^drive-original-account-state-v2-([A-Za-z0-9_-]+)\.json$/;
  var DEFAULT_LIMITS = Object.freeze({ requests: 100, bytes: 8 * 1024 * 1024, milliseconds: 3e4, files: 64, pages: 16 });
  var SnapshotError = class extends Error {
    constructor(code) {
      super(code);
      this.name = "SnapshotError";
      this.code = code;
    }
  };
  var fail = (code) => {
    throw new SnapshotError(code);
  };
  var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var timestamp = (value) => Number.isSafeInteger(value) && value >= 0;
  var own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  function validateRawState(value, legacy = false) {
    if (!record(value) || !record(value.viewed) || !record(value.favorites)) fail("malformed_state");
    if (value.schemaVersion !== 1 && !(legacy && !own(value, "schemaVersion"))) fail("unsupported_schema");
    if (own(value, "updatedAt") && !timestamp(value.updatedAt)) fail("malformed_state");
    for (const [id, time] of Object.entries(value.viewed)) {
      if (!id || !timestamp(time) || time === 0) fail("malformed_state");
    }
    for (const [id, entry] of Object.entries(value.favorites)) {
      if (!id) fail("malformed_state");
      if (typeof entry === "boolean") continue;
      if (!record(entry) || typeof entry.liked !== "boolean" || !timestamp(entry.updatedAt)) fail("malformed_state");
    }
    return value;
  }
  function validatedLimits(input) {
    const limits = { ...DEFAULT_LIMITS, ...input };
    for (const key of Object.keys(DEFAULT_LIMITS)) {
      if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > DEFAULT_LIMITS[key]) fail("invalid_limits");
    }
    return limits;
  }
  function validateMetadata(file) {
    if (!record(file) || typeof file.id !== "string" || !file.id || typeof file.name !== "string" || typeof file.modifiedTime !== "string" || !file.modifiedTime || own(file, "version") && (typeof file.version !== "string" || !/^\d+$/.test(file.version))) fail("malformed_catalog");
    const writer2 = WRITER.exec(file.name);
    if (file.name !== LEGACY && !writer2) fail("unexpected_file");
    return {
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
      ...own(file, "version") ? { version: file.version } : {},
      writer: writer2?.[1] || null
    };
  }
  async function collectSnapshot({
    read,
    normalize,
    merge,
    expectedAccountId,
    isCurrent = () => true,
    clock = () => Date.now(),
    signal,
    limits: inputLimits = {},
    allowEmpty = false
  } = {}) {
    if (typeof read !== "function" || typeof normalize !== "function" || typeof merge !== "function" || typeof isCurrent !== "function" || typeof clock !== "function" || typeof expectedAccountId !== "string" || !expectedAccountId) fail("invalid_contract");
    const limits = validatedLimits(inputLimits);
    const started = clock();
    if (!Number.isFinite(started)) fail("invalid_clock");
    const controller = new AbortController();
    let timedOut = false, requests = 0, bytes = 0;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limits.milliseconds);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const check = () => {
      const elapsed = clock() - started;
      if (!Number.isFinite(elapsed) || elapsed < 0) fail("invalid_clock");
      if (timedOut || elapsed >= limits.milliseconds) fail("time_limit");
      if (signal?.aborted || controller.signal.aborted) fail("cancelled");
      if (isCurrent() !== true) fail("stale_owner");
    };
    const bounded = (operation) => new Promise((resolve, reject) => {
      const interrupted = () => {
        try {
          check();
          fail("cancelled");
        } catch (error) {
          reject(error);
        }
      };
      controller.signal.addEventListener("abort", interrupted, { once: true });
      Promise.resolve(operation).then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", interrupted));
      if (controller.signal.aborted) interrupted();
    });
    const get = async (url) => {
      check();
      if (++requests > limits.requests) fail("request_limit");
      let response;
      try {
        response = await bounded(read(url, { method: "GET", signal: controller.signal }));
      } catch {
        check();
        fail("read_failed");
      }
      check();
      if (response?.status === 404) fail("missing_file");
      if (!response?.ok) fail("read_failed");
      if (!response.body?.getReader) fail("invalid_reader");
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      try {
        for (; ; ) {
          check();
          const chunk = await bounded(reader.read());
          check();
          if (chunk.done) break;
          if (!(chunk.value instanceof Uint8Array)) fail("invalid_reader");
          bytes += chunk.value.byteLength;
          if (bytes > limits.bytes) fail("byte_limit");
          length += chunk.value.byteLength;
          chunks.push(chunk.value);
        }
      } catch (error) {
        void reader.cancel().catch(() => {
        });
        check();
        if (error instanceof SnapshotError) throw error;
        fail("read_failed");
      } finally {
        try {
          reader.releaseLock();
        } catch {
        }
      }
      const content = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        content.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
      } catch {
        fail("invalid_json");
      }
    };
    const account = async () => {
      const result = await get(`${API}/about?fields=user(permissionId)`);
      const id = result?.user?.permissionId;
      if (typeof id !== "string" || !id) fail("invalid_account");
      if (id !== expectedAccountId) fail("account_mismatch");
      return id;
    };
    const catalog = async () => {
      const files = [], ids = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Set(), tokens = /* @__PURE__ */ new Set();
      let token = null, pages = 0;
      do {
        if (++pages > limits.pages) fail("page_limit");
        const query = new URLSearchParams({
          spaces: "appDataFolder",
          pageSize: "1000",
          q: `(name = '${LEGACY}' or name contains 'drive-original-account-state-v2-') and trashed = false`,
          fields: "nextPageToken,incompleteSearch,files(id,name,modifiedTime,version)"
        });
        if (token) query.set("pageToken", token);
        const page = await get(`${API}/files?${query}`);
        if (!record(page) || !Array.isArray(page.files)) fail("malformed_catalog");
        if (page.incompleteSearch === true) fail("incomplete_catalog");
        if (own(page, "incompleteSearch") && typeof page.incompleteSearch !== "boolean") fail("malformed_catalog");
        for (const value of page.files) {
          const file = validateMetadata(value);
          if (ids.has(file.id)) fail("duplicate_file");
          if (names.has(file.name)) fail("duplicate_writer");
          ids.add(file.id);
          names.add(file.name);
          files.push(file);
          if (files.length > limits.files) fail("file_limit");
        }
        token = page.nextPageToken ?? null;
        if (token !== null && (typeof token !== "string" || !token)) fail("malformed_catalog");
        if (token && tokens.has(token)) fail("repeated_page");
        if (token) tokens.add(token);
      } while (token);
      return files.sort((a, b) => a.id.localeCompare(b.id));
    };
    const cache = /* @__PURE__ */ new Map();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const accountId = await account();
        const before = await catalog();
        if (!before.length && allowEmpty !== true) fail("empty_snapshot");
        const documents = [];
        for (const file of before) {
          const key = canonical(file);
          let raw = cache.get(key);
          if (!raw) {
            raw = validateRawState(await get(`${API}/files/${encodeURIComponent(file.id)}?alt=media`), file.name === LEGACY);
            cache.set(key, raw);
          }
          documents.push({ ...file, schemaVersion: raw.schemaVersion ?? null, raw });
        }
        const after = await catalog();
        await account();
        check();
        if (canonical(before) !== canonical(after)) {
          if (attempt === 0) continue;
          fail("concurrent_change");
        }
        let remote = normalize({});
        for (const file of documents) remote = merge(remote, normalize(file.raw));
        const empty = !Object.keys(remote.favorites).length && !Object.keys(remote.viewed).length;
        if (empty && allowEmpty !== true) fail("empty_snapshot");
        const snapshot = {
          accountId,
          files: documents,
          remote,
          stable: true,
          explicitlyEmpty: allowEmpty === true && empty,
          capture: { requests, bytes, retries: attempt }
        };
        return snapshot;
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      controller.abort();
    }
  }
  function counts(state) {
    const favorites = Object.values(state.favorites);
    return {
      liked: favorites.filter((entry) => entry.liked).length,
      unliked: favorites.filter((entry) => !entry.liked).length,
      viewed: Object.keys(state.viewed).length
    };
  }
  function validateSnapshot(snapshot, normalize, merge) {
    if (!record(snapshot) || snapshot.stable !== true || typeof snapshot.accountId !== "string" || !snapshot.accountId || !Array.isArray(snapshot.files) || typeof snapshot.explicitlyEmpty !== "boolean") fail("malformed_snapshot");
    validateRawState(snapshot.remote);
    const ids = /* @__PURE__ */ new Set(), names = /* @__PURE__ */ new Set();
    let recomputed = normalize({});
    for (const document of snapshot.files) {
      const metadata = validateMetadata(document);
      if (ids.has(metadata.id)) fail("duplicate_file");
      if (names.has(metadata.name)) fail("duplicate_writer");
      ids.add(metadata.id);
      names.add(metadata.name);
      const raw = validateRawState(document.raw, metadata.name === LEGACY);
      if (document.writer !== metadata.writer || document.schemaVersion !== (raw.schemaVersion ?? null)) fail("malformed_snapshot");
      recomputed = merge(recomputed, normalize(raw));
    }
    if (canonical(recomputed) !== canonical(snapshot.remote)) fail("snapshot_state_mismatch");
    const empty = !Object.keys(recomputed.favorites).length && !Object.keys(recomputed.viewed).length;
    if (snapshot.explicitlyEmpty !== empty) fail("empty_contract_mismatch");
    return recomputed;
  }
  function compareSnapshots(baseline, candidate, {
    normalize,
    merge,
    localReplica = null,
    localReplicaAccountId = null,
    approveEmptyBaseline = false
  } = {}) {
    if (typeof normalize !== "function" || typeof merge !== "function") fail("invalid_contract");
    const baselineRemote = validateSnapshot(baseline, normalize, merge);
    const candidateRemote = validateSnapshot(candidate, normalize, merge);
    if (!baseline.accountId || baseline.accountId !== candidate.accountId) fail("account_mismatch");
    const emptyBaseline = !Object.keys(baselineRemote.favorites).length && !Object.keys(baselineRemote.viewed).length;
    const emptyCandidate = !Object.keys(candidateRemote.favorites).length && !Object.keys(candidateRemote.viewed).length;
    if (emptyBaseline && !(approveEmptyBaseline === true && baseline.explicitlyEmpty === true && candidate.explicitlyEmpty === true && emptyCandidate)) fail("empty_baseline");
    const identity = (snapshot) => snapshot.files.map(({ raw, ...file }) => file).sort((a, b) => a.id.localeCompare(b.id));
    const sameFiles = canonical(identity(baseline)) === canonical(identity(candidate));
    const sameDocuments = canonical(baseline.files.map((file) => ({ id: file.id, raw: file.raw })).sort((a, b) => a.id.localeCompare(b.id))) === canonical(candidate.files.map((file) => ({ id: file.id, raw: file.raw })).sort((a, b) => a.id.localeCompare(b.id)));
    const sameRemote = canonical(baselineRemote) === canonical(candidateRemote);
    let local = null;
    if (localReplica !== null) {
      if (localReplicaAccountId !== baseline.accountId) fail("local_account_mismatch");
      validateRawState(localReplica, true);
      const replica = normalize(localReplica);
      local = {
        replica,
        reconstruction: merge(candidate.remote, replica),
        pending: canonical(merge(candidate.remote, replica)) !== canonical(normalize(candidate.remote))
      };
    }
    return { comparisonSummary: {
      remoteEquivalent: sameFiles && sameDocuments && sameRemote,
      sameFiles,
      sameDocuments,
      sameRemote,
      baseline: { files: baseline.files.length, ...counts(normalize(baseline.remote)) },
      candidate: { files: candidate.files.length, ...counts(normalize(candidate.remote)) },
      localReplicaPresent: local !== null,
      localPending: Boolean(local?.pending),
      writeAuthorization: false
    }, local };
  }

  // qa/v2-state-snapshot/legacy-replica.mjs
  var LEGACY_ORIGIN = "https://okjoizj-org.github.io";
  var LEGACY_PATH = "/drive-original/version.json";
  var MAX_BYTES = 8 * 1024 * 1024;
  var codes = /* @__PURE__ */ new Set([
    "invalid_contract",
    "wrong_origin",
    "account_mismatch",
    "stale_owner",
    "read_only_required",
    "legacy_cache_absent",
    "storage_unavailable",
    "byte_limit",
    "malformed_state",
    "unsupported_schema",
    "invalid_writer",
    "storage_changed",
    "invalid_transport"
  ]);
  var LegacyReplicaError = class extends Error {
    constructor(code) {
      super(code);
      this.name = "LegacyReplicaError";
      this.code = code;
    }
  };
  var fail2 = (code) => {
    throw new LegacyReplicaError(code);
  };
  var record2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var writerValid = (value) => value === null || typeof value === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value);
  function fenceValid(expectedAccountId, fence) {
    if (typeof expectedAccountId !== "string" || !expectedAccountId || !record2(fence)) fail2("invalid_contract");
    if (fence.accountId !== expectedAccountId) fail2("account_mismatch");
    if (fence.current !== true) fail2("stale_owner");
    if (fence.readOnly !== true) fail2("read_only_required");
  }
  function boundedText(text, maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) fail2("invalid_contract");
    if (typeof text !== "string") fail2("invalid_transport");
    if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) fail2("byte_limit");
    return text;
  }
  function parseReplica(text, maxBytes) {
    boundedText(text, maxBytes);
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      fail2("malformed_state");
    }
    try {
      validateRawState(raw);
    } catch (cause) {
      fail2(codes.has(cause?.code) ? cause.code : "malformed_state");
    }
    return raw;
  }
  var counts2 = (state) => ({
    viewed: Object.keys(state.viewed).length,
    liked: Object.values(state.favorites).filter((entry) => entry.liked).length,
    unliked: Object.values(state.favorites).filter((entry) => !entry.liked).length
  });
  function compareLegacyReplica({
    payload,
    expectedAccountId,
    fence,
    candidateProjection,
    candidateWriterId = null,
    normalize,
    merge,
    isCurrent = () => true,
    maxBytes = MAX_BYTES
  } = {}) {
    fenceValid(expectedAccountId, fence);
    if (!record2(payload) || payload.privateTransport !== true || payload.repeatedReadsEqual !== true || payload.origin !== LEGACY_ORIGIN || payload.pathname !== LEGACY_PATH || typeof payload.writerRead !== "boolean" || !writerValid(payload.writerId) || !payload.writerRead && payload.writerId !== null) fail2("invalid_transport");
    if (payload.accountId !== expectedAccountId) fail2("account_mismatch");
    if (typeof normalize !== "function" || typeof merge !== "function" || typeof isCurrent !== "function") fail2("invalid_contract");
    if (!writerValid(candidateWriterId)) fail2("invalid_writer");
    if (isCurrent() !== true) fail2("stale_owner");
    const raw = parseReplica(payload.rawText, maxBytes);
    try {
      validateRawState(candidateProjection);
    } catch (cause) {
      fail2(codes.has(cause?.code) ? cause.code : "malformed_state");
    }
    const before = normalize(candidateProjection), legacy = normalize(raw);
    const merged = merge(before, legacy);
    const addsOrChanges = canonical(merged) !== canonical(before);
    const viewedAdded = Object.keys(merged.viewed).filter((id) => !Object.prototype.hasOwnProperty.call(before.viewed, id)).length;
    const viewedChanged = Object.keys(before.viewed).filter((id) => merged.viewed[id] !== before.viewed[id]).length;
    const favoritesAdded = Object.keys(merged.favorites).filter((id) => !Object.prototype.hasOwnProperty.call(before.favorites, id)).length;
    const favoritesChanged = Object.keys(before.favorites).filter((id) => canonical(merged.favorites[id]) !== canonical(before.favorites[id])).length;
    if (isCurrent() !== true) fail2("stale_owner");
    return {
      passed: true,
      candidateProjectionIncludesLegacy: !addsOrChanges,
      mergeAddsOrChanges: addsOrChanges,
      legacy: counts2(legacy),
      candidate: counts2(before),
      merged: counts2(merged),
      viewedAdded,
      viewedChanged,
      favoritesAdded,
      favoritesChanged,
      legacyWriterAvailable: payload.writerId !== null,
      candidateWriterAvailable: candidateWriterId !== null,
      writerDistinct: payload.writerId !== null && candidateWriterId !== null ? payload.writerId !== candidateWriterId : null,
      writeAuthorization: false,
      remoteVerified: false,
      deviceVerified: false
    };
  }

  // qa/v2-state-recovery-backup/backup.mjs
  var MAX_BYTES2 = 32 * 1024 * 1024;
  var LOCAL_BYTES = 8 * 1024 * 1024;
  var record3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var writer = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value);
  var codes2 = /* @__PURE__ */ new Set([
    "invalid_contract",
    "invalid_backup",
    "invalid_json_data",
    "byte_limit",
    "account_mismatch",
    "stale_owner",
    "candidate_changed",
    "candidate_reconstruction_mismatch",
    "credential_field",
    "backup_unavailable",
    "backup_cleared",
    "run_already_claimed",
    "pending_mismatch",
    "reread_mismatch",
    "malformed_state",
    "unsupported_schema",
    "malformed_snapshot",
    "snapshot_state_mismatch",
    "empty_contract_mismatch",
    "empty_baseline",
    "duplicate_file",
    "duplicate_writer",
    "malformed_catalog",
    "unexpected_file",
    "invalid_transport",
    "invalid_writer",
    "read_only_required",
    "invalid_json",
    "missing_file",
    "read_failed",
    "invalid_reader",
    "request_limit",
    "time_limit",
    "cancelled",
    "invalid_clock",
    "invalid_account",
    "incomplete_catalog",
    "file_limit",
    "page_limit",
    "repeated_page",
    "empty_snapshot",
    "concurrent_change",
    "invalid_limits",
    "storage_unavailable"
  ]);
  var RecoveryBackupError = class extends Error {
    constructor(code) {
      super(code);
      this.name = "RecoveryBackupError";
      this.code = code;
    }
  };
  var fail3 = (code) => {
    throw new RecoveryBackupError(code);
  };
  function safeBackupFailure(cause) {
    return { passed: false, failure: codes2.has(cause?.code) ? cause.code : "invalid_backup" };
  }
  var exactKeys = (value, keys) => {
    if (!record3(value) || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) fail3("invalid_backup");
  };
  function contract({ expectedAccountId, normalize, merge, isCurrent }) {
    if (typeof expectedAccountId !== "string" || !expectedAccountId || typeof normalize !== "function" || typeof merge !== "function" || typeof isCurrent !== "function") fail3("invalid_contract");
    if (isCurrent() !== true) fail3("stale_owner");
  }
  function jsonText(value, maxBytes = MAX_BYTES2) {
    let nodes = 0, characters = 0;
    const add = (length) => {
      characters += length;
      if (characters > maxBytes) fail3("byte_limit");
    };
    const path = /* @__PURE__ */ new Set();
    const walk = (entry, depth) => {
      if (++nodes > 3e5 || depth > 16) fail3("byte_limit");
      if (entry === null || typeof entry === "boolean") return;
      if (typeof entry === "string") {
        add(entry.length);
        return;
      }
      if (typeof entry === "number") {
        if (!Number.isFinite(entry)) fail3("invalid_json_data");
        return;
      }
      if (typeof entry !== "object" || path.has(entry)) fail3("invalid_json_data");
      if (Object.prototype.toString.call(entry) !== (Array.isArray(entry) ? "[object Array]" : "[object Object]")) fail3("invalid_json_data");
      path.add(entry);
      const descriptors = Object.getOwnPropertyDescriptors(entry);
      if (Object.getOwnPropertySymbols(entry).length) fail3("invalid_json_data");
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (Array.isArray(entry) && key === "length") continue;
        add(key.length);
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail3("invalid_json_data");
        walk(descriptor.value, depth + 1);
      }
      if (Array.isArray(entry) && Object.keys(entry).length !== entry.length) fail3("invalid_json_data");
      path.delete(entry);
    };
    walk(value, 0);
    const text = JSON.stringify(value);
    if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) fail3("byte_limit");
    return text;
  }
  function localState(text) {
    if (typeof text !== "string" || text.length > LOCAL_BYTES) fail3("invalid_backup");
    if (new TextEncoder().encode(text).byteLength > LOCAL_BYTES) fail3("byte_limit");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      fail3("invalid_json");
    }
    validateRawState(parsed);
    stateOnly(parsed);
    return parsed;
  }
  function stateOnly(state) {
    const reserved = /^(?:.*token|credentials?|cookies?|authorization|clientsecret|password|secret)$/i;
    const inspect = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (reserved.test(key)) fail3("credential_field");
        inspect(child);
      }
    };
    for (const [key, value] of Object.entries(state)) {
      if (key === "viewed") continue;
      if (key === "favorites") {
        for (const entry of Object.values(value)) inspect(entry);
        continue;
      }
      if (reserved.test(key)) fail3("credential_field");
      inspect(value);
    }
  }
  var counts3 = (value) => ({
    liked: Object.values(value.favorites).filter((entry) => entry.liked).length,
    unliked: Object.values(value.favorites).filter((entry) => !entry.liked).length,
    viewed: Object.keys(value.viewed).length
  });
  function validate(payload, options) {
    contract(options);
    jsonText(payload);
    exactKeys(payload, ["privateRecoveryBackup", "remote", "candidate", "legacyLocal", "evidence"]);
    if (payload.privateRecoveryBackup !== true) fail3("invalid_backup");
    exactKeys(payload.evidence, ["projectClientBinding"]);
    if (!["verified", "unknown"].includes(payload.evidence.projectClientBinding)) fail3("invalid_backup");
    const remote = payload.remote;
    exactKeys(remote, ["accountId", "files", "remote", "stable", "explicitlyEmpty", "capture"]);
    if (remote.accountId !== options.expectedAccountId) fail3("account_mismatch");
    if (!Array.isArray(remote.files)) fail3("malformed_snapshot");
    if (remote.files.length > 64) fail3("byte_limit");
    exactKeys(remote.capture, ["requests", "bytes", "retries"]);
    for (const [key, max] of [["requests", 100], ["bytes", LOCAL_BYTES], ["retries", 1]]) {
      if (!Number.isSafeInteger(remote.capture[key]) || remote.capture[key] < 0 || remote.capture[key] > max) fail3("invalid_backup");
    }
    for (const file of remote.files) {
      if (!record3(file)) fail3("malformed_snapshot");
      const keys = ["id", "name", "modifiedTime", "writer", "schemaVersion", "raw"];
      if (Object.hasOwn(file, "version")) keys.push("version");
      exactKeys(file, keys);
      validateRawState(file.raw, file.name === "drive-original-account-state.json");
      stateOnly(file.raw);
    }
    validateRawState(remote.remote);
    stateOnly(remote.remote);
    const comparison = compareSnapshots(remote, remote, options);
    const candidate = payload.candidate;
    exactKeys(candidate, ["accountId", "cacheText", "runtimeProjection", "pending", "writerId", "writerStorageText"]);
    if (candidate.accountId !== options.expectedAccountId) fail3("account_mismatch");
    if (!writer(candidate.writerId) || !(candidate.writerStorageText === null || writer(candidate.writerStorageText))) fail3("invalid_writer");
    if (typeof candidate.pending !== "boolean") fail3("invalid_backup");
    validateRawState(candidate.runtimeProjection);
    stateOnly(candidate.runtimeProjection);
    const cached = localState(candidate.cacheText);
    const reconstruction = options.merge(remote.remote, options.normalize(cached));
    if (canonical(reconstruction) !== canonical(options.normalize(candidate.runtimeProjection))) fail3("candidate_reconstruction_mismatch");
    const pending = canonical(reconstruction) !== canonical(options.normalize(remote.remote));
    if (candidate.pending !== pending) fail3("pending_mismatch");
    const legacy = payload.legacyLocal;
    exactKeys(legacy, ["privateTransport", "origin", "pathname", "accountId", "rawText", "writerId", "writerRead", "repeatedReadsEqual"]);
    if (legacy.writerRead !== true) fail3("invalid_backup");
    stateOnly(localState(legacy.rawText));
    const legacyComparison = compareLegacyReplica({
      payload: legacy,
      expectedAccountId: options.expectedAccountId,
      fence: { accountId: options.expectedAccountId, current: true, readOnly: true },
      candidateProjection: candidate.runtimeProjection,
      candidateWriterId: candidate.writerId,
      normalize: options.normalize,
      merge: options.merge,
      isCurrent: options.isCurrent
    });
    if (options.isCurrent() !== true) fail3("stale_owner");
    return {
      passed: true,
      remoteFiles: remote.files.length,
      remoteWriters: remote.files.filter((file) => file.writer !== null).length,
      remote: comparison.comparisonSummary.baseline,
      candidate: counts3(options.normalize(candidate.runtimeProjection)),
      legacy: legacyComparison.legacy,
      candidatePending: pending,
      candidateIncludesLegacy: legacyComparison.candidateProjectionIncludesLegacy,
      legacyWriterAvailable: legacyComparison.legacyWriterAvailable,
      writerDistinct: legacyComparison.writerDistinct === true,
      runtimeMatchesRemoteAndCache: true,
      projectClientBindingVerified: payload.evidence.projectClientBinding === "verified"
    };
  }
  function createRecoveryBackup({
    remoteSnapshot,
    candidate,
    legacyLocal,
    evidence = { projectClientBinding: "unknown" },
    expectedAccountId,
    normalize,
    merge,
    isCurrent = () => true,
    approveEmptyBaseline = false
  } = {}) {
    const options = { expectedAccountId, normalize, merge, isCurrent, approveEmptyBaseline };
    const input = { privateRecoveryBackup: true, remote: remoteSnapshot, candidate, legacyLocal, evidence };
    const summary = validate(input, options);
    const privatePayload = JSON.parse(jsonText(input));
    if (isCurrent() !== true) fail3("stale_owner");
    return { privatePayload, summary };
  }

  // qa/v2-own-writer/migration.mjs
  var PREFIX = "drive-original-account-state-v2-";
  var UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime";
  var known = /* @__PURE__ */ new Set([
    "stale_owner",
    "cancelled",
    "invalid_contract",
    "backup_mismatch",
    "candidate_changed",
    "own_writer_exists",
    "write_policy",
    "already_claimed",
    "journal_failed",
    "submission_uncertain",
    "readback_mismatch",
    "time_limit",
    "lock_required",
    "not_run"
  ]);
  var fail4 = (code) => {
    throw Object.assign(new Error(code), { code });
  };
  var copy = (value) => JSON.parse(JSON.stringify(value));
  var counts4 = (state) => ({
    liked: Object.values(state.favorites).filter((x) => x.liked).length,
    unliked: Object.values(state.favorites).filter((x) => !x.liked).length,
    viewed: Object.keys(state.viewed).length
  });
  function createOwnWriterHandle(deps, canonicalExecutor) {
    const { backup, readCandidate, normalize, merge, isCurrent, read, dispatch, lock, journal, signal: externalSignal } = deps;
    const controller = new AbortController(), signal = controller.signal;
    const abort = () => controller.abort();
    if (!backup || [readCandidate, normalize, merge, isCurrent, read, dispatch, lock, journal, canonicalExecutor].some((fn) => typeof fn !== "function")) fail4("invalid_contract");
    const rules = { expectedAccountId: backup.candidate.accountId, normalize, merge, isCurrent };
    createRecoveryBackup({
      remoteSnapshot: backup.remote,
      candidate: backup.candidate,
      legacyLocal: backup.legacyLocal,
      evidence: backup.evidence,
      ...rules
    });
    if (backup.candidate.writerId === backup.legacyLocal.writerId) fail4("invalid_contract");
    let claimed = false, dispatched = false, confirmed = false, before = null, after = null, expected = null, stage = "preflight";
    let summary = { passed: false, failure: "not_run", writeAttempts: 0 };
    const writerName = PREFIX + backup.candidate.writerId + ".json";
    const check = () => {
      if (signal?.aborted) fail4("cancelled");
      if (isCurrent() !== true) fail4("stale_owner");
      if (canonical(readCandidate()) !== canonical(backup.candidate)) fail4("candidate_changed");
    };
    const durable = (value) => {
      check();
      if (journal(copy({
        schema: "drive-original.own-writer-attempt/1",
        accountId: rules.expectedAccountId,
        writerId: backup.candidate.writerId,
        writerName,
        before,
        expected,
        ...value
      })) !== true) fail4("journal_failed");
      check();
    };
    const capture = (milliseconds) => collectSnapshot({
      read,
      normalize,
      merge,
      expectedAccountId: rules.expectedAccountId,
      isCurrent: () => {
        check();
        return true;
      },
      signal,
      limits: { milliseconds }
    });
    return Object.freeze({
      async run(budgetMs = 5e4) {
        if (claimed) return { passed: false, failure: "already_claimed", writeAttempts: Number(dispatched) };
        claimed = true;
        let timedOut = false;
        const started = Date.now();
        let timer;
        const remaining = () => {
          check();
          const left = budgetMs - (Date.now() - started);
          if (timedOut || left < 1) fail4("time_limit");
          return Math.min(3e4, left);
        };
        const bounded = (operation) => new Promise((resolve, reject) => {
          const interrupted = () => reject(Object.assign(
            new Error(timedOut ? "time_limit" : "cancelled"),
            { code: timedOut ? "time_limit" : "cancelled" }
          ));
          signal.addEventListener("abort", interrupted, { once: true });
          Promise.resolve().then(() => {
            remaining();
            return operation();
          }).then(resolve, reject).finally(() => signal.removeEventListener("abort", interrupted));
          if (signal.aborted) interrupted();
        });
        try {
          if (!Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > 54e3) fail4("invalid_contract");
          externalSignal?.addEventListener("abort", abort, { once: true });
          if (externalSignal?.aborted) controller.abort();
          timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, budgetMs);
          check();
          const hooks = {
            candidate: copy(backup.candidate),
            signal,
            current: () => {
              try {
                remaining();
                return true;
              } catch {
                return false;
              }
            },
            lock: (name, options, task) => {
              if (name !== `drive-original:account:${rules.expectedAccountId}:${backup.candidate.writerId}` || options.signal !== signal) fail4("write_policy");
              return lock(name, options, task);
            },
            async catalog() {
              stage = "before_capture";
              before = await capture(remaining());
              check();
              if (!compareSnapshots(backup.remote, before, rules).comparisonSummary.remoteEquivalent) fail4("backup_mismatch");
              if (before.files.some((file) => file.name === writerName)) fail4("own_writer_exists");
              expected = merge(before.remote, normalize(JSON.parse(backup.candidate.cacheText)));
              if (canonical(expected) !== canonical(normalize(backup.candidate.runtimeProjection))) fail4("backup_mismatch");
              return { id: null, files: before.files };
            },
            remote: (catalog) => {
              remaining();
              if (catalog.id !== null || catalog.files !== before?.files) fail4("write_policy");
              return copy(before.remote);
            },
            async write(url, options) {
              remaining();
              if (dispatched || url !== UPLOAD || options?.method !== "POST" || options.signal !== signal || Object.keys(options.headers ?? {}).join(",") !== "Content-Type") fail4("write_policy");
              const boundary = /^multipart\/related; boundary=(drive_original_\d+_[a-z0-9]+)$/.exec(options.headers["Content-Type"])?.[1];
              const metadata = JSON.stringify({ name: writerName, mimeType: "application/json", parents: ["appDataFolder"] });
              const body = [
                `--${boundary}`,
                "Content-Type: application/json; charset=UTF-8",
                "",
                metadata,
                `--${boundary}`,
                "Content-Type: application/json",
                "",
                JSON.stringify(normalize(expected)),
                `--${boundary}--`,
                ""
              ].join("\r\n");
              if (!boundary || options.body !== body) fail4("write_policy");
              durable({ stage: "attempt_claimed", writeAttempts: 1 });
              dispatched = true;
              stage = "dispatch";
              let transportStatus = 0;
              try {
                transportStatus = Number(await bounded(() => dispatch(url, options))) || 0;
              } catch {
              }
              remaining();
              stage = "after_capture";
              after = await capture(remaining());
              check();
              const own2 = after.files.filter((file) => file.name === writerName);
              if (own2.length !== 1 || own2[0].writer !== backup.candidate.writerId || canonical(own2[0].raw) !== canonical(normalize(expected))) fail4("readback_mismatch");
              const other = { ...after, files: after.files.filter((file) => file.name !== writerName), remote: before.remote };
              if (!compareSnapshots(before, other, rules).comparisonSummary.remoteEquivalent || canonical(after.remote) !== canonical(expected)) fail4("readback_mismatch");
              stage = "confirmation";
              durable({
                stage: "confirmed",
                writeAttempts: 1,
                fileId: own2[0].id,
                transportStatus,
                after,
                confirmedByIndependentRawRead: true
              });
              confirmed = true;
              return { json: async () => ({ id: own2[0].id, modifiedTime: own2[0].modifiedTime }) };
            }
          };
          await bounded(() => canonicalExecutor(hooks, { normalize, merge }));
          if (!confirmed) fail4(dispatched ? "submission_uncertain" : "write_policy");
          check();
          summary = {
            passed: true,
            writeAttempts: 1,
            confirmedByIndependentRawRead: true,
            lockHeldThroughReadback: true,
            beforeFiles: before.files.length,
            afterFiles: after.files.length,
            otherDocumentsUnchanged: true,
            exactOwnBody: true,
            remoteEqualsExpected: true,
            localStateUnchanged: true,
            projection: counts4(expected),
            capture: { before: before.capture, after: after.capture }
          };
        } catch (cause) {
          summary = {
            passed: false,
            failure: dispatched ? "submission_uncertain" : known.has(cause?.code) ? cause.code : "invalid_contract",
            writeAttempts: Number(dispatched),
            stage,
            cause: known.has(cause?.code) ? cause.code : safeBackupFailure(cause).failure,
            confirmedByIndependentRawRead: confirmed
          };
        } finally {
          clearTimeout(timer);
          externalSignal?.removeEventListener("abort", abort);
          controller.abort();
        }
        return copy(summary);
      },
      safeSummary: () => copy(summary),
      clear: () => {
        controller.abort();
        before = null;
        after = null;
        expected = null;
      }
    });
  }
  return __toCommonJS(own_writer_entry_exports);
})();
const execute=async (hooks, functions) => {
    const normalizeAccountMediaState=functions.normalize, mergeAccountMediaStates=functions.merge;
    const state={demo:false,accountId:hooks.candidate.accountId,accountMediaState:normalizeAccountMediaState(hooks.candidate.runtimeProjection),
      accountStateRevision:0,accountStateSyncPromise:null,accountStateReadCache:new Map(),accountStateSyncRetryTimer:null};
    const navigator={locks:{request:hooks.lock}}, console={warn(){}},clearTimeout=()=>{};
    const hasUsableToken=hooks.current, getAccountStateWriterId=()=>hooks.candidate.writerId;
    const accountStateWriterFileName=()=> 'drive-original-account-state-v2-'+getAccountStateWriterId()+'.json';
    const captureAccountStateRequest=()=>({options:{signal:hooks.signal},assert(){if(!hooks.current())throw Object.assign(new Error('stale_owner'),{code:'stale_owner'});},current:hooks.current});
    const findAccountStateFile=hooks.catalog,readRemoteAccountMediaState=hooks.remote,driveFetch=hooks.write;
    const applyMergedAccountMediaState=value=>{state.accountMediaState=value;};
    const persistAccountMediaState=()=>{state.accountMediaState=mergeAccountMediaStates(normalizeAccountMediaState(JSON.parse(hooks.candidate.cacheText)),state.accountMediaState);};
    const refreshFavoritePresentation=()=>{},updateAccountSyncStatus=()=>{};
    const scheduleAccountStateSyncRetry=()=>{},queueAccountStateSync=()=>{};
    async function createAccountStateFile(accountState, options = {}) {
  const boundary = `drive_original_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: accountStateWriterFileName(), mimeType: 'application/json', parents: ['appDataFolder'] });
  const payload = JSON.stringify(normalizeAccountMediaState(accountState));
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', metadata,
    `--${boundary}`, 'Content-Type: application/json', '', payload, `--${boundary}--`, ''
  ].join('\r\n');
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
    ...options, method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
  return response.json();
}

async function updateAccountStateFile(fileId, accountState, options = {}) {
  const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`, {
    ...options, method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeAccountMediaState(accountState))
  });
  return response.json();
}

async function flushAccountMediaState() {
  if (state.demo || !hasUsableToken() || !state.accountId) return;
  if (state.accountStateSyncPromise) return state.accountStateSyncPromise;
  const revisionAtStart = state.accountStateRevision;
  const accountId = state.accountId;
  const owner = captureAccountStateRequest();
  const synchronize = async () => {
    owner.assert();
    const catalog = await findAccountStateFile(owner.options);
    owner.assert();
    const fileId = catalog?.id || null;
    state.accountStateFileId = fileId;
    const remote = await readRemoteAccountMediaState(catalog, owner.options);
    owner.assert();
    // Read local changes inside the writer lock. Devices never PATCH each
    // other's files; the legacy document is a read-only migration input.
    persistAccountMediaState();
    const merged = mergeAccountMediaStates(remote, state.accountMediaState);
    applyMergedAccountMediaState(merged);
    persistAccountMediaState();
    if (fileId) {
      try { await updateAccountStateFile(fileId, merged, owner.options); }
      catch (error) {
        if (error?.status !== 404) throw error;
        owner.assert();
        const created = await createAccountStateFile(merged, owner.options);
        owner.assert();
        state.accountStateFileId = created?.id || null;
      }
      state.accountStateReadCache.delete(fileId);
    } else {
      const created = await createAccountStateFile(merged, owner.options);
      owner.assert();
      state.accountStateFileId = created?.id || null;
    }
    owner.assert();
    state.accountStateLastSyncAt = Date.now();
    state.accountStateSyncError = null;
    state.accountStateSyncRetryCount = 0;
    clearTimeout(state.accountStateSyncRetryTimer);
    state.accountStateSyncRetryTimer = null;
    refreshFavoritePresentation();
  };
  const operation = navigator.locks?.request
    ? navigator.locks.request(`drive-original:account:${accountId}:${getAccountStateWriterId()}`, owner.options, synchronize)
    : synchronize();
  state.accountStateSyncPromise = operation;
  updateAccountSyncStatus();
  try { await operation; }
  catch (error) {
    if (!owner.current() || error?.name === 'AbortError') return;
    state.accountStateSyncError = error;
    console.warn('Account media state could not be synced:', error);
    scheduleAccountStateSyncRetry(error);
  } finally {
    if (state.accountStateSyncPromise === operation) state.accountStateSyncPromise = null;
    if (owner.current()) {
      if (state.accountStateRevision !== revisionAtStart) queueAccountStateSync();
      updateAccountSyncStatus();
    }
  }
}


    await flushAccountMediaState();
    if(state.accountStateSyncError) throw state.accountStateSyncError;
    if(!hooks.current()) throw Object.assign(new Error('stale_owner'),{code:'stale_owner'});
  };return deps=>ownWriterFactory.default(deps,execute);})()