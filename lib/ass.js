// The subtitle file. One .ass carries the caption style the user picked plus
// the scene labels, and ffmpeg burns it straight into the frame.
// Colours in ASS are &HAABBGGRR: alpha 00 is opaque, FF is invisible.

export const WIDTH = 1080;
export const HEIGHT = 1920;

export const STYLES = {
  classic: {
    label: 'Classic',
    blurb: 'White text in a soft black bar at the bottom, the way a documentary or a news clip does it. Whole phrases at a time.',
  },
  pop: {
    label: 'Pop',
    blurb: 'Big condensed capitals in the middle of the frame, three or four words at a time, the word being spoken turns yellow.',
  },
};

// H:MM:SS.cc, the only time format ASS accepts.
export function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

// Braces open an override block and a backslash starts a tag, so neither can
// survive in plain caption text.
export function escapeText(text) {
  return String(text)
    .replace(/\\/g, '/')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function header() {
  return [
    '[Script Info]',
    '; Written by script2video',
    'ScriptType: v4.00+',
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Bottom bar. BorderStyle 3 draws the box from BackColour and Outline is its
    // padding. The box is lifted off pure black so the bar is visible on a black canvas.
    'Style: Classic,Poppins,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H73262626,-1,0,0,0,100,100,0,0,3,14,0,2,70,70,300,1',
    // Dead centre, thick outline, no box. SecondaryColour is unused here.
    'Style: Pop,Anton,116,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,9,4,5,80,80,0,1',
    // The scene suggestion, small and quiet along the top.
    'Style: SceneLabel,Poppins,36,&H00D0D0D0,&H00D0D0D0,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,3,10,0,8,50,50,90,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');
}

function dialogue(layer, start, end, style, text) {
  return `Dialogue: ${layer},${assTime(start)},${assTime(end)},${style},,0,0,0,,${text}`;
}

// Two roughly equal lines once a cue is too wide for one.
export function wrapTwoLines(words, maxChars) {
  const text = words.join(' ');
  if (text.length <= maxChars) return text;
  const target = text.length / 2;
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ').length;
    const gap = Math.abs(left - target);
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  return `${words.slice(0, best).join(' ')}\\N${words.slice(best).join(' ')}`;
}

// A cue stays up through the breath before the next one, so nothing blinks
// off during the short silence between sentences.
const HOLD = 0.4;

function holdUntil(cues, i) {
  const cue = cues[i];
  const next = cues[i + 1];
  if (!next) return cue.end;
  return Math.min(Math.max(cue.end, next.start), cue.end + HOLD);
}

function classicEvents(cues) {
  return cues.map((cue, i) => {
    const text = wrapTwoLines(cue.words.map((w) => escapeText(w.text)), 34);
    return dialogue(0, cue.start, holdUntil(cues, i), 'Classic', `{\\fad(120,80)}${text}`);
  });
}

// One event per word window. The line never re-flows, only the colour of one
// word changes, so nothing jumps around while it plays. This is more
// predictable than karaoke (\k) tags, which fill from the left and cannot
// isolate a single word.
function popEvents(cues) {
  const events = [];
  const YELLOW = '{\\1c&H00FFFF&}';
  const WHITE = '{\\1c&HFFFFFF&}';
  const POP_IN = '{\\fscx78\\fscy78\\t(0,120,\\fscx100\\fscy100)}';

  cues.forEach((cue, i) => {
    const words = cue.words.map((w) => escapeText(w.text).toUpperCase());
    for (let j = 0; j < cue.words.length; j++) {
      const start = cue.words[j].start;
      const end = j + 1 < cue.words.length ? cue.words[j + 1].start : holdUntil(cues, i);
      if (end <= start) continue;
      const line = words.map((w, k) => (k === j ? `${YELLOW}${w}${WHITE}` : w)).join(' ');
      events.push(dialogue(0, start, end, 'Pop', `${j === 0 ? POP_IN : ''}${line}`));
    }
  });
  return events;
}

// Each label runs until the next scene begins, so the line along the top
// never blinks out in the pause between two sentences.
function sceneEvents(scenes, sentences) {
  return scenes
    .map((scene, i) => {
      const first = sentences[scene.startSentence];
      const last = sentences[scene.endSentence] ?? first;
      if (!first) return null;
      const nextScene = scenes[i + 1] && sentences[scenes[i + 1].startSentence];
      const end = nextScene ? nextScene.start : last.end;
      const text = escapeText(`SCENE ${scene.scene} · ${scene.visual}`);
      return dialogue(1, first.start, end, 'SceneLabel', `{\\fad(150,150)}${text}`);
    })
    .filter(Boolean);
}

/**
 * @param {'classic'|'pop'} style
 * @param {Array<{start:number,end:number}>} sentences  timed sentences
 * @param {Array<{words:Array<{text:string,start:number,end:number}>,start:number,end:number}>} cues
 * @param {Array<{scene:number,startSentence:number,endSentence:number,visual:string}>} scenes
 */
export function buildAss({ style, sentences, cues, scenes = [] }) {
  const caption = style === 'pop' ? popEvents(cues) : classicEvents(cues);
  return `${[header(), ...sceneEvents(scenes, sentences), ...caption].join('\n')}\n`;
}
