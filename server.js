// script2video: paste a script, pick a caption style, get one MP4 back.
import express from 'express';
import { mkdirSync } from 'node:fs';
import { loadEnv, config, doctor, OUTPUT_DIR, FONTS_DIR, ROOT } from './lib/config.js';
import { validate, createJob, runJob } from './lib/pipeline.js';
import { STYLES } from './lib/ass.js';

loadEnv();
mkdirSync(OUTPUT_DIR, { recursive: true });

const app = express();
const jobs = new Map();

app.use(express.json({ limit: '256kb' }));
app.use(express.static(`${ROOT}/public`));
app.use('/fonts', express.static(FONTS_DIR)); // the caption fonts, so the style previews match the render
app.use('/output', express.static(OUTPUT_DIR)); // serves byte ranges, so <video> can seek

app.get('/api/health', async (_req, res) => res.json(await doctor()));
app.get('/api/styles', (_req, res) => res.json(STYLES));

app.post('/api/generate', (req, res) => {
  const problem = validate(req.body ?? {});
  if (problem) return res.status(400).json({ error: problem });

  const job = createJob(req.body);
  jobs.set(job.id, job);
  runJob(job); // deliberately not awaited: the browser polls for progress
  res.json({ id: job.id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'no such job' });
  const { id, stage, log, done, error, result } = job;
  res.json({ id, stage, log, done, error, result });
});

app.listen(config.port, () => {
  console.log(`script2video is running: http://localhost:${config.port}`);
});
