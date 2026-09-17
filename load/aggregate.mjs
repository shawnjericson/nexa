/**
 * Condenses a run of load/run.sh into one JSON file for charts: for every scenario, per 5-second
 * bucket, the p50/p95 of each request name, requests and failures per second, virtual users, and
 * the server's CPU and load; plus the k6 summaries.
 *
 *   node load/aggregate.mjs <results-dir> > run.json
 */
import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

const dir = process.argv[2];
if (!dir) throw new Error('usage: aggregate.mjs <results-dir>');
const BUCKET_S = 5;

const percentile = (sorted, p) =>
  sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

async function samples(file) {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()) });
  let header = null;
  let start = null;
  const buckets = new Map();
  const bucket = (t) => {
    const key = Math.floor((t - start) / BUCKET_S);
    if (!buckets.has(key)) buckets.set(key, { durations: {}, requests: 0, failed: 0, vus: 0 });
    return buckets.get(key);
  };
  for await (const line of lines) {
    const cells = line.split(',');
    if (!header) {
      header = Object.fromEntries(cells.map((name, index) => [name, index]));
      continue;
    }
    const metric = cells[header.metric_name];
    const time = Number(cells[header.timestamp]);
    const value = Number(cells[header.metric_value]);
    start ??= time;
    if (metric === 'http_req_duration') {
      const name = cells[header.name] || 'other';
      const entry = bucket(time);
      (entry.durations[name] ??= []).push(value);
    } else if (metric === 'http_reqs') {
      bucket(time).requests += value;
    } else if (metric === 'http_req_failed') {
      bucket(time).failed += value;
    } else if (metric === 'vus') {
      const entry = bucket(time);
      entry.vus = Math.max(entry.vus, value);
    }
  }
  const points = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, entry]) => ({
      t: key * BUCKET_S,
      rps: entry.requests / BUCKET_S,
      failedPerSecond: entry.failed / BUCKET_S,
      vus: entry.vus,
      latency: Object.fromEntries(
        Object.entries(entry.durations).map(([name, values]) => {
          const sorted = values.sort((a, b) => a - b);
          return [
            name,
            { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), n: sorted.length },
          ];
        }),
      ),
    }));
  return points;
}

function host(file) {
  if (!existsSync(file)) return [];
  const [, ...rows] = readFileSync(file, 'utf8').trim().split('\n');
  return rows.map((row, index) => {
    const [, cpu, load, mem, api, pg] = row.split(',');
    return {
      t: index * 5,
      cpu: Number(cpu),
      load: Number(load),
      memMb: Number(mem),
      apiMb: Number(api),
      postgresMb: Number(pg),
    };
  });
}

const commitFile = join(dir, 'commit.txt');
const result = {
  commit: existsSync(commitFile) ? readFileSync(commitFile, 'utf8').trim() : '',
  scenarios: {},
};
// Scenarios by their summaries; per-request samples are optional (runs before they were kept).
const scenarioNames = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, '').replace(/-(all-pages|first-page)$/, ''));
for (const scenario of new Set(scenarioNames)) {
  const file = `${scenario}-samples.csv.gz`;
  const summaryFile = readdirSync(dir).find(
    (name) =>
      name.endsWith('.json') && (name === `${scenario}.json` || name.startsWith(`${scenario}-`)),
  );
  const summary = summaryFile ? JSON.parse(readFileSync(join(dir, summaryFile), 'utf8')) : null;
  result.scenarios[scenario] = {
    summary: summary && {
      metrics: Object.fromEntries(
        Object.entries(summary.metrics).map(([name, metric]) => [name, metric.values]),
      ),
      durationMs: summary.state?.testRunDurationMs,
    },
    text: existsSync(join(dir, `${scenario}.txt`))
      ? readFileSync(join(dir, `${scenario}.txt`), 'utf8')
      : '',
    points: existsSync(join(dir, file)) ? await samples(join(dir, file)) : [],
    host: host(join(dir, `${scenario}-host.csv`)),
  };
}
process.stdout.write(JSON.stringify(result));
