// A crowd signing in at once - a class starting an exam, the morning at a company - while other
// people are simply using NEXA. Password hashing is deliberately slow; the question is whether
// it slows down everyone else too.
import { check } from 'k6';
import { get, perName, post, summaryTo, TREND_STATS, userAt } from './lib.js';

const PEOPLE = Number(__ENV.PEOPLE || 20000);

export const options = {
  scenarios: {
    logins: {
      executor: 'ramping-arrival-rate',
      exec: 'login',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '30s', target: 10 },
        { duration: '30s', target: 20 },
        { duration: '30s', target: 20 },
      ],
    },
    // Everyone else: a steady 20 requests a second that have nothing to do with signing in.
    bystanders: {
      executor: 'constant-arrival-rate',
      exec: 'bystander',
      rate: 20,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 20,
      maxVUs: 200,
    },
  },
  thresholds: perName(['login', 'bystander']),
  summaryTrendStats: TREND_STATS,
};

export function login() {
  const n = 1 + Math.floor(Math.random() * PEOPLE);
  const res = post(
    '/api/v1/auth/login',
    null,
    { email: `user${n}@load.nexa.local`, password: 'loadtest123' },
    'login',
  );
  check(res, { 'signed in': (r) => r.status === 200 });
}

export function bystander() {
  const res = get('/api/v1/users/me', userAt(__ITER).token, 'bystander');
  check(res, { 'profile loaded': (r) => r.status === 200 });
}

export const handleSummary = summaryTo(`${__ENV.RESULTS || '.'}/login.json`);
