import test from 'node:test';
import assert from 'node:assert/strict';
import { heuristicScenes, normalizeScenes, keyPhrase } from '../lib/scenes.js';

const sentences = ['The barista pulls a shot at six in the morning.', 'Nobody sees that part.',
  'They only see the queue at eight.', 'That queue took two years.'];

test('the heuristic covers every sentence in order', () => {
  const scenes = heuristicScenes(sentences);
  assert.equal(scenes[0].startSentence, 0);
  assert.equal(scenes.at(-1).endSentence, sentences.length - 1);
  for (let i = 1; i < scenes.length; i++) {
    assert.equal(scenes[i].startSentence, scenes[i - 1].endSentence + 1, 'no gaps, no overlaps');
  }
  for (const s of scenes) {
    assert.ok(s.visual.startsWith('B-roll of '));
    assert.ok(s.onScreenText.split(' ').length <= 6);
  }
});

test('the key phrase skips filler words', () => {
  const phrase = keyPhrase('The barista pulls a shot at six in the morning.');
  assert.ok(!phrase.split(' ').includes('the'));
  assert.ok(phrase.length > 0);
});

test('bad model output is clamped rather than trusted', () => {
  const fixed = normalizeScenes([
    { scene: 9, startSentence: 2, endSentence: 99, visual: 'a {weird} visual', onScreenText: 'one two three four five six seven eight' },
    { scene: 1, startSentence: 0, endSentence: 1, visual: 'first', onScreenText: 'start' },
  ], sentences.length);

  assert.equal(fixed[0].visual, 'first', 'sorted back into order');
  assert.deepEqual(fixed.map((s) => s.scene), [1, 2], 'renumbered');
  assert.equal(fixed[1].endSentence, sentences.length - 1, 'clamped to the last sentence');
  assert.ok(!fixed[1].visual.includes('{'), 'override braces stripped');
  assert.equal(fixed[1].onScreenText.split(' ').length, 6, 'on-screen text is trimmed');
});

test('empty or unusable output falls through to null', () => {
  assert.equal(normalizeScenes([], 4), null);
  assert.equal(normalizeScenes(null, 4), null);
  assert.equal(normalizeScenes([{ visual: '' }], 4), null);
});
