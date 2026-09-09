// Environment, binary resolution, and the machine check behind `npm run doctor`.
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');
export const OUTPUT_DIR = path.join(ROOT, 'output');
export const IS_WINDOWS = process.platform === 'win32';

// Minimal .env reader. No dependency, and it never overwrites a real env var.
export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}

function fromPackage(spec, pick) {
  try {
    const mod = require(spec);
    const p = pick(mod);
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

// require() is not defined in an ES module, so build one.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export function ffmpegPath() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  return fromPackage('ffmpeg-static', (m) => m.default ?? m) ?? 'ffmpeg';
}

export function ffprobePath() {
  if (process.env.FFPROBE_PATH && existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;
  return fromPackage('ffprobe-static', (m) => (m.default ?? m).path) ?? 'ffprobe';
}

export const config = {
  get port() { return Number(process.env.PORT) || 3000; },
  get voice() { return process.env.TTS_VOICE || (IS_WINDOWS ? '' : 'Samantha'); },
  get rate() { return process.env.TTS_RATE || (IS_WINDOWS ? '0' : '175'); },
  get scenesModel() { return process.env.SCENES_MODEL || 'claude-opus-5'; },
  get anthropicKey() { return process.env.ANTHROPIC_API_KEY || ''; },
  get elevenKey() { return process.env.ELEVENLABS_API_KEY || ''; },
  get elevenVoice() { return process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; },
  get encoder() { return process.env.VIDEO_ENCODER || 'libx264'; },
};

// Run a command, capture stdout/stderr, never throw.
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '', err = '';
    let child;
    try {
      child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: -1, out: '', err: String(e) });
      return;
    }
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => resolve({ code: -1, out, err: err + String(e) }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

// Everything `npm run doctor` and GET /api/health report.
export async function doctor() {
  const checks = [];
  const ff = ffmpegPath();
  const fp = ffprobePath();

  const filters = await run(ff, ['-hide_banner', '-filters']);
  const hasAss = /^\s*\S+\s+ass\s/m.test(filters.out);
  const bundled = existsSync(path.join(ROOT, 'node_modules', 'ffmpeg-static'));
  const recover = bundled
    ? 'Run `node node_modules/ffmpeg-static/install.js` to fetch the bundled build, or set FFMPEG_PATH in .env to a full ffmpeg.'
    : 'Set FFMPEG_PATH in .env to an ffmpeg built with libass.';
  checks.push({
    name: 'ffmpeg',
    ok: filters.code === 0 && hasAss,
    detail: filters.code !== 0
      ? `cannot run ${ff}. ${recover}`
      : hasAss ? `${ff} (has the ass filter)`
      : `${ff} was built without libass, so captions cannot be burned in. ${recover}`,
  });

  const probe = await run(fp, ['-version']);
  checks.push({ name: 'ffprobe', ok: probe.code === 0, detail: probe.code === 0 ? fp : `cannot run ${fp}` });

  if (IS_WINDOWS) {
    const ps = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }']);
    const voices = ps.out.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
    checks.push({
      name: 'voice (Windows System.Speech)',
      ok: ps.code === 0 && voices.length > 0,
      detail: voices.length ? voices.join(', ') : `PowerShell reported no voices. ${ps.err.slice(0, 200)}`,
    });
  } else {
    const say = await run('say', ['-v', '?']);
    const names = say.out.split(/\r?\n/).map((l) => l.split(/\s{2,}/)[0]).filter(Boolean);
    const wanted = config.voice;
    checks.push({
      name: 'voice (macOS say)',
      ok: say.code === 0 && (!wanted || names.includes(wanted)),
      detail: say.code !== 0 ? 'say is not available'
        : names.includes(wanted) ? `${wanted} found, ${names.length} voices installed`
        : `${wanted} is not installed. Voices: ${names.slice(0, 6).join(', ')}`,
    });
  }

  const fonts = ['Anton-Regular.ttf', 'Poppins-Bold.ttf'].filter((f) => existsSync(path.join(FONTS_DIR, f)));
  checks.push({ name: 'fonts', ok: fonts.length === 2, detail: fonts.join(', ') || 'missing from assets/fonts' });

  checks.push({
    name: 'scene suggestions',
    ok: true,
    detail: config.anthropicKey ? `Claude (${config.scenesModel})` : 'built-in heuristic (set ANTHROPIC_API_KEY for Claude)',
  });

  return { platform: `${os.platform()} ${os.arch()}, node ${process.version}`, checks, ok: checks.every((c) => c.ok) };
}
