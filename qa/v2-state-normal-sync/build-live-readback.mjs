import fs from 'node:fs/promises';

// Preserve the executed rc.10 backup sources. The rc.11 readback changes only
// their explicit runtime fence; account/controller/idle/whole-state guards stay.
const oldFacade = await fs.readFile(new URL('./recovery-facade.function.js', import.meta.url), 'utf8');
const before = "APP_VERSION === '1.22.0-rc.10'";
if (oldFacade.split(before).length !== 2) throw new Error('Unexpected runtime fence');
await fs.writeFile(new URL('./live-readback-facade.function.js', import.meta.url), oldFacade.replace(before, "APP_VERSION === '1.22.0-rc.11'"));
console.log('rc.11 state-only readback generated; no service-worker VERSION proof claimed.');
