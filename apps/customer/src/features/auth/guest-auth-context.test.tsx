import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuestAuthProvider, useGuestAuth } from './guest-auth-context';

function AuthStateProbe() {
  const { token, isTokenBootstrapComplete } = useGuestAuth();
  return <span>{`${isTokenBootstrapComplete ? 'ready' : 'bootstrapping'}:${token ?? 'none'}`}</span>;
}

function renderAuthState(initialToken?: string | null): string {
  const tokenProps = initialToken === undefined ? {} : { initialToken };
  return renderToStaticMarkup(
    <GuestAuthProvider {...tokenProps}>
      <AuthStateProbe />
    </GuestAuthProvider>,
  );
}

describe('GuestAuthProvider bootstrap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders without window and starts in a deterministic bootstrap state', () => {
    vi.stubGlobal('window', undefined);

    expect(renderAuthState()).toBe('<span>bootstrapping:none</span>');
  });

  it('does not inspect a development fragment during the first browser render', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: {
        hash: '#guestToken=dev_secret_token_123',
        pathname: '/',
        search: '',
      },
      history: { replaceState },
    });

    const browserFirstRender = renderAuthState();

    expect(browserFirstRender).toBe('<span>bootstrapping:none</span>');
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('uses an explicit initial token synchronously', () => {
    expect(renderAuthState('initial_token_123')).toBe('<span>ready:initial_token_123</span>');
  });
});
