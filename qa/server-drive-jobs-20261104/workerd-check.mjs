// Runs the real DriveJobOwner SQL and alarm chain inside workerd (Cloudflare's runtime)
// against a fake Drive, then checks that the page's absence changes nothing.
// Usage: node qa/server-drive-jobs-20261104/workerd-check.mjs (from the repository root)
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const dir = path.join(root, 'qa/server-drive-jobs-20261104');
const port = 18799;
const dev = spawn(process.execPath, [path.join(root, 'worker/node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', 'wrangler.jsonc', '--port', String(port), '--local', '--persist-to', path.join(dir, '.state')],
  { cwd: dir, stdio: 'ignore' });
const call = async (op, body = {}) => (await fetch(`http://127.0.0.1:${port}/${op}`, { method: 'POST', body: JSON.stringify(body) })).json();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

for (let i = 0; ; i += 1) {
  try { await call('status'); break; } catch { if (i > 120) throw new Error('wrangler dev did not start'); await wait(500); }
}
const job = '11111111-1111-4111-8111-111111111111';
const ids = Array.from({ length: 60 }, (_, index) => `file-${index}`);
await call('seed', { ids });
console.log('enqueue', await call('enqueue', { jobId: job, action: 'move', chunk: 0, target: { id: 'memories', name: '추억' },
  files: ids.map(id => ({ id, parents: ['inbox'], version: '5' })) }));
const started = Date.now();
let status;
for (let i = 0; i < 200; i += 1) {
  await wait(100);
  status = await call('status');
  if (status.jobs[0]?.pending === 0) break;
}
const drive = await call('drive');
console.log('job', status.jobs[0], 'ms', Date.now() - started);
console.log('drive', drive);
console.log('alarms', await call('alarms'));
console.log('cancel', await call('cancel', {}));
dev.kill();
const ok = status.jobs[0]?.confirmed === 60 && drive.moved === 60 && drive.patches === 60 && drive.maxPerAlarm <= 50;
fs.writeFileSync('qa/server-drive-jobs-20261104/workerd-result.json', JSON.stringify({ ok, job: status.jobs[0], drive }, null, 2));
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
