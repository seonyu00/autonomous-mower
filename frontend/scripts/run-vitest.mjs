import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestBin = resolve(root, 'node_modules', 'vitest', 'vitest.mjs');

const child = spawn(process.execPath, [vitestBin, 'run', '--configLoader', 'native'], {
  cwd: root,
  env: {
    ...process.env,
    VITEST_SKIP_INSTALL_CHECKS: '1',
  },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
