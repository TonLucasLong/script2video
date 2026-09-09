// The render. One ffmpeg call: a black canvas, the voice track, and the
// subtitle file burned in by libass. Nothing is left as a sidecar file.
import { ffmpegPath, run, FONTS_DIR } from './config.js';

export const WIDTH = 1080;
export const HEIGHT = 1920;

// Filter arguments are parsed twice, so a Windows path (C:\...) and any colon
// or comma inside it has to be escaped before it reaches the ass filter.
//
// Escaping alone is not enough on Windows. Tested against ffmpeg-static on
// win32: fontsdir=C\:/path fails the filtergraph, and so does an unescaped
// colon inside quotes. Only the two together survive, so the caller wraps the
// escaped value in single quotes. macOS never hit this because its font path
// has no drive letter and therefore no colon to escape.
export function escapeFilterValue(value) {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

export function buildRenderArgs({ ass = 'captions.ass', audio = 'voice.wav', out = 'video.mp4',
  duration, encoder = 'libx264', fontsDir = FONTS_DIR } = {}) {
  const seconds = Number(duration).toFixed(3);
  const video = encoder === 'videotoolbox'
    ? ['-c:v', 'h264_videotoolbox', '-b:v', '6M']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];

  return ['-y', '-hide_banner', '-nostdin',
    '-f', 'lavfi', '-i', `color=c=black:s=${WIDTH}x${HEIGHT}:r=30`,
    '-i', audio,
    '-map', '0:v', '-map', '1:a',
    '-vf', `ass=${ass}:fontsdir='${escapeFilterValue(fontsDir)}'`,
    '-t', seconds,
    ...video, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    out];
}

export async function render(opts) {
  const args = buildRenderArgs(opts);
  opts.log?.(`ffmpeg ${args.join(' ')}`);
  const res = await run(ffmpegPath(), args, { cwd: opts.cwd });
  if (res.code !== 0) {
    throw new Error(`ffmpeg could not render the video: ${res.err.trim().split('\n').slice(-4).join(' ')}`);
  }
  const warnings = res.err.split('\n').filter((l) => /fontselect|Glyph|libass/i.test(l)).slice(0, 3);
  for (const w of warnings) opts.log?.(`ffmpeg: ${w.trim()}`);
  return opts.out ?? 'video.mp4';
}
