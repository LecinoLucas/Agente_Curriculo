import { describe, expect, it } from 'vitest';

import { alignApiHostToPage } from '../publicApiClient';

const LOCAL_BASE = 'http://localhost:8000/api/v1/public';

describe('alignApiHostToPage', () => {
  it('rewrites a local API host to match the page host in dev', () => {
    // Page opened on 127.0.0.1 while the API is pinned to localhost: without this
    // the SameSite=Lax session cookie would be cross-site and /me would 401.
    expect(alignApiHostToPage(LOCAL_BASE, '127.0.0.1', true)).toBe(
      'http://127.0.0.1:8000/api/v1/public',
    );
  });

  it('also realigns to a LAN dev host', () => {
    expect(alignApiHostToPage(LOCAL_BASE, '192.168.1.88', true)).toBe(
      'http://192.168.1.88:8000/api/v1/public',
    );
  });

  it('is a no-op when the page host already matches the API host', () => {
    expect(alignApiHostToPage(LOCAL_BASE, 'localhost', true)).toBe(LOCAL_BASE);
  });

  it('never rewrites in production builds', () => {
    expect(alignApiHostToPage(LOCAL_BASE, '127.0.0.1', false)).toBe(LOCAL_BASE);
  });

  it('never rewrites an intentionally remote (non-local) API host', () => {
    const remote = 'https://api.marajo.example.com/api/v1/public';
    expect(alignApiHostToPage(remote, '127.0.0.1', true)).toBe(remote);
  });

  it('returns the original base unchanged when there is no page host', () => {
    expect(alignApiHostToPage(LOCAL_BASE, null, true)).toBe(LOCAL_BASE);
  });

  it('keeps scheme, port and path while swapping only the host', () => {
    expect(
      alignApiHostToPage('http://localhost:9999/custom/base', '127.0.0.1', true),
    ).toBe('http://127.0.0.1:9999/custom/base');
  });
});
