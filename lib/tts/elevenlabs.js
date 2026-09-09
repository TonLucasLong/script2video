// Optional upgrade path, switched on by setting ELEVENLABS_API_KEY.
//
// NOT EXERCISED IN THIS BUILD: no key was used while making the demo, so treat
// this file as a sketch of the seam rather than tested code. It exists to show
// the shape: an engine that returns real word timings just fills in `words`,
// and lib/timing.js stops guessing. Everything downstream is unchanged.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export const id = 'elevenlabs';
export const label = 'ElevenLabs';
export const extension = '.mp3';

export function describe(cfg) {
  return `ElevenLabs, voice ${cfg.elevenVoice}`;
}

export async function speak(text, outFile, { cwd, key, voiceId, log }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;
  log?.(`POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`);

  const body = await res.json();
  writeFileSync(path.join(cwd, outFile), Buffer.from(body.audio_base64, 'base64'));

  // Character timings come back flat; fold them up into words.
  const a = body.alignment;
  const words = [];
  if (a?.characters?.length) {
    let current = null;
    a.characters.forEach((ch, i) => {
      if (/\s/.test(ch)) { current = null; return; }
      if (!current) { current = { text: '', start: a.character_start_times_seconds[i], end: 0 }; words.push(current); }
      current.text += ch;
      current.end = a.character_end_times_seconds[i];
    });
  }
  return { file: outFile, words: words.length ? words : null };
}
