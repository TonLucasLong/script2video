import test from 'node:test';
import assert from 'node:assert/strict';
import { assTime, escapeText, wrapTwoLines, buildAss } from '../lib/ass.js';

const sentences = [{ start: 0.25, end: 2.25 }];
const cues = [{
  text: 'one two three',
  start: 0.25, end: 2.25,
  words: [
    { text: 'one', start: 0.25, end: 1 },
    { text: 'two', start: 1, end: 1.6 },
    { text: 'three', start: 1.6, end: 2.25 },
  ],
}];
const scenes = [{ scene: 1, startSentence: 0, endSentence: 0, visual: 'B-roll of a keyboard', onScreenText: 'Type it out' }];

test('times use centiseconds', () => {
  assert.equal(assTime(0), '0:00:00.00');
  assert.equal(assTime(3661.5), '1:01:01.50');
  assert.equal(assTime(-1), '0:00:00.00');
});

test('override characters cannot survive in caption text', () => {
  assert.equal(escapeText('a {tag} and a \\break'), 'a (tag) and a /break');
  assert.equal(escapeText('two\nlines'), 'two lines');
});

test('a long cue breaks into two balanced lines', () => {
  assert.equal(wrapTwoLines(['short', 'line'], 30), 'short line');
  const wrapped = wrapTwoLines('one two three four five six seven'.split(' '), 12);
  assert.ok(wrapped.includes('\\N'));
  const [a, b] = wrapped.split('\\N');
  assert.ok(Math.abs(a.length - b.length) < 8, 'lines are roughly even');
});

test('classic writes one event per cue', () => {
  const out = buildAss({ style: 'classic', sentences, cues, scenes });
  const events = out.split('\n').filter((l) => l.startsWith('Dialogue') && l.includes(',Classic,'));
  assert.equal(events.length, 1);
  assert.ok(out.includes('Style: Classic,Poppins'));
  assert.ok(!out.includes('&H00FFFF&'), 'no word highlight in the classic style');
});

test('pop writes one event per word and highlights only that word', () => {
  const out = buildAss({ style: 'pop', sentences, cues, scenes });
  const events = out.split('\n').filter((l) => l.startsWith('Dialogue') && l.includes(',Pop,'));
  assert.equal(events.length, 3);
  assert.ok(events[0].includes('{\\1c&H00FFFF&}ONE'), 'first word is yellow first');
  assert.ok(events[1].includes('ONE {\\1c&H00FFFF&}TWO'), 'then the second');
  assert.equal(events.filter((e) => e.includes('fscx78')).length, 1, 'the pop-in runs once per cue');
});

test('scene labels run back to back with no blink between them', () => {
  const twoScenes = [
    { scene: 1, startSentence: 0, endSentence: 0, visual: 'first shot', onScreenText: 'one' },
    { scene: 2, startSentence: 1, endSentence: 1, visual: 'second shot', onScreenText: 'two' },
  ];
  const timed = [{ start: 0.25, end: 2 }, { start: 2.18, end: 4 }];
  const labels = buildAss({ style: 'classic', sentences: timed, cues, scenes: twoScenes })
    .split('\n').filter((l) => l.includes(',SceneLabel,'));
  assert.equal(labels.length, 2);
  assert.ok(labels[0].includes('0:00:02.18'), 'the first label holds until the second scene starts');
});

test('scene labels ride on their own layer in both styles', () => {
  for (const style of ['classic', 'pop']) {
    const label = buildAss({ style, sentences, cues, scenes }).split('\n').find((l) => l.includes(',SceneLabel,'));
    assert.ok(label.startsWith('Dialogue: 1,'), 'layer 1, above the captions');
    assert.ok(label.includes('SCENE 1'));
    assert.ok(label.includes('B-roll of a keyboard'));
  }
});
