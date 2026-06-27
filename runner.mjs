import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const worktree = 'F:/project/rust/raccoon_node/data/projects/project-1782390246734/worktrees/task-road-tests';
const testFile = worktree + '/tests/racingRoad.test.js';

// Run vitest from project root with explicit test file
try {
  const result = execSync('npx vitest run ' + testFile, {
    encoding: 'utf8',
    timeout: 90000,
    cwd: 'F:/project/rust/raccoon_node',
    shell: 'cmd.exe',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  writeFileSync(worktree + '/runner-result.txt', result, 'utf8');
  console.log('PASS. Exit code: 0');
} catch (e) {
  const msg = 'FAIL\nStdout:\n' + (e.stdout || '') + '\nStderr:\n' + (e.stderr || '');
  writeFileSync(worktree + '/runner-result.txt', msg, 'utf8');
  console.log('FAIL. Exit code: ' + (e.status || 1));
}
