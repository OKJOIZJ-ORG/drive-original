'use strict';
// Local D101 experiment: serves the candidate worktree (real sw.js), an
// experiment SW wrapper and moov-at-end media with Drive-like TTFB/throughput.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const [appRoot, port, ttfbMs = '900', mbps = '10'] = process.argv.slice(2);
const expRoot = __dirname;
const sizes = Object.fromEntries(['small', 'medium'].map(n => [n, fs.statSync(path.join(expRoot, 'media', `${n}.mp4`)).size]));
let log = [];
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const bytesPerTick = Math.round(Number(mbps) * 1024 * 1024 / 100); // 10 ms ticks

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/__exp_log') {
    const body = JSON.stringify(log);
    if (url.searchParams.get('reset')) log = [];
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(body);
  }
  if (url.pathname === '/__exp_sizes.js') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    return res.end(`self.EXP_SIZES=${JSON.stringify(sizes)};`);
  }
  const media = /^\/__exp_media\/(small|medium)\.mp4$/.exec(url.pathname);
  if (media) {
    const file = path.join(expRoot, 'media', `${media[1]}.mp4`), size = sizes[media[1]];
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = m ? Number(m[1]) : 0, end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    const entry = { at: Date.now(), file: media[1], range: req.headers.range || null, start, end, sent: 0, closedEarly: false };
    log.push(entry);
    setTimeout(() => {
      if (req.destroyed) { entry.closedEarly = true; return; }
      res.writeHead(m ? 206 : 200, { 'content-type': 'application/octet-stream', 'content-length': String(end - start + 1),
        ...(m ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}), 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
      const fd = fs.openSync(file, 'r');
      let pos = start;
      const timer = setInterval(() => {
        if (res.destroyed) return finish(true);
        if (pos > end) { res.end(); return finish(false); }
        if (res.writableLength > 4 * bytesPerTick) return; // respect client backpressure
        const n = Math.min(bytesPerTick, end - pos + 1), buf = Buffer.alloc(n);
        fs.readSync(fd, buf, 0, n, pos); pos += n; entry.sent += n; res.write(buf);
      }, 10);
      const finish = early => { clearInterval(timer); fs.closeSync(fd); entry.closedEarly = early; entry.endAt = Date.now(); };
      res.on('close', () => { if (pos <= end && !entry.endAt) finish(true); });
    }, Number(ttfbMs));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  let file = rel.startsWith('/exp/') || /^\/exp-sw-(base|cand)\.js$/.test(rel)
    ? path.join(expRoot, rel.replace(/^\/exp\//, '/').replace(/\/$/, '/index.html'))
    : path.join(appRoot, rel.endsWith('/') ? rel + 'index.html' : rel);
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(Number(port), () => console.log(`exp server ${port} ttfb=${ttfbMs} mbps=${mbps}`));
