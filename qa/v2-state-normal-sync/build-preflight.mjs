import fs from 'node:fs/promises';
import esbuild from '../../worker/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
import {buildRecoveryBackupFactory} from '../v2-state-recovery-backup/build-browser-factory.mjs';

// State-only backup uses native Drive reads, so media-worker version discovery
// is not a dependency. Retain the actual activated controller identity fence;
// do not pretend a public script/version file inspects a live worker instance.
const original = await fs.readFile(new URL('../v2-state-recovery-backup/runtime-facade.function.js',import.meta.url),'utf8');
const before = "    && owner.controller?.state === 'activated' && swProof.get()?.version === APP_VERSION";
const after = "    && owner.controller?.state === 'activated'";
if(original.split(before).length!==2) throw new Error('Unexpected maintained facade');
await fs.writeFile(new URL('./recovery-facade.function.js',import.meta.url),original.replace(before,after));
await fs.writeFile(new URL('./recovery-factory.generated.js',import.meta.url),await buildRecoveryBackupFactory());
const verification = await esbuild.build({stdin:{contents:"export {verifyRecoveryReread as default} from '../v2-state-recovery-backup/backup.mjs';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'js'},bundle:true,format:'iife',globalName:'backupVerifier',platform:'browser',target:'es2022',write:false,minify:true,legalComments:'none'});
await fs.writeFile(new URL('./recovery-verifier.generated.js',import.meta.url),`(()=>{${verification.outputFiles[0].text}return backupVerifier.default;})()`);
console.log('State-only preflight sources generated; live worker version is not claimed.');
