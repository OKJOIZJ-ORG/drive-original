import { DurableObject } from 'cloudflare:workers';
import { DriveJobOwner } from '../../worker/drive-jobs.mjs';

const FOLDER = 'application/vnd.google-apps.folder';
export class TestObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.files = new Map([['memories', { id: 'memories', parents: ['root'], trashed: false, version: '1', mimeType: FOLDER, capabilities: { canAddChildren: true } }]]);
    this.counts = { patches: 0, alarms: 0, calls: 0, maxPerAlarm: 0 };
    this.jobs = new DriveJobOwner({
      sql: ctx.storage.sql, transaction: fn => ctx.storage.transactionSync(fn),
      access: async () => ({ accessToken: 'token', revision: 1 }),
      fetchImpl: async (url, options = {}) => {
        this.counts.calls += 1;
        const parsed = new URL(url);
        const file = this.files.get(parsed.pathname.split('/').pop());
        if (!file) return Response.json({}, { status: 404 });
        if (options.method === 'PATCH') {
          this.counts.patches += 1;
          file.parents = [parsed.searchParams.get('addParents')];
          file.version = String(Number(file.version) + 1);
        }
        return Response.json(file);
      },
    });
  }
  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    const body = await request.json();
    if (op === 'seed') {
      for (const id of body.ids) this.files.set(id, { id, parents: ['inbox'], trashed: false, version: '5', mimeType: 'video/mp4', capabilities: { canMoveItemWithinDrive: true } });
      return Response.json({ ok: true });
    }
    if (op === 'drive') {
      const moved = [...this.files.values()].filter(file => file.parents[0] === 'memories').length;
      return Response.json({ moved, ...this.counts });
    }
    if (op === 'alarms') return Response.json({ alarms: this.counts.alarms, next: await this.ctx.storage.getAlarm() });
    const value = this.jobs[op](body);
    if (op === 'enqueue') await this.ctx.storage.setAlarm(Date.now());
    return Response.json(value);
  }
  async alarm() {
    this.counts.alarms += 1;
    const before = this.counts.calls;
    await this.jobs.runBatch();
    this.counts.maxPerAlarm = Math.max(this.counts.maxPerAlarm, this.counts.calls - before);
    const next = this.jobs.nextRunAt();
    if (next != null) await this.ctx.storage.setAlarm(next);
  }
}
export default { fetch(request, env) { return env.TEST_OBJECT.get(env.TEST_OBJECT.idFromName('account')).fetch(request); } };
