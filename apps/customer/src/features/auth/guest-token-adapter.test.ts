import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extractDevFragmentToken } from './guest-token-adapter';

describe('extractDevFragmentToken', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('extracts token from hash and scrubs history in development mode', () => {
    const replaceStateSpy = vi.fn();
    vi.stubGlobal('window', {
      location: {
        hash: '#guestToken=dev_secret_token_123',
        pathname: '/app',
        search: '?foo=bar',
      },
      history: {
        replaceState: replaceStateSpy,
      },
    });

    const token = extractDevFragmentToken();

    expect(token).toBe('dev_secret_token_123');
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/app?foo=bar');
  });

  it('returns null and does not extract token in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const replaceStateSpy = vi.fn();
    vi.stubGlobal('window', {
      location: {
        hash: '#guestToken=prod_secret_token_123',
        pathname: '/app',
        search: '',
      },
      history: {
        replaceState: replaceStateSpy,
      },
    });

    const token = extractDevFragmentToken();

    expect(token).toBeNull();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('returns null when hash does not contain guestToken', () => {
    vi.stubGlobal('window', {
      location: {
        hash: '#section-1',
        pathname: '/app',
        search: '',
      },
      history: {
        replaceState: vi.fn(),
      },
    });

    const token = extractDevFragmentToken();
    expect(token).toBeNull();
  });
});
