// `npm run smoke` -- renders both caption styles end to end and checks the
// files really are one video with sound and burned-in captions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../lib/config.js';
import { createJob, runJob } from '../lib/pipeline.js';
import { probeStreams } from '../lib/audio.js';

loadEnv();

const SCRIPT = 'Here is a short test script. It has three sentences on purpose. That is enough to see both caption styles.';
let failed = 0;

for (const style of ['classic', 'pop']) {
  process.stdout.write(`\n${style}: `);
  const job = createJob({ script: SCRIPT, style });
  await runJob(job);

  try {
    assert.equal(job.error, null, `job failed: ${job.error}`);
    const probe = await probeStreams('video.mp4', job.dir);
    const video = probe.streams.filter((s) => s.codec_type === 'video');
    const audio = probe.streams.filter((s) => s.codec_type === 'audio');

    assert.equal(video.length, 1, 'expected exactly one video stream');
    assert.equal(audio.length, 1, 'expected exactly one audio stream');
    assert.equal(video[0].codec_name, 'h264');
    assert.equal(video[0].pix_fmt, 'yuv420p');
    assert.equal(`${video[0].width}x${video[0].height}`, '1080x1920');
    assert.equal(audio[0].codec_name, 'aac');

    const seconds = Number(probe.format.duration);
    assert.ok(Math.abs(seconds - job.result.duration) < 0.35, `duration drifted: ${seconds} vs ${job.result.duration}`);

    const ass = readFileSync(path.join(job.dir, 'captions.ass'), 'utf8');
    const wanted = style === 'pop' ? 'Pop,,' : 'Classic,,';
    assert.ok(ass.includes(wanted), `no ${style} events in captions.ass`);
    assert.ok(ass.includes('SceneLabel,,'), 'no scene labels in captions.ass');
    assert.ok(job.result.scenes.length >= 1, 'no scene suggestions');

    console.log(`ok  ${seconds.toFixed(2)}s, ${video[0].width}x${video[0].height} h264 + aac, `
      + `${job.result.scenes.length} scenes, ${job.result.elapsed}s to build`);
    console.log(`    ${path.join(job.dir, 'video.mp4')}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${error.message}`);
    for (const l of job.log.slice(-6)) console.log(`     ${l.at}s ${l.message}`);
  }
}

console.log(failed ? `\n${failed} of 2 failed\n` : '\nboth styles rendered\n');
process.exit(failed ? 1 : 0);
