// Picks a voice engine, speaks every sentence, and hands back one audio file
// with a timeline attached.
import { config, IS_WINDOWS } from '../config.js';
import { concatWithGaps, probeDuration } from '../audio.js';
import { LEAD_IN, GAP, TAIL, layoutSentences, distributeWords } from '../timing.js';
import * as say from './say.js';
import * as sapi from './sapi.js';
import * as eleven from './elevenlabs.js';

export function pickEngine() {
  if (config.elevenKey) return eleven;
  return IS_WINDOWS ? sapi : say;
}

const pad = (n) => String(n).padStart(3, '0');

/**
 * @param {string[]} sentences
 * @returns {{audioFile:string,duration:number,engine:string,engineLabel:string,sentences:Array}}
 */
export async function synthesize(sentences, { cwd, log }) {
  let engine = pickEngine();
  const opts = {
    cwd, log,
    voice: config.voice,
    rate: config.rate,
    key: config.elevenKey,
    voiceId: config.elevenVoice,
  };

  log?.(`voice engine: ${engine.describe(config)}`);
  const clips = [];

  for (let i = 0; i < sentences.length; i++) {
    const file = `s${pad(i)}${engine.extension}`;
    try {
      clips.push(await engine.speak(sentences[i], file, opts));
    } catch (error) {
      // A missing key or a network hiccup must not kill the run: fall back to
      // the voice that is built into the machine and carry on.
      if (engine !== say && engine !== sapi) {
        log?.(`${engine.label} failed (${error.message}), falling back to the built-in voice`);
        engine = IS_WINDOWS ? sapi : say;
        log?.(`voice engine: ${engine.describe(config)}`);
        i--;
        continue;
      }
      throw error;
    }
  }

  const durations = [];
  for (const clip of clips) durations.push(await probeDuration(clip.file, cwd));
  log?.(`spoke ${clips.length} sentence${clips.length === 1 ? '' : 's'}, ${durations.reduce((a, b) => a + b, 0).toFixed(2)}s of speech`);

  const audioFile = 'voice.wav';
  const duration = await concatWithGaps(clips.map((c) => c.file), audioFile,
    { cwd, leadIn: LEAD_IN, gap: GAP, tail: TAIL, log });

  const layout = layoutSentences(durations);
  const timed = sentences.map((text, i) => {
    const { start, end } = layout[i];
    const engineWords = clips[i].words;
    const words = engineWords
      ? engineWords.map((w) => ({ text: w.text, start: +(start + w.start).toFixed(2), end: +(start + w.end).toFixed(2) }))
      : distributeWords(text.split(' ').filter(Boolean), start, end);
    return { index: i, text, start, end, words, timingSource: engineWords ? 'engine' : 'estimated' };
  });

  return { audioFile, duration, engine: engine.id, engineLabel: engine.describe(config), sentences: timed };
}
