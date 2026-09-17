/**
 * Walks a freshly started NEXA API through what a first visitor and the exam do: the readiness
 * check, "try the demo", and the exam's register -> login -> post -> list flow. It creates
 * accounts, so point it at a local API only:
 *
 *   node scripts/smoke-test.mjs [http://localhost:4000]
 */
const base = (process.argv[2] ?? 'http://localhost:4000').replace(/\/+$/, '');

async function call(method, path, { body, token, expect } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (res.status !== expect) {
    throw new Error(
      `${method} ${path}: expected ${expect}, got ${res.status} ${JSON.stringify(json)}`,
    );
  }
  console.log(`ok  ${method} ${path} -> ${res.status}`);
  return json;
}

async function waitUntilReady() {
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      const res = await fetch(`${base}/ready`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${base}/ready did not answer within a minute`);
}

await waitUntilReady();
await call('GET', '/ready', { expect: 200 });

const demo = await call('POST', '/api/v1/auth/demo', { expect: 201 });
const feed = await call('GET', '/api/v1/feed', { token: demo.data.access_token, expect: 200 });
if (feed.data.length === 0) throw new Error('The demo organization has no posts: was it seeded?');

const stamp = Date.now().toString(36);
const account = {
  username: `smoke_${stamp}`,
  email: `smoke-${stamp}@example.com`,
  password: 'secret123',
};
await call('POST', '/api/auth/register', { body: account, expect: 201 });
const login = await call('POST', '/api/auth/login', {
  body: { email: account.email, password: account.password },
  expect: 200,
});
const token = login.data.access_token;
await call('POST', '/api/posts', {
  token,
  body: { content: 'Hello from the smoke test' },
  expect: 201,
});
await call('GET', '/api/posts?page=1&limit=5', { token, expect: 200 });

console.log('The API works end to end.');
