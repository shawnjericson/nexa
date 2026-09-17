// Messages in channels of different sizes, one after the other, while others keep reading.
// Sending is the path that fans out: to every member's socket and, for notifications, to every
// member's bell.
import { check } from 'k6';
import { get, meta, perName, post, summaryTo, TREND_STATS, userAt } from './lib.js';

function sender(slug) {
  return (index) => {
    const channel = meta.channels[slug];
    const token = channel.senders[index % channel.senders.length];
    const res = post(
      `/api/v1/conversations/${channel.id}/messages`,
      token,
      {
        content: `Tin nhắn kiểm thử tải ${index}`,
        client_message_id: `load-${slug}-${__VU}-${__ITER}-${Date.now()}`,
      },
      `send ${slug}`,
    );
    check(res, { sent: (r) => r.status === 201 });
  };
}

const sendTeam = sender('nhom-1');
const send1000 = sender('kenh-1000');
const send5000 = sender('kenh-5000');
const sendAll = sender('toan-cong-ty');

// Each size gets 45 seconds. A message every two seconds is a lively channel; the two biggest
// get fewer, because before the fix a single message there was enough to keep the database busy.
const stage = (exec, startTime, timeUnit) => ({
  executor: 'constant-arrival-rate',
  exec,
  rate: 1,
  timeUnit,
  duration: '45s',
  startTime,
  preAllocatedVUs: 5,
  maxVUs: 60,
  gracefulStop: '90s',
});

export const options = {
  scenarios: {
    team: stage('team', '0s', '2s'),
    channel1000: stage('channel1000', '1m', '2s'),
    channel5000: stage('channel5000', '2m', '5s'),
    everyone: stage('everyone', '3m30s', '10s'),
    readers: {
      executor: 'constant-arrival-rate',
      exec: 'reader',
      rate: 20,
      timeUnit: '1s',
      duration: '5m30s',
      preAllocatedVUs: 20,
      maxVUs: 200,
    },
  },
  thresholds: perName([
    'send nhom-1',
    'send kenh-1000',
    'send kenh-5000',
    'send toan-cong-ty',
    'reader',
  ]),
  summaryTrendStats: TREND_STATS,
};

export function team() {
  sendTeam(__ITER);
}
export function channel1000() {
  send1000(__ITER);
}
export function channel5000() {
  send5000(__ITER);
}
export function everyone() {
  sendAll(__ITER);
}
export function reader() {
  const res = get('/api/v1/conversations?limit=30', userAt(__ITER).token, 'reader');
  check(res, { listed: (r) => r.status === 200 });
}

export const handleSummary = summaryTo(`${__ENV.RESULTS || '.'}/chat.json`);
