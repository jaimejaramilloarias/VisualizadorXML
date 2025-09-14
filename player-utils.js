export function noteXToPixels(boxX, clientWidth, viewBoxWidth) {
  const pxPerUnit = clientWidth / viewBoxWidth;
  return Math.round(boxX * pxPerUnit) + 16;
}

export function computeNoteLeftPx(noteId, svg, cache) {
  if (!svg || !noteId) return undefined;
  let leftPx = cache[noteId];
  if (leftPx !== undefined) return leftPx;
  const target = svg.getElementById(noteId);
  if (!target) return undefined;
  const box = target.getBBox();
  const vb = svg.viewBox.baseVal;
  leftPx = noteXToPixels(box.x, svg.clientWidth, vb.width);
  cache[noteId] = leftPx;
  return leftPx;
}

// ==== Tempo helpers ====
export function buildTempoMap(midi) {
  const tempoEvents = [];
  if (!midi || !midi.header || !midi.header.tempos) return tempoEvents;
  const tempos = midi.header.tempos;
  tempos.forEach(ev => {
    const t = (ev.time != null)
      ? ev.time
      : (ev.ticks / midi.header.ppq) * (60 / ev.bpm);
    tempoEvents.push({ time: t, ms: t * 1000, bpm: ev.bpm });
  });
  return tempoEvents;
}

export function audioTimeToMs(events, sec) {
  if (!events || !events.length) return sec * 1000;
  let prev = events[0];
  for (let i = 1; i < events.length; i++) {
    const next = events[i];
    if (sec < next.time) {
      return prev.ms + (sec - prev.time) * 1000;
    }
    prev = next;
  }
  return prev.ms + (sec - prev.time) * 1000;
}
