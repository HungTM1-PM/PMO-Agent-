#!/usr/bin/env node
/**
 * Performance smoke: đo latency HTTP (GET /) — không cần thư viện ngoài.
 * Chạy khi server đã bật: PORT=3000 node scripts/perf-smoke.js
 * Hoặc: PERF_BASE=http://127.0.0.1:3456 node scripts/perf-smoke.js
 */
const http = require('http');
const { URL } = require('url');

const BASE = process.env.PERF_BASE || `http://127.0.0.1:${process.env.PORT || 3000}/`;
const CONCURRENCY = Math.max(1, parseInt(process.env.PERF_CONCURRENCY || '10', 10));
const TOTAL = Math.max(CONCURRENCY, parseInt(process.env.PERF_REQUESTS || '100', 10));

function requestOnce(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    const t0 = process.hrtime.bigint();
    const req = http.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method: 'GET',
        timeout: 30_000,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          resolve({ status: res.statusCode, ms });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function run() {
  const latencies = [];
  let errors = 0;
  const perWorker = Math.ceil(TOTAL / CONCURRENCY);

  async function workerSlot(w) {
    for (let i = 0; i < perWorker; i++) {
      const n = w * perWorker + i;
      if (n >= TOTAL) break;
      try {
        const r = await requestOnce(BASE);
        if (r.status >= 200 && r.status < 500) latencies.push(r.ms);
        else errors++;
      } catch {
        errors++;
      }
    }
  }

  const tStart = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, w) => workerSlot(w)));
  const wallMs = Date.now() - tStart;

  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);

  console.log(JSON.stringify({
    label: 'perf-smoke GET /',
    base: BASE,
    concurrency: CONCURRENCY,
    requests: latencies.length,
    errors,
    wallMs,
    rps: latencies.length / (wallMs / 1000),
    latencyMs: {
      min: latencies[0] ?? 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies[latencies.length - 1] ?? 0,
      mean: latencies.length ? sum / latencies.length : 0,
    },
  }, null, 2));

  if (errors > TOTAL * 0.1) {
    console.error('Quá nhiều lỗi — kiểm tra server có đang chạy tại', BASE);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
