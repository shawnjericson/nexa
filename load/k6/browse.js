// People using NEXA the ordinary way - home, feed, conversations, the bell, now and then a search
// - with a few seconds between pages. The number of people grows until the server gives out.
import { check, sleep } from 'k6';
import { get, perName, summaryTo, TREND_STATS, userAt } from './lib.js';

const PEAK = Number(__ENV.PEAK || 400);
const SEARCHES = ['báo cáo', 'onboarding', 'bảo mật', 'Nguyễn Minh', 'deploy', 'thiết kế'];

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.round(PEAK / 4) },
        { duration: '1m', target: Math.round(PEAK / 2) },
        { duration: '1m', target: PEAK },
        { duration: '1m', target: PEAK },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: perName(['me', 'feed', 'conversations', 'unread', 'search']),
  summaryTrendStats: TREND_STATS,
};

export default function () {
  const { token } = userAt(__VU * 13 + __ITER);
  const pages = [
    get('/api/v1/users/me', token, 'me'),
    get('/api/v1/feed?limit=20', token, 'feed'),
    get('/api/v1/conversations?limit=30', token, 'conversations'),
    get('/api/v1/notifications/unread-count', token, 'unread'),
  ];
  if (__ITER % 4 === 0) {
    const q = SEARCHES[(__VU + __ITER) % SEARCHES.length];
    pages.push(get(`/api/v1/search?q=${encodeURIComponent(q)}`, token, 'search'));
  }
  check(pages, { 'all 200': (list) => list.every((r) => r.status === 200) });
  sleep(2 + Math.random() * 3);
}

export const handleSummary = summaryTo(`${__ENV.RESULTS || '.'}/browse.json`);
