// Windows voice. System.Speech is part of .NET on every Windows box, so this
// needs no install and no key either.
import { spawn } from 'node:child_process';
import { writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sapi.ps1');

export const id = 'sapi';
export const label = 'Windows System.Speech';
export const extension = '.wav';

export function describe(cfg) {
  return `Windows System.Speech, voice ${cfg.voice || 'default'}, rate ${cfg.rate}`;
}

export function speak(text, outFile, { cwd, voice, rate, log }) {
  const textFile = `${outFile}.txt`;
  writeFileSync(path.join(cwd, textFile), text, 'utf8');

  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
    '-In', textFile, '-Out', outFile, '-Rate', String(rate || 0)];
  if (voice) args.push('-Voice', voice);
  log?.(`powershell ${args.slice(4).join(' ')}`);

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`PowerShell exited ${code}: ${err.trim().slice(0, 300)}`));
      try {
        if (statSync(path.join(cwd, outFile)).size < 1024) return reject(new Error('the Windows voice produced an empty clip'));
      } catch (e) { return reject(e); }
      resolve({ file: outFile, words: null });
    });
  });
}
