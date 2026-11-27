#!/usr/bin/env node
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cpu = os.cpus();
const grouped = process.platform !== 'win32';
const child = spawn(
  'cargo',
  ['run', '--quiet', '--locked', '--manifest-path', 'tools/bench-suite/Cargo.toml', '--', ...process.argv.slice(2)],
  {
    cwd: root,
    detached: grouped,
    stdio: 'inherit',
    env: {
      ...process.env,
      BENCH_NODE: process.execPath,
      BENCH_CWD: process.cwd(),
      BENCH_HOST: JSON.stringify({
        date: new Date().toISOString(),
        node: process.version,
        os: `${os.type()} ${os.release()} (${process.platform}/${os.arch()})`,
        cpuModel: cpu[0]?.model ?? 'unknown',
        cpuCores: cpu.length,
        totalRamGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      }),
    },
  },
);
if (grouped) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    });
  }
}
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('close', (status, signal) => {
  process.exitCode = status ?? (signal ? 128 + os.constants.signals[signal] : 1);
});
