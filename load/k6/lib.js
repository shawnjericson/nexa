// Shared by the scenarios: where the API is, the minted tokens, and a summary that keeps only
// what the report needs. Tokens come from apps/api/scripts/load-tokens.ts.
import http from 'k6/http';
import { SharedArray } from 'k6/data';

export const BASE = __ENV.BASE_URL || 'http://127.0.0.1:4200';
const OUT = __ENV.LOAD_OUT || '../out';

// One copy for every VU, not one each.
export const users = new SharedArray('users', () => JSON.parse(open(`${OUT}/users.json`)));
export const meta = JSON.parse(open(`${OUT}/meta.json`));

export const userAt = (index) => users[index % users.length];

export function get(path, token, name) {
  return http.get(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name },
  });
}

export function post(path, token, body, name) {
  return http.post(`${BASE}${path}`, JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    tags: { name },
  });
}

/** A threshold per request name, so the summary breaks the durations down by endpoint. */
export function perName(names, limit = 'p(95)<60000') {
  return Object.fromEntries(names.map((name) => [`http_req_duration{name:${name}}`, [limit]]));
}

export const TREND_STATS = ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'];

/** Writes the full summary as JSON next to the other results, and a short one to stdout. */
export function summaryTo(file) {
  return (data) => {
    const lines = [];
    for (const [name, metric] of Object.entries(data.metrics)) {
      // Request durations, and the scenarios' own measures (directory_ready).
      if (metric.type === 'trend' && metric.values.count !== undefined) {
        const v = metric.values;
        lines.push(
          `${name.padEnd(48)} p50 ${v.med.toFixed(0).padStart(6)} ms  p95 ${v['p(95)'].toFixed(0).padStart(6)} ms  max ${v.max.toFixed(0).padStart(6)} ms  n ${v.count}`,
        );
      }
    }
    const reqs = data.metrics.http_reqs?.values;
    const failed = data.metrics.http_req_failed?.values;
    if (reqs)
      lines.push(
        `requests ${reqs.count}, ${reqs.rate.toFixed(1)}/s, failed ${(100 * (failed?.rate ?? 0)).toFixed(2)}%`,
      );
    return { [file]: JSON.stringify(data, null, 2), stdout: `${lines.join('\n')}\n` };
  };
}
