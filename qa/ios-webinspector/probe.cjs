// Bounded control-path qualification on one real Safari tab. No app/account actions.
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const origin = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const endpoint = 'http://127.0.0.1:9234';
const privateDir = path.resolve(__dirname, '../../../maintenance/tools/ios-webinspector');
const resultPath = path.join(__dirname, 'control-result.json');
const started = Date.now();
const deadline = started + 45000;
const result = { status: 'FAIL', scope: 'physical-iPhone-Safari-inspector-control-only',
  nativeTouchQualified: false, productAcceptanceQualified: false,
  accountOrMediaActions: false, storageReadOrWritten: false };
let socket, globalObjectId, sequence = 0;
const pending = new Map();

function call(method, params = {}, cleanup = false) {
  const timeout = cleanup ? 4000 : Math.min(8000, deadline - Date.now());
  if (timeout <= 0) return Promise.reject(new Error('Overall probe deadline'));
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, cleanup = false) {
  // WebKit awaits promises from callFunctionOn, not Runtime.evaluate.
  const response = await call('Runtime.callFunctionOn', { objectId: globalObjectId,
    functionDeclaration: `function() { return (${expression}); }`,
    returnByValue: true, awaitPromise: true }, cleanup);
  if (response.exceptionDetails || response.wasThrown) throw new Error('Page evaluation exception');
  return response.result?.value;
}

const cleanupExpression = `(() => {
  const p = globalThis.__driveOriginalIosControlProbe;
  if (p) { clearTimeout(p.timer); p.frame.remove();
    if (p.focus?.isConnected) p.focus.focus({preventScroll:true});
    window.scrollTo(p.x,p.y); delete globalThis.__driveOriginalIosControlProbe; }
  return !document.getElementById('drive-original-ios-control-probe') &&
    !globalThis.__driveOriginalIosControlProbe;
})()`;

(async () => {
  try {
    const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Inspector listing HTTP failure');
    const targets = (await response.json()).filter(x => x.type === 'page' && x.url === `${origin}/`);
    if (targets.length !== 1) throw new Error('Expected exactly one operating Safari root tab');
    const target = targets[0];
    const ws = new URL(target.webSocketDebuggerUrl);
    if (ws.hostname !== '127.0.0.1' || ws.port !== '9234') throw new Error('Unexpected inspector socket');
    socket = new WebSocket(ws);
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      const waiter = pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timer); pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
      else waiter.resolve(message.result || {});
    });
    await once(socket, 'open', { signal: AbortSignal.timeout(5000) });
    // Enable the inspector domains before exercising its input adapter.
    await call('Page.enable');
    await call('Runtime.enable');
    globalObjectId = (await call('Runtime.evaluate', { expression: 'globalThis', returnByValue: false })).result?.objectId;
    if (!globalObjectId) throw new Error('Missing Safari global object handle');
    result.page = await evaluate(`({title:document.title,origin:location.origin,
      userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],
      version:document.body.innerText.match(/\\b1\\.22\\.0(?:-[a-z0-9.]+)?\\b/i)?.[0] || null})`);
    if (result.page.origin !== origin || !/iPhone/.test(result.page.userAgent)) throw new Error('Physical iPhone page identity mismatch');
    result.delivery = await evaluate(`(async () => {
      const r=await fetch('/version.json',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)});
      const j=r.ok?await r.json():{};return {httpStatus:r.status,version:j.version || null};
    })()`);
    if (result.delivery.httpStatus !== 200 || result.delivery.version !== '1.22.0') throw new Error('Operating version readback mismatch');
    const rects = await evaluate(`(() => {
      if (globalThis.__driveOriginalIosControlProbe) throw new Error('Existing probe ownership conflict');
      const frame = document.createElement('div'); frame.id='drive-original-ios-control-probe';
      frame.style.cssText='position:fixed;top:8px;right:8px;width:250px;height:180px;z-index:2147483647;background:white;color:black;font:16px sans-serif;padding:8px;border:2px solid black';
      const p={frame,focus:document.activeElement,x:scrollX,y:scrollY};
      globalThis.__driveOriginalIosControlProbe=p; document.body.append(frame);
      p.timer=setTimeout(() => {frame.remove();delete globalThis.__driveOriginalIosControlProbe},30000);
      const d=document;
      const label=d.createElement('label');label.htmlFor='drive-original-ios-probe-input';label.textContent='Inspector connection check';
      const input=d.createElement('input');input.id='drive-original-ios-probe-input';input.name='probe';input.autocomplete='off';
      input.style.cssText='font-size:16px;min-height:48px;width:220px;box-sizing:border-box';
      const button=d.createElement('button');button.type='button';button.id='probe-button';button.textContent='Check connection';
      button.style.cssText='font-size:16px;min-height:48px;margin-top:8px';
      input.addEventListener('input',e=>{e.stopPropagation();p.inputTrusted=e.isTrusted});
      input.addEventListener('click',e=>e.stopPropagation());
      button.addEventListener('click',e=>{e.stopPropagation();p.clicked=true;p.clickTrusted=e.isTrusted});
      frame.append(label,input,button);
      const point=el=>{const q=el.getBoundingClientRect();return {x:q.left+q.width/2,y:q.top+q.height/2}};
      return {input:point(input),button:point(button)};
    })()`);
    await call('Page.getFrameTree');
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', ...rects.input });
    await call('Input.insertText', { text: 'ios-usb-control-ok' });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', ...rects.button });
    result.input = await evaluate(`(() => {const p=globalThis.__driveOriginalIosControlProbe;
      return {textMatched:p.frame.querySelector('input').value==='ios-usb-control-ok',
        clicked:p.clicked===true,inputTrusted:p.inputTrusted===true,clickTrusted:p.clickTrusted===true}})()`);
    if (!result.input.textMatched || !result.input.clicked) throw new Error('Inspector input/click did not land');
    result.scratchRemoved = await evaluate(cleanupExpression, true);
    if (!result.scratchRemoved) throw new Error('Scratch cleanup failed');
    const image = await call('Page.captureScreenshot', { format: 'png' });
    const bytes = Buffer.from(image.data, 'base64');
    if (bytes.length < 100 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('Screenshot PNG validation failed');
    fs.writeFileSync(path.join(privateDir, 'safari-control-private.png'), bytes);
    result.screenshotBytes = bytes.length;
    result.status = 'PASS';
  } catch (error) {
    result.failure = String(error.message);
    fs.writeFileSync(path.join(privateDir, 'probe-failure-private.log'), String(error.stack));
  } finally {
    if (socket?.readyState === WebSocket.OPEN) {
      try { result.scratchRemoved = await evaluate(cleanupExpression, true); }
      catch { result.scratchRemoved = false; result.status = 'FAIL'; }
      if (globalObjectId) {
        try { await call('Runtime.releaseObject', { objectId: globalObjectId }, true); result.objectReleased = true; }
        catch { result.objectReleased = false; result.status = 'FAIL'; }
      }
      socket.close();
      try { await once(socket, 'close', { signal: AbortSignal.timeout(2000) }); result.socketClosed = true; }
      catch { result.socketClosed = false; result.status = 'FAIL'; }
    }
    result.elapsedMs = Date.now() - started;
    result.observedAt = new Date().toISOString();
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  }
})();
