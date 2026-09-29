/* MPL-2.0; see audio-codec.LICENSE.txt. */
import { createAudioRuntime, audioWindow, AUDIO_OUTPUT_STATUS } from './audio-runtime.mjs';
// Pass the pinned core explicitly. This module has no QA or media-library import.
export function registerAudioCompatibility(core, { runtime = createAudioRuntime(), mapping, signal } = {}) {
  if (!core?.CustomAudioDecoder || !core?.AudioSample || !core?.registerDecoder) throw Error('AUDIO_CORE_REQUIRED');
  const window = audioWindow(mapping), sessions = new Set();
  let disposed = false;
  class CompatibilityDecoder extends core.CustomAudioDecoder {
    static supports(codec, config) {
      return !disposed && ['ac3', 'eac3'].includes(codec) && config?.numberOfChannels === 2
        && config.sampleRate === 48000 && config.codec === (codec === 'ac3' ? 'ac-3' : 'ec-3');
    }
    async init() {
      try {
        if (disposed || this.closed) throw Error('AUDIO_REGISTRATION_CLOSED');
        this.session = runtime.createSession(this.config, window, { signal }); sessions.add(this.session);
        await this.session.ready;
        if (disposed) await this.close();
      } catch (failure) { await this.fail(failure); }
    }
    async fail(failure) {
      if (this.failure) return;
      this.failure = failure;
      await this.close();
      // Mediabunny's serialized custom calls must remain fulfilled; a rejected
      // chain skips its queued close. Surface the real terminal error via its
      // documented callback, after releasing the native context.
      this.onError(failure);
    }
    async decode(packet) {
      if (this.failure || this.closed || disposed) return;
      try {
        const pcm = await this.session.decode(packet);
        if (disposed || this.failure) return;
        const sample = new core.AudioSample(pcm);
        try { this.onSample(sample); } catch (failure) { sample.close(); throw failure; }
      } catch (failure) { await this.fail(failure); }
    }
    async flush() {
      if (this.failure || this.closed || disposed) return;
      try { await this.session?.flush(); } catch (failure) { await this.fail(failure); }
    }
    async close() {
      this.closed = true;
      const session = this.session;
      if (session) { await session.close(); sessions.delete(session); }
    }
  }
  core.registerDecoder(CompatibilityDecoder);
  return Object.freeze({ status: AUDIO_OUTPUT_STATUS, window, metrics: runtime.metrics,
    async dispose() {
      disposed = true;
      const reports = await Promise.all([...sessions].map(session => session.close())); sessions.clear();
      return Object.freeze({ settled: reports.every(x => x.settled) && runtime.metrics().liveContexts === 0,
        metrics: runtime.metrics() });
    } });
}
