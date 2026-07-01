import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_SHRINE_HTTP_PORT } from './dev-port.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, '../dist/server/index.js');

const child = spawn(process.execPath, [entry], {
  stdio: 'inherit',
  env: {
    ...process.env,
    EIDOLA_SHRINE_HTTP_PORT: process.env.EIDOLA_SHRINE_HTTP_PORT ?? String(DEV_SHRINE_HTTP_PORT),
    EIDOLA_SHRINE_DEV: process.env.EIDOLA_SHRINE_DEV ?? '1',
  },
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
