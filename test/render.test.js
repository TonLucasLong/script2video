import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRenderArgs, escapeFilterValue } from '../lib/render.js';
import { validate } from '../lib/pipeline.js';

test('one command produces one file with both streams', () => {
  const args = buildRenderArgs({ duration: 12.3456 });
  const line = args.join(' ');
  assert.ok(line.includes('color=c=black:s=1080x1920:r=30'));
  assert.ok(line.includes('-map 0:v -map 1:a'), 'video and audio in the same output');
  assert.ok(line.includes('ass=captions.ass'), 'captions are burned in, not attached');
  assert.ok(line.includes('-c:a aac'));
  assert.ok(line.includes('-movflags +faststart'), 'plays before it finishes downloading');
  assert.equal(args[args.indexOf('-t') + 1], '12.346');
  assert.equal(args.at(-1), 'video.mp4');
});

test('the videotoolbox path swaps only the video encoder', () => {
  const args = buildRenderArgs({ duration: 5, encoder: 'videotoolbox' });
  assert.ok(args.includes('h264_videotoolbox'));
  assert.ok(!args.includes('libx264'));
  assert.ok(args.includes('aac'));
});

test('a Windows font path survives the filter parser', () => {
  const escaped = escapeFilterValue('C:\\Users\\me\\script2video\\assets\\fonts');
  assert.ok(!/[^\\]:/.test(escaped), 'every colon is escaped');
  assert.ok(!escaped.includes('\\U'), 'backslashes became forward slashes');

  // The escaping on its own still fails the filtergraph on Windows. The value
  // has to reach ffmpeg quoted as well, so lock that in.
  const args = buildRenderArgs({ duration: 1, fontsDir: 'C:\\Users\\me\\fonts' });
  const vf = args[args.indexOf('-vf') + 1];
  assert.ok(vf.includes("fontsdir='C\\:/Users/me/fonts'"), `fontsdir is quoted: ${vf}`);
});

test('the form rejects what the pipeline cannot use', () => {
  assert.match(validate({ script: 'too short', style: 'pop' }), /at least/);
  assert.match(validate({ script: 'x'.repeat(4000), style: 'pop' }), /under 3000/);
  assert.match(validate({ script: 'A perfectly fine sentence to read.', style: 'nope' }), /two caption styles/);
  assert.equal(validate({ script: 'A perfectly fine sentence to read.', style: 'classic' }), null);
});
