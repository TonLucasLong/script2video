// Where every sentence and every word sits on the timeline.
// The OS voices give us a duration per sentence and nothing finer, so words
// inside a sentence are spread by how long they take to say (letters, plus a
// beat for punctuation). Swap in an engine with real word timestamps and
// distributeWords is simply skipped.
import { wordWeight } from './chunk.js';

export const LEAD_IN = 0.25;   // silence before the first word
export const GAP = 0.18;       // breath between sentences
export const TAIL = 0.4;       // silence after the last word

export function layoutSentences(durations, { leadIn = LEAD_IN, gap = GAP } = {}) {
  let t = leadIn;
  return durations.map((d) => {
    const start = t;
    t += d + gap;
    return { start, end: start + d };
  });
}

export function totalDuration(durations, { leadIn = LEAD_IN, gap = GAP, tail = TAIL } = {}) {
  return leadIn + durations.reduce((sum, d) => sum + d + gap, 0) + tail;
}

// Times are centisecond-aligned because that is the resolution ASS stores.
const cs = (sec) => Math.round(sec * 100) / 100;

export function distributeWords(words, start, end) {
  if (!words.length) return [];
  const span = Math.max(0.01, end - start);
  const weights = words.map(wordWeight);
  const total = weights.reduce((a, b) => a + b, 0);

  const out = [];
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    const wStart = start + (span * acc) / total;
    acc += weights[i];
    const wEnd = start + (span * acc) / total;
    out.push({ text: words[i], start: cs(wStart), end: cs(wEnd) });
  }
  // Snap so each word ends exactly where the next begins, and none is empty.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end <= out[i].start) out[i].end = cs(out[i].start + 0.01);
    out[i + 1].start = out[i].end;
  }
  const last = out[out.length - 1];
  last.end = Math.max(cs(end), cs(last.start + 0.01));
  return out;
}

// Group already-timed words into cues, keeping the cue list contiguous.
export function timeCues(cues, words) {
  const timed = [];
  let i = 0;
  for (const cue of cues) {
    const slice = words.slice(i, i + cue.length);
    i += cue.length;
    if (!slice.length) continue;
    timed.push({
      words: slice,
      text: cue.join(' '),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }
  return timed;
}
