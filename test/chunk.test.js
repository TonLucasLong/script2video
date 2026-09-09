import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, tokenizeWords, classicCues, popCues, wordWeight, normalize } from '../lib/chunk.js';

test('splits on sentence endings', () => {
  assert.deepEqual(splitSentences('One thing. Two things! Three?'),
    ['One thing.', 'Two things!', 'Three?']);
});

test('keeps abbreviations and decimals in one sentence', () => {
  assert.deepEqual(splitSentences('Dr. Reyes charged 3.5 million pesos. He left.'),
    ['Dr. Reyes charged 3.5 million pesos.', 'He left.']);
  assert.equal(splitSentences('Visit example.com today. Now.').length, 2);
});

test('treats a line break as a sentence end', () => {
  assert.deepEqual(splitSentences('No punctuation here\nSecond line'), ['No punctuation here', 'Second line']);
});

test('normalizes curly quotes and the say command prefix', () => {
  assert.equal(normalize('“hi” ‘there’'), '"hi" \'there\'');
  assert.ok(!normalize('[[slnc 500]] hello').includes('[['));
});

test('classic cues stay inside the width and word limits', () => {
  const words = tokenizeWords('one two three four five six seven eight nine ten eleven twelve thirteen fourteen');
  for (const cue of classicCues(words)) {
    assert.ok(cue.length <= 12, 'no more than twelve words');
    assert.ok(cue.join(' ').length <= 62, 'no wider than two lines');
  }
  assert.deepEqual(classicCues(words).flat(), words, 'every word survives');
});

test('pop cues run three or four words and never strand one', () => {
  const words = tokenizeWords('alpha bravo charlie delta echo foxtrot golf hotel india');
  const cues = popCues(words);
  assert.deepEqual(cues.flat(), words);
  for (const cue of cues) assert.ok(cue.length >= 2 && cue.length <= 4, `cue length ${cue.length}`);
});

test('punctuation adds a beat to a word weight', () => {
  assert.ok(wordWeight('word.') > wordWeight('word'));
  assert.equal(wordWeight('a'), 1);
});
