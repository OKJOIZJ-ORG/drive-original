import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const runtimePath = fileURLToPath(new URL('../media/mediabunny-q1.mjs', import.meta.url));
test('published media module lowers explicit resource declarations for its Safari syntax target', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../media/mediabunny-q1-build.json', import.meta.url)));
  assert.deepEqual(manifest.target, ['es2022', 'safari17']);
  assert.doesNotMatch(fs.readFileSync(runtimePath, 'utf8'), /\b(?:await\s+)?using\s+[A-Za-z_$][\w$]*\s*=/);
});

test('lowered custom RGB conversion disposes after awaited success and failure without native Symbol.dispose', () => {
  // A fresh VM realm supplies the missing well-known symbol independently of Node's host Symbol.
  // This probes generated runtime semantics, not real Safari/WebCodecs or codec acceptance.
  const program = `
    const vm = require('node:vm'), fs = require('node:fs'), assert = require('node:assert/strict');
    (async () => {
      const context = vm.createContext({TextEncoder, TextDecoder, URL, performance, assert});
      vm.runInContext(
        'const NativeSymbol = Symbol; globalThis.Symbol = function Symbol(description) { return NativeSymbol(description); };' +
        'for (const name of Object.getOwnPropertyNames(NativeSymbol)) {' +
        'if (!["dispose", "asyncDispose", "prototype", "name", "length"].includes(name)) Object.defineProperty(Symbol, name, Object.getOwnPropertyDescriptor(NativeSymbol, name)); }' +
        'Symbol.prototype = NativeSymbol.prototype; assert.equal(Symbol.dispose, undefined);', context);
      const module = new vm.SourceTextModule(fs.readFileSync(process.argv[1], 'utf8'), {context});
      await module.link(() => { throw Error('Unexpected external dependency'); });
      await module.evaluate();
      context.media = module.namespace;
      const result = await vm.runInContext(
        '(' + async function () {
          const {VideoSample, VideoSampleResource, VideoSampleColorSpace} = media;
          assert.equal(typeof Symbol.dispose, 'symbol');
          const observations = [];
          for (const outcome of ['success', 'copy-error', 'invalid-format']) {
            let rgbClosed = 0, sourceClosed = 0, awaited = false;
            class Resource extends VideoSampleResource {
              getFormat() { return 'I420'; }
              getCodedWidth() { return 1; }
              getCodedHeight() { return 1; }
              getSquarePixelWidth() { return 1; }
              getSquarePixelHeight() { return 1; }
              getColorSpace() { return new VideoSampleColorSpace(); }
              close() { sourceClosed++; }
              async toRgbSample(init) {
                const rgb = new VideoSample(new Uint8Array([1, 2, 3, 4]), {
                  ...init, format: outcome === 'invalid-format' ? 'I420' : 'RGBA', codedWidth: 1, codedHeight: 1});
                const close = rgb.close;
                rgb.close = function () { rgbClosed++; close.call(this); };
                rgb.copyTo = async () => {
                  await Promise.resolve();
                  assert.equal(rgbClosed, 0, 'Temporary sample must remain owned until asynchronous copying settles.');
                  awaited = true;
                  if (outcome === 'copy-error') throw Error('copy failed');
                  return [{offset: 0, stride: 4}];
                };
                return rgb;
              }
            }
            const source = new VideoSample(new Resource(), {timestamp: 0});
            if (outcome === 'success') assert.deepEqual(await source.copyTo(new Uint8Array(4), {format: 'RGBA'}), [{offset: 0, stride: 4}]);
            else await assert.rejects(source.copyTo(new Uint8Array(4), {format: 'RGBA'}), outcome === 'copy-error' ? /copy failed/ : /expected to have an RGB format/);
            assert.equal(rgbClosed, 1);
            assert.equal(sourceClosed, 0, 'Conversion does not retire the independently owned input sample.');
            assert.equal(awaited, outcome !== 'invalid-format');
            source.close();
            assert.equal(sourceClosed, 1);
            observations.push({outcome, rgbClosed, sourceClosed, awaited});
          }
          return observations;
        }.toString() + ')()', context);
      console.log(JSON.stringify(result));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', '-e', program, runtimePath], {encoding: 'utf8'}).trim());
  assert.equal(result.length, 3);
});
