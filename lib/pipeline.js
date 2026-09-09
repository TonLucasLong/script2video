// The whole job, stage by stage. Every line it logs is what the "under the
// hood" panel shows, so the log is the explanation.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUTPUT_DIR, config } from './config.js';
import { splitSentences, cuesFor } from './chunk.js';
import { timeCues } from './timing.js';
import { synthesize } from './tts/index.js';
import { suggestScenes, scenesMarkdown } from './scenes.js';
import { buildAss, STYLES } from './ass.js';
import { render } from './render.js';
import { probeStreams } from './audio.js';

export const MAX_SCRIPT = 3000;

export function validate({ script, style }) {
  const text = String(script ?? '').trim();
  if (text.length < 20) return 'Paste a script first, at least a sentence or two.';
  if (text.length > MAX_SCRIPT) return `That is ${text.length} characters. Keep it under ${MAX_SCRIPT} for this demo.`;
  if (!STYLES[style]) return 'Pick one of the two caption styles.';
  return null;
}

export function createJob({ script, style }) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const dir = path.join(OUTPUT_DIR, id);
  mkdirSync(dir, { recursive: true });
  return {
    id, dir, script: String(script).trim(), style,
    stage: 'queued', log: [], done: false, error: null, result: null,
    startedAt: Date.now(),
  };
}

export async function runJob(job) {
  const t0 = Date.now();
  const log = (message) => {
    job.log.push({ at: ((Date.now() - t0) / 1000).toFixed(1), message });
  };
  const stage = (name, message) => { job.stage = name; log(message); };

  try {
    stage('chunking', 'splitting the script into sentences');
    const sentences = splitSentences(job.script);
    if (!sentences.length) throw new Error('nothing to say: the script has no sentences');
    log(`${sentences.length} sentences, ${job.script.split(/\s+/).length} words`);

    stage('voice + scenes', 'synthesizing the voiceover and planning scenes at the same time');
    const [voice, scenePlan] = await Promise.all([
      synthesize(sentences, { cwd: job.dir, log }),
      suggestScenes(sentences, { log }),
    ]);
    log(`voice track: ${voice.duration.toFixed(2)}s, word timings ${voice.sentences[0].timingSource}`);

    stage('captions', `building the ${STYLES[job.style].label} subtitle file`);
    const cues = voice.sentences.flatMap((s) => timeCues(cuesFor(job.style, s.words.map((w) => w.text)), s.words));
    const ass = buildAss({ style: job.style, sentences: voice.sentences, cues, scenes: scenePlan.scenes });
    writeFileSync(path.join(job.dir, 'captions.ass'), ass, 'utf8');
    writeFileSync(path.join(job.dir, 'scenes.json'), JSON.stringify(scenePlan.scenes, null, 2), 'utf8');
    writeFileSync(path.join(job.dir, 'scenes.md'), scenesMarkdown(scenePlan.scenes, sentences), 'utf8');
    log(`${cues.length} caption cues, ${ass.split('\n').filter((l) => l.startsWith('Dialogue')).length} subtitle events`);

    stage('rendering', 'burning the captions onto a black canvas with ffmpeg');
    await render({ cwd: job.dir, duration: voice.duration, encoder: config.encoder, log });

    const probe = await probeStreams('video.mp4', job.dir);
    const streams = (probe.streams ?? []).map((s) => `${s.codec_type}:${s.codec_name}${s.width ? ` ${s.width}x${s.height}` : ''}`);
    log(`video.mp4 is ${(Number(probe.format?.size ?? 0) / 1e6).toFixed(1)} MB, ${streams.join(' + ')}`);

    job.result = {
      videoUrl: `/output/${job.id}/video.mp4`,
      assUrl: `/output/${job.id}/captions.ass`,
      audioUrl: `/output/${job.id}/voice.wav`,
      scenesUrl: `/output/${job.id}/scenes.json`,
      scenes: scenePlan.scenes,
      sentences: voice.sentences.map((s) => ({ text: s.text, start: s.start, end: s.end })),
      style: job.style,
      styleLabel: STYLES[job.style].label,
      voiceEngine: voice.engineLabel,
      sceneSource: scenePlan.source === 'claude' ? `Claude (${scenePlan.model})` : `built-in heuristic (${scenePlan.reason})`,
      duration: voice.duration,
      streams,
      elapsed: ((Date.now() - t0) / 1000).toFixed(1),
    };
    stage('done', `finished in ${job.result.elapsed}s`);
  } catch (error) {
    job.error = String(error.message ?? error);
    job.stage = 'failed';
    log(`failed: ${job.error}`);
  } finally {
    job.done = true;
    try {
      writeFileSync(path.join(job.dir, 'job.json'),
        JSON.stringify({ id: job.id, style: job.style, stage: job.stage, log: job.log, error: job.error, result: job.result }, null, 2));
    } catch { /* the job is still fine if this side file cannot be written */ }
  }
  return job;
}
