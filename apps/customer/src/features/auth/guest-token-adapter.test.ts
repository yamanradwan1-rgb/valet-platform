import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractGuestFragmentToken } from './guest-token-adapter';

const VALID_TOKEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_';

function stubBrowser(hash: string, replaceState: () => void = vi.fn()) {
  const replaceStateSpy = vi.fn(replaceState);
  vi.stubGlobal('window', {
    location: {
      hash,
      pathname: '/app',
      search: '?foo=bar',
    },
    history: {
      replaceState: replaceStateSpy,
    },
  });
  return replaceStateSpy;
}

describe('extractGuestFragmentToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns null during SSR and never touches history', () => {
    const scrub = vi.fn();
    vi.stubGlobal('window', undefined);
    // A window-less (server) environment must not read any document state.
    expect(extractGuestFragmentToken()).toBeNull();
    expect(scrub).not.toHaveBeenCalled();
  });

  it('adopts an exact production fragment and scrubs it immediately', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const replaceStateSpy = stubBrowser(`#guestToken=${VALID_TOKEN}`);

    const token = extractGuestFragmentToken();

    expect(token).toBe(VALID_TOKEN);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/app?foo=bar');
  });

  it('rejects a malformed guest token but still scrubs the fragment', () => {
    const replaceStateSpy = stubBrowser('#guestToken=too_short');

    const token = extractGuestFragmentToken();

    expect(token).toBeNull();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/app?foo=bar');
  });

  it('rejects extra content after the token', () => {
    const replaceStateSpy = stubBrowser(
      `#guestToken=${VALID_TOKEN}&extra=1`,
    );

    expect(extractGuestFragmentToken()).toBeNull();
    expect(replaceStateSpy).toHaveBeenCalledOnce();
  });

  it('fails closed when safe scrubbing does not succeed', () => {
    stubBrowser(`#guestToken=${VALID_TOKEN}`, () => {
      throw new Error('replaceState unavailable');
    });

    expect(extractGuestFragmentToken()).toBeNull();
  });

  it('ignores unrelated hash fragments without scrubbing them', () => {
    const replaceStateSpy = stubBrowser('#section-1');

    expect(extractGuestFragmentToken()).toBeNull();
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });
});
