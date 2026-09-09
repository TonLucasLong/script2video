// macOS voice. `say` ships with the OS, so there is no key and no network.
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

export const id = 'say';
export const label = 'macOS say';

export function describe(cfg) {
  return `macOS "say", voice ${cfg.voice || 'default'}, ${cfg.rate} wpm`;
}

// Text goes in on stdin so punctuation and quotes never touch argv.
export function speak(text, outFile, { cwd, voice, rate, log }) {
  const args = [];
  if (voice) args.push('-v', voice);
  if (rate) args.push('-r', String(rate));
  args.push('-o', outFile, '-f', '-');
  log?.(`say ${args.join(' ')}  <<< ${JSON.stringify(text.slice(0, 60))}`);

  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/say', args, { cwd, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`say exited ${code}: ${err.trim().slice(0, 200)}`));
      try {
        if (statSync(`${cwd}/${outFile}`).size < 1024) return reject(new Error(`say produced an empty clip for ${JSON.stringify(text.slice(0, 40))}`));
      } catch (e) { return reject(e); }
      resolve({ file: outFile, words: null });
    });
    child.stdin.end(text, 'utf8');
  });
}

export const extension = '.aiff';
