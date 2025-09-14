import { computeNoteLeftPx } from '../player-utils.js';
import { JSDOM } from 'jsdom';

test('calcula y cachea posición de nota', () => {
  const dom = new JSDOM('<svg viewBox="0 0 100 50"><rect id="n1"></rect></svg>');
  const svg = dom.window.document.querySelector('svg');
  Object.defineProperty(svg, 'clientWidth', { value: 200 });
  Object.defineProperty(svg, 'viewBox', { value: { baseVal: { width: 100 } } });
  const rect = dom.window.document.getElementById('n1');
  rect.getBBox = () => ({ x: 10, y:0, width:5, height:5 });
  const cache = {};
  const x1 = computeNoteLeftPx('n1', svg, cache);
  expect(x1).toBe(36);
  expect(cache.n1).toBe(36);
  // segunda llamada usa cache
  rect.getBBox = () => ({ x: 20 });
  const x2 = computeNoteLeftPx('n1', svg, cache);
  expect(x2).toBe(36);
});
