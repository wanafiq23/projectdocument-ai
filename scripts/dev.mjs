import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const python = join(root, 'backend', '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
const backendRunner = join(root, 'backend', 'run.py');
const vite = join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
const frontendOptions = process.argv.slice(2);
const portOption = frontendOptions.findIndex(option => option === '--port');
const inlinePort = frontendOptions.find(option => option.startsWith('--port='));
const frontendPort = inlinePort?.split('=')[1] || (portOption >= 0 ? frontendOptions[portOption + 1] : '') || '5173';

const missing = [
  [python, 'Backend environment missing. Create backend/.venv and install requirements.lock.txt.'],
  [vite, 'Frontend dependencies missing. Run "npm install" inside frontend once.'],
].filter(([path]) => !existsSync(path));

if (missing.length) {
  for (const [, message] of missing) console.error(`Setup required: ${message}`);
  process.exit(1);
}

function launch(name, command, args, cwd) {
  console.log(`[${name}] Starting…`);
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    detached: !isWindows,
  });
  child.on('error', error => {
    console.error(`[${name}] Could not start: ${error.message}`);
    stop(1);
  });
  return { name, child };
}

const services = [
  launch('backend', python, [backendRunner], join(root, 'backend')),
  launch('frontend', process.execPath, [vite, '--host', '127.0.0.1', ...frontendOptions], join(root, 'frontend')),
];

console.log(`ProjectDocumentAI is starting at http://localhost:${frontendPort}`);
console.log('Press Ctrl+C once to stop the entire application.');

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping ProjectDocumentAI…');
  for (const { child } of services) {
    if (!child.pid || child.exitCode !== null) continue;
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try { process.kill(-child.pid, 'SIGTERM'); }
      catch { child.kill('SIGTERM'); }
    }
  }
  setTimeout(() => process.exit(exitCode), 100);
}

for (const { name, child } of services) {
  child.on('exit', code => {
    if (!stopping) {
      console.error(`[${name}] Stopped unexpectedly${code === null ? '.' : ` with exit code ${code}.`}`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
