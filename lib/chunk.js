// Turning a pasted script into sentences, words, and caption cues.
// Pure functions, no I/O, so the tests run without ffmpeg or a voice engine.

const ABBREVIATIONS = ['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co', 'e.g', 'i.e', 'a.m', 'p.m'];

// Straight quotes, single spaces, no "[[" (that is a say command prefix).
export function normalize(script) {
  return String(script)
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, ',')
    .replace(/\[\[/g, '[ [')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function splitSentences(script) {
  const text = normalize(script);
  if (!text) return [];
  const out = [];
  let buf = '';

  const flush = () => {
    const s = buf.trim();
    if (s) out.push(s);
    buf = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;

    if (ch === '\n') { flush(); continue; }
    if (!'.!?'.includes(ch)) continue;

    // Run of terminators plus an optional closing quote or bracket.
    while (i + 1 < text.length && '.!?'.includes(text[i + 1])) { buf += text[++i]; }
    if (i + 1 < text.length && `"')]`.includes(text[i + 1])) { buf += text[++i]; }

    const next = text.slice(i + 1);
    if (!/^\s/.test(next) && next !== '') continue;       // 3.5, example.com
    if (!/^\s*["'(\[]?[A-Z0-9]/.test(next)) continue;      // next must look like a new sentence

    const tail = buf.trimEnd().replace(/[."')\]]+$/, '').split(/[\s(]/).pop()?.toLowerCase() ?? '';
    if (ABBREVIATIONS.includes(tail)) continue;            // Dr. Reyes
    if (/^[A-Z]$/.test(tail)) continue;                    // initials: J. R. R.

    flush();
  }
  flush();
  return out;
}

export function tokenizeWords(sentence) {
  return normalize(sentence).split(' ').filter(Boolean);
}

// Weight used both for pacing words inside a sentence and for line breaks.
export function wordWeight(word) {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length;
  const pause = /[.,!?;:]$/.test(word) ? 2 : 0;
  return Math.max(1, letters) + pause;
}

// Style A: readable chunks, up to two lines.
export function classicCues(words, { maxWords = 12, maxChars = 62 } = {}) {
  const cues = [];
  let cur = [];
  let chars = 0;

  const flush = () => { if (cur.length) { cues.push(cur); cur = []; chars = 0; } };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const projected = chars + (cur.length ? 1 : 0) + w.length;
    if (cur.length && (cur.length >= maxWords || projected > maxChars)) flush();
    chars += (cur.length ? 1 : 0) + w.length;
    cur.push(w);
    // A comma or colon late in a cue is a natural place to cut.
    if (cur.length >= Math.ceil(maxWords * 0.6) && /[,;:]$/.test(w)) flush();
  }
  flush();
  return cues;
}

// Style B: 3 or 4 words, no one-word orphan left at the end.
export function popCues(words, { min = 3, max = 4 } = {}) {
  const cues = [];
  let cur = [];

  for (const w of words) {
    cur.push(w);
    const atMin = cur.length >= min;
    const short = w.length <= 3;
    if (cur.length >= max || (atMin && /[.,!?;:]$/.test(w)) || (atMin && !short && cur.length >= min + 1)) {
      cues.push(cur);
      cur = [];
    }
  }
  if (cur.length) cues.push(cur);

  // A single word left at the end would flash on its own. Take one word back
  // off the cue before it, so four-plus-one becomes three-plus-two.
  const last = cues[cues.length - 1];
  const prev = cues[cues.length - 2];
  if (last && prev && last.length === 1) {
    if (prev.length < max) {
      prev.push(last[0]);
      cues.pop();
    } else if (prev.length > min) {
      last.unshift(prev.pop());
    }
  }
  return cues;
}

export function cuesFor(style, words) {
  return style === 'pop' ? popCues(words) : classicCues(words);
}
