// `npm run doctor` -- says whether this machine can run the tool, and what is
// missing if it cannot.
import { loadEnv, doctor } from '../lib/config.js';

loadEnv();
const report = await doctor();

console.log(`\nscript2video on ${report.platform}\n`);
for (const check of report.checks) {
  console.log(` ${check.ok ? 'ok  ' : 'FAIL'}  ${check.name.padEnd(28)} ${check.detail}`);
}
console.log(report.ok ? '\nReady. Run `npm start`.\n' : '\nFix the FAIL lines above, then run this again.\n');
process.exit(report.ok ? 0 : 1);
