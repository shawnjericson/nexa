import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { isSameOrigin } from './session';

// Behind a reverse proxy, Next.js sees the upstream address, not the public one.
const UPSTREAM = 'http://127.0.0.1:3100/api/session/register';

const request = (headers: Record<string, string>, url = UPSTREAM) =>
  new NextRequest(url, { method: 'POST', headers });

describe('isSameOrigin', () => {
  it('accepts the public origin when the proxy passes the public host', () => {
    expect(
      isSameOrigin(request({ origin: 'https://nexa.example.com', host: 'nexa.example.com' })),
    ).toBe(true);
    expect(
      isSameOrigin(
        request({
          origin: 'https://nexa.example.com',
          host: '127.0.0.1:3100',
          'x-forwarded-host': 'nexa.example.com',
        }),
      ),
    ).toBe(true);
  });

  it('accepts a direct request to the Next.js server', () => {
    expect(
      isSameOrigin(request({ origin: 'http://localhost:3000' }, 'http://localhost:3000/x')),
    ).toBe(true);
  });

  it('refuses another site', () => {
    expect(
      isSameOrigin(request({ origin: 'https://evil.example', host: 'nexa.example.com' })),
    ).toBe(false);
    expect(isSameOrigin(request({ origin: 'not a url', host: 'nexa.example.com' }))).toBe(false);
  });

  it('lets requests without an Origin through (same-origin GETs and non-browser clients)', () => {
    expect(isSameOrigin(request({ host: 'nexa.example.com' }))).toBe(true);
  });
});
