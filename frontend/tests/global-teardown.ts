import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export default function teardown() {
  const backendDirectory = fileURLToPath(new URL('../../backend/', import.meta.url));
  const python = join(backendDirectory, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  execFileSync(python, ['scripts/browser_test_db.py', 'drop'], { cwd: backendDirectory, stdio: 'inherit', windowsHide: true });
}
