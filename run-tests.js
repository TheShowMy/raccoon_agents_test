import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';

const testFile = 'tests/racingRoad.test.js';
if (!existsSync(testFile)) {
  const msg = 'Test file not found: ' + testFile;
  writeFileSync('test-output.txt', msg);
  process.exit(1);
}

const vitestCmd = 'npx vitest';
console.log('Running vitest...');
try {
  const out = execSync(`${vitestCmd} run ${testFile}`, {
    encoding: 'utf8',
    timeout: 90000,
    cwd: process.cwd(),
    shell: true
  });
  writeFileSync('test-output.txt', out);
  console.log('Done. Output written to test-output.txt');
} catch (e) {
  const msg = 'Exit code: ' + (e.status || 'unknown') + '\nStdout:\n' + (e.stdout || '') + '\nStderr:\n' + (e.stderr || '');
  writeFileSync('test-output.txt', msg);
  console.log('Failed. Output written to test-output.txt');
  process.exit(e.status || 1);
}
