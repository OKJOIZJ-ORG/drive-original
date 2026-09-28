import { fileURLToPath } from 'node:url';
import esbuild from '../../worker/node_modules/esbuild/lib/main.js';

// Deterministic PUBLIC source. No generated files or private arguments. Evaluate
// in a candidate lexical runtime, then inject actual normalize/merge and guards.
export async function buildRecoveryBackupFactory() {
  const result = await esbuild.build({
    stdin: { contents: "export {createRecoveryBackupHandle as default} from './handle.mjs';",
      resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'recovery-public-entry.mjs', loader: 'js' },
    bundle: true, treeShaking: true, format: 'iife', globalName: 'recoveryFactory',
    platform: 'browser', target: 'es2022', minify: true, write: false, legalComments: 'none'
  });
  return `(()=>{${result.outputFiles[0].text}return recoveryFactory.default;})()`;
}
