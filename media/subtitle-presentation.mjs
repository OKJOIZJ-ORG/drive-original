// One reusable native TextTrack owns at most one bounded subtitle window.
// The reader uses original timestamps; MSE generation shifts stay here.
export const plainVttText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createSubtitlePresentation({reader, textTrack, getClock, isCurrent,
  Cue = globalThis.VTTCue, onError = () => {}}) {
  let disposed = false, generation = 0, windowStart = Infinity, windowEnd = -Infinity;
  let cues = [], pending = null, requested = false, shift = null, failed = false;
  const clear = () => {
    textTrack.mode = 'hidden';
    for (const cue of Array.from(textTrack.cues || [])) textTrack.removeCue(cue);
    textTrack.mode = 'disabled';
    shift = null;
  };
  const current = () => !disposed && isCurrent() === true;
  function paint(clock) {
    if (!current() || !clock.ready || reader.selectedTrackId === null) { clear(); return; }
    const nextShift = clock.elementTime - clock.sourceTime;
    if (!Number.isFinite(nextShift)) { clear(); return; }
    if (shift !== null && Math.abs(shift - nextShift) < 0.000001) return;
    clear(); shift = nextShift;
    for (const cue of cues) {
      const start = Math.max(0, cue.startTime + nextShift), end = cue.endTime + nextShift;
      if (end > start) textTrack.addCue(new Cue(start, end, plainVttText(cue.text)));
    }
    textTrack.mode = 'showing';
  }
  async function update() {
    if (!current() || failed) { clear(); return; }
    const clock = getClock();
    if (!clock.ready || reader.selectedTrackId === null) { clear(); return; }
    if (clock.sourceTime >= windowStart && clock.sourceTime < windowEnd - 1) { paint(clock); return; }
    if (pending) { requested = true; clear(); return; }
    const token = generation, selected = reader.selectedTrackId, at = clock.sourceTime;
    pending = (async () => {
      try {
        const next = await reader.cuesAt(at, {after: 3});
        if (!current() || token !== generation || selected !== reader.selectedTrackId) return;
        cues = next; windowStart = at; windowEnd = at + 3; shift = null;
        paint(getClock());
      } catch (error) {
        if (current() && token === generation) { failed = true; clear(); onError(error); }
      }
    })();
    await pending; pending = null;
    if (requested && current()) { requested = false; void update(); }
  }
  return {
    update,
    select(trackId) {
      generation++; reader.select(trackId); failed = false; cues = []; windowStart = Infinity; windowEnd = -Infinity;
      clear(); void update();
    },
    clear,
    async dispose() { disposed = true; generation++; requested = false; clear(); return reader.dispose(); }
  };
}
