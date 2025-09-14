import { buildTempoMap, audioTimeToMs } from '../player-utils.js';

test('buildTempoMap convierte ticks a tiempo', () => {
  const midi = { header: { ppq: 480, tempos: [ { ticks: 480, bpm: 60 } ] } };
  const events = buildTempoMap(midi);
  expect(events).toHaveLength(1);
  expect(events[0].time).toBeCloseTo(1);
  expect(events[0].ms).toBeCloseTo(1000);
});

test('audioTimeToMs usa mapa de tempo', () => {
  const midi = { header: { ppq: 480, tempos: [ { time: 0, bpm: 120 }, { time: 1, bpm: 60 } ] } };
  const events = buildTempoMap(midi);
  expect(audioTimeToMs(events, 0.5)).toBeCloseTo(500);
  expect(audioTimeToMs(events, 1.5)).toBeCloseTo(1500);
});
