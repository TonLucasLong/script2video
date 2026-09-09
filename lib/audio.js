// Measuring the synthesized clips and gluing them into one voice track.
import { ffprobePath, ffmpegPath, run } from './config.js';

export async function probeDuration(file, cwd) {
  const res = await run(ffprobePath(), [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], { cwd });
  const seconds = Number.parseFloat(res.out.trim());
  if (!Number.isFinite(seconds)) throw new Error(`could not read the duration of ${file}: ${res.err.trim().slice(0, 200)}`);
  return seconds;
}

export async function probeStreams(file, cwd) {
  const res = await run(ffprobePath(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { cwd });
  return JSON.parse(res.out || '{}');
}

/**
 * One ffmpeg call: pad each sentence with the breath gap, concatenate, then
 * add the lead-in and the tail. The concat filter negotiates sample rates by
 * itself, which the concat demuxer will not do.
 */
export async function concatWithGaps(files, out, { cwd, leadIn, gap, tail, log }) {
  const inputs = files.flatMap((f) => ['-i', f]);
  const pads = files.map((_, i) => `[${i}:a]apad=pad_dur=${gap}[a${i}]`).join(';');
  const chain = files.map((_, i) => `[a${i}]`).join('');
  const filter = `${pads};${chain}concat=n=${files.length}:v=0:a=1[cat];`
    + `[cat]adelay=${Math.round(leadIn * 1000)}:all=1,apad=pad_dur=${tail}[out]`;

  const args = ['-y', '-hide_banner', '-nostdin', ...inputs,
    '-filter_complex', filter, '-map', '[out]',
    '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', out];

  log?.(`ffmpeg ${args.map((a) => (a.includes(' ') || a.includes(';') ? `"${a}"` : a)).join(' ')}`);
  const res = await run(ffmpegPath(), args, { cwd });
  if (res.code !== 0) throw new Error(`ffmpeg could not build the voice track: ${res.err.trim().split('\n').slice(-4).join(' ')}`);
  return probeDuration(out, cwd);
}
