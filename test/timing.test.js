import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutSentences, totalDuration, distributeWords, timeCues, LEAD_IN, GAP, TAIL } from '../lib/timing.js';

test('sentences are laid out with a lead-in and a gap between them', () => {
  const layout = layoutSentences([2, 3]);
  assert.equal(layout[0].start, LEAD_IN);
  assert.equal(layout[0].end, 2.25);
  assert.equal(layout[1].start, 2.25 + GAP);
});

test('the total matches what the audio filter builds', () => {
  const durations = [1.5, 2.25, 0.75];
  const expected = LEAD_IN + durations.reduce((a, d) => a + d + GAP, 0) + TAIL;
  assert.ok(Math.abs(totalDuration(durations) - expected) < 1e-9);
});

test('words fill the sentence exactly and never overlap', () => {
  const words = distributeWords(['the', 'quick', 'brown', 'fox'], 1, 3);
  assert.equal(words[0].start, 1);
  assert.equal(words.at(-1).end, 3);
  for (let i = 0; i < words.length - 1; i++) {
    assert.equal(words[i].end, words[i + 1].start, 'contiguous');
    assert.ok(words[i].end > words[i].start, 'never zero length');
  }
});

test('a longer word gets more time than a shorter one', () => {
  const [short, long] = distributeWords(['a', 'extraordinary'], 0, 10);
  assert.ok(long.end - long.start > short.end - short.start);
});

test('one word takes the whole sentence', () => {
  assert.deepEqual(distributeWords(['hello'], 0, 2), [{ text: 'hello', start: 0, end: 2 }]);
});

test('cues inherit the times of the words inside them', () => {
  const words = distributeWords(['one', 'two', 'three', 'four'], 0, 4);
  const cues = timeCues([['one', 'two'], ['three', 'four']], words);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, words[0].start);
  assert.equal(cues[0].end, words[1].end);
  assert.equal(cues[1].start, words[2].start);
  assert.equal(cues[1].end, 4);
});
