/**
 * Turns two runs of load/run.sh into Markdown tables and a p95 chart (docs/performance.md was written from them):
 *
 *   node load/report.mjs <before-dir> <after-dir> [out-dir]
 *
 * Each directory holds what run.sh wrote: k6's JSON summaries and the host samples (CSV).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [beforeDir, afterDir, outDir = 'load/results/report'] = process.argv.slice(2);
if (!beforeDir || !afterDir)
  throw new Error('usage: report.mjs <before-dir> <after-dir> [out-dir]');

const load = (dir, file) =>
  existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), 'utf8')) : null;

function trend(summary, name) {
  const values = summary?.metrics?.[name]?.values;
  return values ? { p50: values.med, p95: values['p(95)'], count: values.count } : null;
}

function failed(summary) {
  return summary?.metrics?.http_req_failed?.values?.rate ?? null;
}

function host(dir, scenario) {
  const file = join(dir, `${scenario}-host.csv`);
  if (!existsSync(file)) return null;
  const rows = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.split(','));
  if (rows.length === 0) return null;
  const cpu = rows.map((row) => Number(row[1]));
  return {
    cpuAvg: cpu.reduce((a, b) => a + b, 0) / cpu.length,
    load: Math.max(...rows.map((row) => Number(row[2]))),
    apiMb: Math.max(...rows.map((row) => Number(row[4]))),
  };
}

const ms = (value) => {
  if (value === null || value === undefined) return '-';
  if (value >= 59_900) return '≥ 60 s (timeout)';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
};
const pct = (value) =>
  value === null ? '-' : `${(value * 100).toFixed(value > 0 && value < 0.01 ? 2 : 0)}%`;

const scenarios = {
  login: {
    title: 'Sign-ins ramping to 20 a second, with 20 other requests a second',
    rows: [
      ['Sign in (`POST /auth/login`)', 'http_req_duration{name:login}'],
      ['Everyone else (`GET /users/me`)', 'http_req_duration{name:bystander}'],
    ],
  },
  browse: {
    title: 'Browsing, ramping to 400 people at once',
    rows: [
      ['Profile (`/users/me`)', 'http_req_duration{name:me}'],
      ['Feed (`/feed`)', 'http_req_duration{name:feed}'],
      ['Conversations (`/conversations`)', 'http_req_duration{name:conversations}'],
      ['Unread count (`/notifications/unread-count`)', 'http_req_duration{name:unread}'],
      ['Search (`/search`)', 'http_req_duration{name:search}'],
    ],
  },
  chat: {
    title: 'Sending messages to channels of growing size, while others read',
    rows: [
      ['Send to a team of 20', 'http_req_duration{name:send nhom-1}'],
      ['Send to a channel of 1,000', 'http_req_duration{name:send kenh-1000}'],
      ['Send to a channel of 5,000', 'http_req_duration{name:send kenh-5000}'],
      ['Send to everyone (20,000)', 'http_req_duration{name:send toan-cong-ty}'],
      ['Reading conversations meanwhile', 'http_req_duration{name:reader}'],
    ],
  },
};

const lines = [];
const chart = [];
for (const [scenario, { title, rows }] of Object.entries(scenarios)) {
  const before = load(beforeDir, `${scenario}.json`);
  const after = load(afterDir, `${scenario}.json`);
  const hostBefore = host(beforeDir, scenario);
  const hostAfter = host(afterDir, scenario);
  lines.push(`### ${title}`, '');
  lines.push('| Request | Before p50 | Before p95 | After p50 | After p95 |');
  lines.push('| ------- | ---------: | ---------: | --------: | --------: |');
  for (const [label, metric] of rows) {
    const b = trend(before, metric);
    const a = trend(after, metric);
    if (!b?.count && !a?.count) continue;
    lines.push(`| ${label} | ${ms(b?.p50)} | ${ms(b?.p95)} | ${ms(a?.p50)} | ${ms(a?.p95)} |`);
    chart.push({
      label: label.replace(/ \(`[^)]*`\)/, ''),
      before: b?.p95 ?? 0,
      after: a?.p95 ?? 0,
    });
  }
  lines.push(
    '',
    `Failed requests: ${pct(failed(before))} before, ${pct(failed(after))} after.` +
      (hostBefore && hostAfter
        ? ` Server CPU averaged ${Math.round(hostBefore.cpuAvg)}% before and ${Math.round(hostAfter.cpuAvg)}% after.`
        : ''),
    '',
  );
}

const directoryBefore = trend(load(beforeDir, 'directory-all-pages.json'), 'directory_ready');
const directoryAfter = trend(load(afterDir, 'directory-first-page.json'), 'directory_ready');
const requestsBefore = trend(load(beforeDir, 'directory-all-pages.json'), 'directory_requests');
const requestsAfter = trend(load(afterDir, 'directory-first-page.json'), 'directory_requests');
if (directoryBefore && directoryAfter) {
  lines.push('### Opening the directory (10 people at a time)', '');
  lines.push('| | Requests per opening | p50 | p95 |');
  lines.push('| - | -: | -: | -: |');
  lines.push(
    `| Before: every page, then everyone's presence | ${Math.round(requestsBefore?.p50 ?? 0)} | ${ms(directoryBefore.p50)} | ${ms(directoryBefore.p95)} |`,
  );
  lines.push(
    `| After: the first 50, and their presence | ${Math.round(requestsAfter?.p50 ?? 0)} | ${ms(directoryAfter.p50)} | ${ms(directoryAfter.p95)} |`,
  );
  lines.push('');
  chart.push({
    label: 'Open the directory',
    before: directoryBefore.p95,
    after: directoryAfter.p95,
  });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'results.md'), `${lines.join('\n')}\n`);

// A horizontal bar chart of p95 before and after, on a log scale: the differences span 1,000x.
const width = 880;
const rowHeight = 46;
const left = 250;
const plot = width - left - 90;
const height = 70 + chart.length * rowHeight;
const scale = (value) => {
  const v = Math.max(value, 5);
  return ((Math.log10(v) - Math.log10(5)) / (Math.log10(60_000) - Math.log10(5))) * plot;
};
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="Inter, Segoe UI, sans-serif">`,
  `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
  `<text x="20" y="30" font-size="16" font-weight="600" fill="#1f2328">95th percentile response time, before and after (log scale)</text>`,
  `<rect x="${left}" y="44" width="12" height="12" fill="#c2410c"/><text x="${left + 18}" y="54" font-size="12" fill="#57606a">before</text>`,
  `<rect x="${left + 80}" y="44" width="12" height="12" fill="#0a8a74"/><text x="${left + 98}" y="54" font-size="12" fill="#57606a">after</text>`,
];
chart.forEach((row, index) => {
  const y = 70 + index * rowHeight;
  svg.push(`<text x="20" y="${y + 20}" font-size="13" fill="#1f2328">${esc(row.label)}</text>`);
  svg.push(
    `<rect x="${left}" y="${y + 4}" width="${Math.max(scale(row.before), 2)}" height="14" rx="2" fill="#c2410c"/>`,
  );
  svg.push(
    `<text x="${left + Math.max(scale(row.before), 2) + 6}" y="${y + 15}" font-size="11" fill="#57606a">${esc(ms(row.before))}</text>`,
  );
  svg.push(
    `<rect x="${left}" y="${y + 22}" width="${Math.max(scale(row.after), 2)}" height="14" rx="2" fill="#0a8a74"/>`,
  );
  svg.push(
    `<text x="${left + Math.max(scale(row.after), 2) + 6}" y="${y + 33}" font-size="11" fill="#57606a">${esc(ms(row.after))}</text>`,
  );
});
svg.push('</svg>');
writeFileSync(join(outDir, 'p95.svg'), `${svg.join('\n')}\n`);
console.log(`${join(outDir, 'results.md')} and ${join(outDir, 'p95.svg')}`);
