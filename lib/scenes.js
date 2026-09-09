// Where the b-roll should go. Claude proposes the scenes when a key is set;
// otherwise a plain heuristic does it. Either way the output is normalised to
// the same shape, so the video and the UI never care which one ran.
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'if', 'so', 'of', 'to', 'in', 'on', 'for', 'with', 'that', 'this', 'it', 'is', 'was', 'are', 'were', 'be', 'been', 'you', 'your', 'i', 'my', 'we', 'our', 'they', 'he', 'she', 'at', 'as', 'by', 'from', 'not', 'no', 'do', 'does', 'did', 'can', 'will', 'just', 'what', 'when', 'how', 'why', 'then', 'than', 'there', 'here', 'about', 'into', 'out', 'up', 'down', 'over', 'after', 'before']);

const SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scene: { type: 'integer' },
          startSentence: { type: 'integer' },
          endSentence: { type: 'integer' },
          visual: { type: 'string' },
          onScreenText: { type: 'string' },
        },
        required: ['scene', 'startSentence', 'endSentence', 'visual', 'onScreenText'],
        additionalProperties: false,
      },
    },
  },
  required: ['scenes'],
  additionalProperties: false,
};

const SYSTEM = [
  'You plan b-roll for short vertical videos.',
  'Given a numbered list of sentences from a voiceover script, group them into 3 to 6 scenes.',
  'Rules: scenes are in order, they cover every sentence exactly once, and sentence ranges are 0-based and inclusive.',
  '"visual" is one short line naming a shot someone could actually film or pull from stock footage. No camera jargon.',
  '"onScreenText" is at most 6 words, the phrase worth putting on screen for that scene.',
].join(' ');

export function keyPhrase(sentence) {
  const words = sentence.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean);
  let best = [];
  let run = [];
  for (const w of words) {
    if (STOPWORDS.has(w.toLowerCase()) || w.length < 3) {
      if (run.length > best.length) best = run;
      run = [];
    } else {
      run.push(w);
      if (run.length === 3) { if (run.length > best.length) best = run; run = []; }
    }
  }
  if (run.length > best.length) best = run;
  if (!best.length) best = [words.sort((a, b) => b.length - a.length)[0] ?? 'the topic'];
  return best.join(' ').toLowerCase();
}

export function heuristicScenes(sentences) {
  const per = sentences.length > 12 ? 3 : 2;
  const scenes = [];
  for (let i = 0; i < sentences.length; i += per) {
    const startSentence = i;
    const endSentence = Math.min(i + per - 1, sentences.length - 1);
    const first = sentences[startSentence];
    scenes.push({
      scene: scenes.length + 1,
      startSentence,
      endSentence,
      visual: `B-roll of ${keyPhrase(first)}`,
      onScreenText: first.split(/\s+/).slice(0, 5).join(' ').replace(/[.,!?;:]$/, ''),
    });
  }
  return scenes;
}

// Trusts nothing: clamps indices, fills gaps, renumbers, trims text.
export function normalizeScenes(raw, count) {
  const cleaned = (Array.isArray(raw) ? raw : [])
    .map((s) => ({
      startSentence: Math.min(Math.max(0, Number.parseInt(s?.startSentence, 10) || 0), count - 1),
      endSentence: Math.min(Math.max(0, Number.parseInt(s?.endSentence, 10) || 0), count - 1),
      visual: String(s?.visual ?? '').replace(/[{}\r\n]/g, ' ').trim().slice(0, 120),
      onScreenText: String(s?.onScreenText ?? '').replace(/[{}\r\n]/g, ' ').trim().split(/\s+/).slice(0, 6).join(' '),
    }))
    .map((s) => (s.endSentence < s.startSentence ? { ...s, endSentence: s.startSentence } : s))
    .filter((s) => s.visual)
    .sort((a, b) => a.startSentence - b.startSentence);

  if (!cleaned.length) return null;

  // No overlaps, no uncovered sentences.
  const out = [];
  let cursor = 0;
  for (const scene of cleaned) {
    if (scene.endSentence < cursor) continue;
    const startSentence = Math.min(cursor, scene.startSentence);
    out.push({ ...scene, startSentence, scene: out.length + 1 });
    cursor = scene.endSentence + 1;
  }
  if (!out.length) return null;
  out[out.length - 1].endSentence = count - 1;
  return out;
}

export async function suggestScenes(sentences, { log } = {}) {
  const fallback = (reason) => {
    log?.(`scene suggestions: built-in heuristic (${reason})`);
    return { scenes: heuristicScenes(sentences), source: 'heuristic', reason };
  };

  if (!config.anthropicKey) return fallback('no ANTHROPIC_API_KEY set');

  try {
    const client = new Anthropic({ apiKey: config.anthropicKey, timeout: 25_000, maxRetries: 0 });
    log?.(`scene suggestions: asking Claude (${config.scenesModel})`);
    const res = await client.messages.create({
      model: config.scenesModel,
      max_tokens: 2048,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: sentences.map((s, i) => `${i}. ${s}`).join('\n') }],
    });

    if (res.stop_reason === 'refusal') return fallback('the model declined the request');
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = normalizeScenes(JSON.parse(text).scenes, sentences.length);
    if (!parsed) return fallback('the model returned no usable scenes');
    log?.(`scene suggestions: Claude proposed ${parsed.length} scenes`);
    return { scenes: parsed, source: 'claude', model: config.scenesModel };
  } catch (error) {
    return fallback(String(error.message ?? error).slice(0, 120));
  }
}

export function scenesMarkdown(scenes, sentences) {
  return ['# Scene suggestions', '',
    ...scenes.flatMap((s) => [
      `## Scene ${s.scene} (sentences ${s.startSentence + 1}-${s.endSentence + 1})`,
      `- **Visual:** ${s.visual}`,
      `- **On screen:** ${s.onScreenText}`,
      `- **Voiceover:** ${sentences.slice(s.startSentence, s.endSentence + 1).join(' ')}`,
      '',
    ])].join('\n');
}
