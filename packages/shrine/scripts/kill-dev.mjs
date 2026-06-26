/**
 * Kills whatever process is bound to the Shrine HTTP port (default 9743),
 * for when the background dev server outlived its terminal/agent session.
 */
import { execSync } from 'node:child_process';

const port = process.env.EIDOLA_SHRINE_HTTP_PORT?.trim() || '9743';

function findPidsWindows(port) {
  const output = execSync(`netstat -ano`, { encoding: 'utf8' });
  const pids = new Set();
  for (const line of output.split('\n')) {
    if (line.includes(`:${port}`) && line.includes('LISTENING')) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== '0') {
        pids.add(pid);
      }
    }
  }
  return [...pids];
}

function findPidsPosix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const pids = process.platform === 'win32' ? findPidsWindows(port) : findPidsPosix(port);

if (pids.length === 0) {
  console.log(`[kill-dev] nothing listening on port ${port}.`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'inherit' });
    }
    console.log(`[kill-dev] killed pid ${pid} on port ${port}.`);
  } catch (error) {
    console.error(`[kill-dev] failed to kill pid ${pid}:`, error.message);
  }
}
