import MidiPkg from '@tonejs/midi';
const { Midi } = MidiPkg;

test('genera y analiza MIDI simple', () => {
  const m = new Midi();
  const track = m.addTrack();
  track.addNote({ midi: 60, time: 0, duration: 0.5 });
  const u8 = m.toArray();
  const parsed = new Midi(u8);
  expect(parsed.tracks[0].notes).toHaveLength(1);
  expect(parsed.duration).toBeGreaterThan(0);
});
