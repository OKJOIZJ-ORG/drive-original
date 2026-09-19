'use strict';
// Independent browser contexts, real app code and real timers. OAuth and Drive
// are synthetic. This is NOT physical-device or live Google-account acceptance.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(process.env.ACCEPTANCE_ROOT || path.join(__dirname, '..'));
const out = path.join(__dirname, process.argv[2] || 'acceptance-browser');
fs.mkdirSync(out, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  const relative = new URL(req.url, 'http://localhost').pathname.replace(/^\/drive-original\//, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'text/plain', 'Cache-Control':'no-store' });
  fs.createReadStream(file).pipe(res);
});
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const thumbnailLink = `data:image/png;base64,${image.toString('base64')}`;
const media = new Map(['photo-A','photo-B','photo-C'].map(id => [id, {
  id, name:id+'.png', mimeType:'image/png', size:String(image.length), parents:['root'],
  thumbnailLink, modifiedTime:'2026-09-17T00:00:00Z', capabilities:{canDownload:true}
}]));
const files = new Map(); const calls = []; const errors = []; const results = [];
let revision = 0, race = false, arrivals = 0, unlock;
const barrier = new Promise(resolve => { unlock = resolve; });
let browser; const clients = [];
const snapshot = page => page.evaluate(() => ({
  favorites:[...accountFavoriteIds(state.accountMediaState)].sort(),
  viewed:[...getViewedIdSet()].sort(),
  cards:[...document.querySelectorAll('.file-card')].map(card => card.dataset.fileId).sort(),
  visible:document.visibilityState, account:state.accountId,
  writer:state.accountStateWriterId, version:APP_VERSION
}));
async function client(index, base) {
  let offline = false;
  const context = await browser.newContext({
    viewport:index ? {width:390,height:844} : {width:1280,height:800},
    isMobile:Boolean(index), hasTouch:Boolean(index)
  });
  await context.route('**/*', async route => {
    const req = route.request(); const url = new URL(req.url()); const id = url.pathname.split('/').pop();
    const method = req.method();
    const reply = (data, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(data) });
    if (url.origin === new URL(base).origin) return route.continue();
    if (url.href === 'https://accounts.google.com/gsi/client') return route.fulfill({contentType:'text/javascript', body:`window.google={accounts:{oauth2:{initTokenClient(o){return{requestAccessToken(){o.callback({access_token:'synthetic-${index}',expires_in:3600,scope:'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata'});}}},revoke(t,done){done?.();}}}};`});
    if (url.hostname !== 'www.googleapis.com') return route.abort();
    // route.fulfill can otherwise bypass the browser's simulated offline
    // transport, accidentally turning an offline replay check into an upload.
    if (offline) return route.abort('internetdisconnected');
    // Never record bearer tokens, cookies, account identities or media names.
    calls.push({client:index, method, path:url.pathname, appData:url.searchParams.get('spaces')==='appDataFolder', at:Date.now()});
    try {
      if (id === 'about') return reply({user:{permissionId:'synthetic-shared-account'}});
      if (url.pathname.includes('/upload/')) {
        if (method === 'POST') {
          const parts = req.postData().split('\r\n\r\n').slice(1).map(p=>p.split('\r\n--')[0]);
          const meta = JSON.parse(parts[0]); const data = JSON.parse(parts[1]);
          assert.deepEqual(meta.parents, ['appDataFolder']);
          assert.match(meta.name, /^drive-original-account-state-v2-/);
          const created = `writer-${++revision}`;
          files.set(created, {...meta,id:created,data,owner:index,modifiedTime:String(revision)});
          return reply({id:created});
        }
        assert.equal(method,'PATCH'); assert.equal(files.get(id)?.owner,index,'only the owning writer can PATCH this document');
        Object.assign(files.get(id), {data:JSON.parse(req.postData()),modifiedTime:String(++revision)});
        return reply({id});
      }
      assert.equal(method,'GET','no real-media mutation API is part of this fixture');
      if (url.searchParams.get('spaces') === 'appDataFolder') {
        const catalog = [...files.values()].map(({data,owner,...metadata})=>metadata);
        if (race) { if (++arrivals === 2) { race=false;unlock(); } await barrier; }
        return reply({files:catalog});
      }
      if (url.searchParams.get('alt') === 'media') {
        if (files.has(id)) return reply(files.get(id).data);
        assert.ok(media.has(id));
        return route.fulfill({status:200,contentType:'image/png',body:image});
      }
      if (id === 'root') return reply({id:'root',name:'내 드라이브'});
      if (media.has(id)) return reply(media.get(id));
      if (id === 'files') return reply({files:[...media.values()]});
      throw new Error('Unexpected fixture API: '+url.pathname);
    } catch (error) { errors.push(error.message); return reply({error:{message:'fixture contract failed'}},500); }
  });
  const page = await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base, {waitUntil:'networkidle'});
  await page.locator('#connectButton').click();
  await page.waitForFunction(()=>state.accountStateLoaded && state.files.length===3 && !state.loadingFiles);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const result = {context,page,async setOffline(value) { offline=value; await context.setOffline(value); }};
  clients.push(result); return result;
}
function record(name, details={}) { results.push({name,status:'passed',...details}); console.log(JSON.stringify(results.at(-1))); }

(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/drive-original/`;
  browser = await chromium.launch({channel:'chrome',headless:true});
  const a = await client(0,base); const b = await client(1,base);
  assert.notEqual(await a.page.evaluate(()=>getAccountStateWriterId()),await b.page.evaluate(()=>getAccountStateWriterId()));
  race=true;
  const start=Date.now();
  await Promise.all([a,b].map(async ({page},index) => {
    const id=index?'photo-B':'photo-A';
    await page.locator(`.file-card-favorite[data-file-id="${id}"]`).click();
    await page.locator(`.file-card[data-file-id="${id}"]`).click();
    await page.waitForFunction(id=>Boolean(state.accountMediaState.viewed[id]),id);
    // The player chrome is intentionally hidden until bottom activation.
    if(index) await page.touchscreen.tap(195,838);
    else await page.mouse.move(640,797);
    await page.locator('#closePlayerButton').click();
  }));
  await Promise.all([a,b].map(({page})=>page.waitForFunction(()=>
    isFavoriteFileId('photo-A') && isFavoriteFileId('photo-B') &&
    state.accountMediaState.viewed['photo-A'] && state.accountMediaState.viewed['photo-B'],null,{timeout:22000})));
  const first=await Promise.all([a,b].map(({page})=>snapshot(page)));
  assert.ok(first.every(state=>state.visible==='visible'));
  assert.equal(files.size,2);
  record('independent simultaneous writes converge in both continuously visible clients',{elapsedMs:Date.now()-start,clients:first});

  await Promise.all([a,b].map(({page})=>page.locator('[data-filter="favorites"]').click()));
  await Promise.all([a,b].map(({page})=>page.waitForFunction(()=>!state.loadingFavorites && state.favoriteFiles.length===2)));
  const unlikeStart=Date.now();
  await a.page.locator('.file-card-favorite[data-file-id="photo-A"]').click();
  await b.page.waitForFunction(()=>!isFavoriteFileId('photo-A') && !state.loadingFavorites &&
    state.favoriteFiles.length===1 && document.querySelectorAll('.file-card').length===1,null,{timeout:22000});
  record('remote unlike removes the visible favorites card without refocus or manual refresh',{elapsedMs:Date.now()-unlikeStart});

  const beforeOffline = JSON.stringify([...files.values()].map(({data})=>data));
  await b.setOffline(true);
  await b.page.waitForFunction(()=>navigator.onLine===false);
  await b.page.locator('.file-card-favorite[data-file-id="photo-B"]').click();
  await b.page.waitForTimeout(800);
  assert.equal(await b.page.evaluate(()=>state.accountStateRefreshTimer),null);
  assert.equal(JSON.stringify([...files.values()].map(({data})=>data)),beforeOffline,'offline edits must not reach the remote store');
  assert.equal(await a.page.evaluate(()=>isFavoriteFileId('photo-B')),true,'the peer must still hold the old remote state while B is offline');
  await b.setOffline(false);
  await a.page.waitForFunction(()=>!isFavoriteFileId('photo-B') && !state.loadingFavorites &&
    state.favoriteFiles.length===0,null,{timeout:22000});
  record('offline edit survives and reaches the other open client after reconnection');

  const writer=await b.page.evaluate(()=>getAccountStateWriterId());
  await b.page.reload({waitUntil:'networkidle'});
  await b.page.waitForFunction(()=>state.accountStateLoaded && !isFavoriteFileId('photo-A') && !isFavoriteFileId('photo-B'));
  assert.equal(await b.page.evaluate(()=>getAccountStateWriterId()),writer);
  assert.equal(files.size,2,'reloading does not create a new document when Web Locks are available');
  record('reload retains account tombstones and the same writer identity');
  assert.deepEqual(errors,[]);
  await a.page.screenshot({path:path.join(out,'desktop-converged.png')});
  await b.page.screenshot({path:path.join(out,'mobile-converged.png')});
})().catch(async error => {
  results.push({name:'acceptance fixture',status:'failed',error:error.stack,
    clients:await Promise.all(clients.map(async ({page})=>{try{return await snapshot(page);}catch{return null;}})),
    writerDocuments:[...files.values()].map(({id,owner,data})=>({id,owner,data}))});
  console.error(error); process.exitCode=1;
}).finally(async () => {
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({
    evidenceClass:'synthetic OAuth/Drive; two isolated browser contexts on one Windows host; not real devices',
    root,results,calls,errors
  },null,2));
  await browser?.close(); server.close();
});
