'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const expression = fs.readFileSync(path.join(__dirname, 'pc-seek-targets.expression.js'), 'utf8');
const binding = JSON.parse(fs.readFileSync(path.join(__dirname, 'binding.json'), 'utf8'));
function fixture(options = {}) {
  const controller = { state: 'activated' }, timers = new Map();
  const target = { id: 'PRIVATE_ID', name: 'PRIVATE_NAME', size: '100', version: '9' };
  const barAttrs = Object.prototype.hasOwnProperty.call(options, 'initialRole')
    ? options.initialRole === null ? {} : { role: options.initialRole } : { role: 'slider' };
  const original = { originalControl: true, isConnected: true }, bar = { clientLeft: 1, children: [original],
    hasAttribute: key => Object.prototype.hasOwnProperty.call(barAttrs, key), getAttribute: key => barAttrs[key] ?? null,
    setAttribute(key, value) { if (options.restoreThrows && value !== 'group') throw Error('RESTORE'); barAttrs[key] = value; },
    removeAttribute(key) { if (options.restoreThrows) throw Error('RESTORE'); delete barAttrs[key]; },
    parentElement: null, getBoundingClientRect: () => ({ left: 100.25, top: 600, width: 800, height: 16 }),
    appendChild(node) { this.children.push(node); node.parentElement = this; node.isConnected = true; node.offsetParent = this; } };
  const video = { paused: true, duration: 601 }, stats = { duration: 601, phase: 'ready', disposed: false };
  const owner = { kind: 'ts', player: { stats: () => stats }, controller: { signal: { aborted: false } } };
  const context = { APP_VERSION: binding.version, q1Playback: owner, el: { seekBarContainer: bar }, innerWidth: 1280, innerHeight: 900,
    navigator: { serviceWorker: { controller } }, getActiveMediaElement: () => video, isCurrentMediaEvent: v => v === video,
    state: { selected: target, accountId: 'PRIVATE_ACCOUNT', authAccountKey: 'PRIVATE_KEY', authStatus: 'online',
      authGeneration: 1, driveSessionGeneration: 1, mediaSession: 2 },
    window: { __resumeReplayTarget30: target, __resumeSwProof: { get: () => ({ ...binding, controller }) } },
    document: { visibilityState: 'visible', createElement(tag) {
      if (options.constructionThrows && bar.children.length === 2) throw Error('CONSTRUCTION');
      assert.equal(tag, 'button'); const attrs = {}, node = { style: {}, isConnected: false,
        setAttribute: (key, value) => { attrs[key] = value; }, getAttribute: key => attrs[key],
        getBoundingClientRect() { return { left: bar.getBoundingClientRect().left + bar.clientLeft + parseFloat(this.style.left) - 4,
          top: 604, width: 8, height: 8 }; },
        remove() { if (options.removeThrows) throw Error('REMOVE'); this.isConnected = false;
          bar.children = bar.children.filter(child => child !== this); this.parentElement = null; } };
      return node;
    }, elementFromPoint(x) { if (options.blocked) return original;
      return bar.children.find(node => node !== original && Math.abs(node.getBoundingClientRect().left + 4 - x) < .01) || bar; } },
    getComputedStyle: node => ({ position: node === bar ? 'relative' : 'absolute', display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
    setTimeout: (fn, ms) => { timers.set(1, { fn, ms }); return 1; }, clearTimeout: id => timers.delete(id) };
  vm.createContext(context); let installed, error;
  try { installed = vm.runInContext(expression, context); }
  catch (caught) { if (!options.allowFailure) throw caught; error = caught; }
  return { context, bar, original, installed, error, api: context.window.__rc32PcSeekTargets, timers };
}
test('50/90 native click centers align with the unchanged border-box slider and expose only QA labels', () => {
  const f = fixture(), r = f.api.read();
  assert.equal(r.targets.length, 2);
  for (const row of r.targets) { assert.equal(row.available, true); assert.equal(row.distanceSeconds, 0); assert.equal(row.exactHit, true); }
  assert.deepEqual(Array.from(r.targets, row => row.label), ['RC32 QA seek50', 'RC32 QA seek90']);
  assert.equal(r.targets[0].targetSeconds, 300.5); assert.equal(r.targets[1].targetSeconds, 540.9);
  assert(!JSON.stringify(r).includes('PRIVATE'));
  assert(!/dispatchEvent|addEventListener|\.click\(|\.play\(|\.pause\(|\.currentTime\s*=/.test(expression));
  f.api.stop();
});
test('owner/content/account/source drift, hidden control and changed geometry never expose a qualified hit', () => {
  for (const kind of ['owner', 'target', 'account', 'source', 'hidden', 'geometry']) {
    const f = fixture();
    if (kind === 'owner') f.context.q1Playback = { ...f.context.q1Playback };
    if (kind === 'target') f.context.state.selected = { id: 'different' };
    if (kind === 'account') f.context.state.authGeneration++;
    if (kind === 'source') f.context.APP_VERSION = 'wrong';
    if (kind === 'hidden') f.bar.hidden = true;
    if (kind === 'geometry') f.bar.children[1].style.left = '500px';
    assert.equal(f.api.read().targets[0].available, false, kind); f.api.stop();
  }
  assert.throws(() => fixture({ blocked: true }), /PC_TARGETS_NOT_EXPOSED/);
});
test('stop/deadline remove only exact owned markers; repeat stop preserves cleanup failure', () => {
  const f = fixture(); f.timers.get(1).fn();
  assert.equal(f.api.read().disposed, true); assert.equal(f.bar.children.length, 1); assert.equal(f.bar.children[0], f.original);
  assert.equal(f.api.stop().cleanup.markersRemoved, true); assert.equal(f.timers.size, 0);
  const g = fixture({ removeThrows: true }); assert.equal(g.api.stop().cleanup.markersRemoved, false);
  assert.equal(g.api.stop().cleanup.markersRemoved, false); assert.equal(g.api.stop().cleanup.timerCleared, true);
});

test('temporary group exposes AX instrumentation and stop/deadline restore exact role including absence', () => {
  for (const initialRole of ['slider', '', null]) {
    const f = fixture({ initialRole });
    assert.equal(f.bar.getAttribute('role'), 'group');
    assert.equal(f.api.read().axTargetingInstrumentation, true);
    assert.equal(f.api.read().productAccessibilityProof, false);
    assert.equal(f.api.read().fences.axRoleCurrent, true);
    if (initialRole === null) f.timers.get(1).fn(); else f.api.stop();
    assert.equal(f.bar.hasAttribute('role'), initialRole !== null);
    assert.equal(f.bar.getAttribute('role'), initialRole);
    assert.equal(f.api.stop().cleanup.roleRestored, true);
    assert.equal(f.api.stop().cleanup.roleIntegrity, true);
    assert.equal(f.bar.children[0], f.original);
  }
});

test('construction failure after a partial marker install restores the role and retains safe cleanup', () => {
  for (const initialRole of ['slider', null]) {
    const f = fixture({ initialRole, constructionThrows: true, allowFailure: true });
    assert.match(f.error.message, /CONSTRUCTION/);
    assert.equal(f.bar.getAttribute('role'), initialRole);
    assert.equal(f.bar.children.length, 1);
    assert.equal(f.api.read().disposed, true);
    assert.equal(f.api.read().cleanup.roleRestored, true);
    assert.equal(f.api.read().cleanup.markersRemoved, true);
    assert.equal(f.timers.size, 0);
    assert(!JSON.stringify(f.api.read()).includes('PRIVATE'));
  }
});

test('observed role drift invalidates targets permanently and cleanup still restores the saved role', () => {
  const f = fixture(); f.bar.setAttribute('role', 'slider');
  assert.equal(f.api.read().fences.axRoleCurrent, false);
  assert.equal(f.api.read().targets[0].available, false);
  f.bar.setAttribute('role', 'group');
  assert.equal(f.api.read().targets[0].available, false);
  assert.equal(f.api.stop().cleanup.roleRestored, true);
  assert.equal(f.api.stop().cleanup.roleIntegrity, false);
  assert.equal(f.bar.getAttribute('role'), 'slider');
});

test('restoration failure remains sticky on repeat stop, including construction error and absent role', () => {
  for (const initialRole of ['slider', null]) {
    for (const constructionThrows of [false, true]) {
      const f = fixture({ initialRole, restoreThrows: true, constructionThrows, allowFailure: constructionThrows });
      const first = f.api.stop(); assert.equal(first.cleanup.roleRestored, false);
      assert.equal(first.cleanup.markersRemoved, true);
      assert.equal(first.cleanup.timerCleared, true);
      assert.equal(f.api.stop().cleanup.roleRestored, false);
      assert.equal(f.bar.getAttribute('role'), 'group');
    }
  }
});
