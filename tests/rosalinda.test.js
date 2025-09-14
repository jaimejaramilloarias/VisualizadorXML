import fs from 'fs';
import { JSDOM } from 'jsdom';

test('Rosalinda.musicxml se carga y contiene notas', () => {
  const xml = fs.readFileSync('Rosalinda.musicxml', 'utf8');
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  const notes = dom.window.document.getElementsByTagName('note');
  expect(notes.length).toBeGreaterThan(0);
});
