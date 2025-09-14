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
