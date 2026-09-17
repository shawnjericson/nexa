// Opening the directory (and the home page, which asks for the same list): the time until the
// page has what it shows. MODE=all-pages is how the web app did it before - every page of
// members, 50 at a time, then presence for all of them; MODE=first-page is one page of 50 and the
// presence of those 50.
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE, meta, perName, summaryTo, TREND_STATS, userAt } from './lib.js';

const MODE = __ENV.MODE || 'all-pages';
const ready = new Trend('directory_ready', true);
const requests = new Trend('directory_requests');

export const options = {
  scenarios: {
    directory: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: { ...perName(['members', 'presence']), directory_ready: ['p(95)<600000'] },
  summaryTrendStats: TREND_STATS,
};

export default function () {
  const { token } = userAt(__VU * 31 + __ITER);
  const headers = { Authorization: `Bearer ${token}` };
  const members = `${BASE}/api/v1/organizations/${meta.organizationId}/members`;
  const started = Date.now();
  let count = 0;
  const ids = [];

  const lastPage = MODE === 'all-pages' ? 50 : 1;
  for (let page = 1; page <= lastPage; page++) {
    const res = http.get(
      `${members}?page=${page}&limit=50${MODE === 'all-pages' ? '' : '&sort=name'}`,
      {
        headers,
        tags: { name: 'members' },
      },
    );
    count++;
    if (!check(res, { 'members 200': (r) => r.status === 200 })) return;
    const body = res.json();
    for (const member of body.data) if (member.user) ids.push(member.user.id);
    if (!body.pagination.has_next) break;
  }
  for (let start = 0; start < ids.length; start += 100) {
    const res = http.get(
      `${BASE}/api/v1/presence?user_ids=${ids.slice(start, start + 100).join(',')}`,
      {
        headers,
        tags: { name: 'presence' },
      },
    );
    count++;
    check(res, { 'presence 200': (r) => r.status === 200 });
  }
  ready.add(Date.now() - started);
  requests.add(count);
}

export const handleSummary = summaryTo(`${__ENV.RESULTS || '.'}/directory-${MODE}.json`);
