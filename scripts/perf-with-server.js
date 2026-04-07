#!/usr/bin/env node
/**
 * Bật server tạm (in-memory) + chạy perf-smoke — một lệnh duy nhất.
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PERF_SERVER_PORT || '3999';
const BASE = `http://127.0.0.1:${PORT}/`;

function waitForOk(url, timeoutMs = 20_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      http
        .get(url, (res) => {
          res.resume();
          res.on('end', () => resolve());
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Server không phản hồi tại ${url}`));
          } else {
            setTimeout(attempt, 150);
          }
        });
    }
    attempt();
  });
}

async function main() {
  const serverEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT,
    USE_MEMORY_STORE: '1',
    JWT_SECRET: process.env.JWT_SECRET || 'perf-jwt-secret',
    CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || 'sk-perf-placeholder',
  };

  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: serverEnv,
    stdio: 'ignore',
  });

  try {
    await waitForOk(BASE);
    const perf = spawn(process.execPath, [path.join(__dirname, 'perf-smoke.js')], {
      cwd: ROOT,
      env: { ...process.env, PERF_BASE: BASE },
      stdio: 'inherit',
    });
    await new Promise((resolve, reject) => {
      perf.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`perf exit ${code}`))));
      perf.on('error', reject);
    });
  } finally {
    try {
      server.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 400));
    if (!server.killed) {
      try {
        server.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
