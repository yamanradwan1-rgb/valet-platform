import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuestInformationResponse } from '@valet/contracts';

import { findElement, installTestDom, invokeReactClick,
  TestElement, type TestDocument, type TestNode } from '../../app/guest-refresh-mounted.test-host';
import type { GuestApiClient } from '../../lib/api/guest-api-client';

vi.mock('../../i18n/use-translation', () => ({
  useTranslation: () => ({ locale: 'en', isRtl: false,
    toggleLocale: vi.fn(), t: (key: string) => key }),
}));
vi.mock('../../theme/use-theme', () => ({
  useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }),
}));

import { OverlayMoreMenu } from './overlay-more-menu';

const information: GuestInformationResponse = {
  locale: 'en',
  privacy: { status: 'PUBLISHED', text: 'Published policy for this visit',
    url: null, version: 1, publishedAt: '2026-10-22T12:00:00.000Z' },
  contact: { displayName: 'Visit operator', phone: '+962791234567',
    hours: null, supportUrl: null },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function countDialogs(node: TestNode): number {
  const current = node instanceof TestElement && node.getAttribute('role') === 'dialog' ? 1 : 0;
  return current + node.childNodes.reduce((count, child) => count + countDialogs(child), 0);
}

describe('#316 More details mounted flow', () => {
  let root: Root | null;
  let container: TestElement;
  let document: TestDocument;
  beforeEach(() => {
    ({ document } = installTestDom());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    vi.restoreAllMocks();
  });

  it('preserves More rows, removes Photos and opens real privacy/contact details', async () => {
    const loadInformation = vi.fn().mockResolvedValue(information);
    const client = { loadInformation } as unknown as GuestApiClient;
    await act(async () => root?.render(<OverlayMoreMenu open onClose={() => {}} client={client} />));
    expect(countDialogs(container)).toBe(1);
    expect(container.textContent).not.toContain('menu.photosLabel');
    expect(container.textContent).toContain('menu.darkModeLabel');
    expect(container.textContent).toContain('menu.languageLabel');
    await act(async () => invokeReactClick(findElement(container, 'button', 'menu.privacyLabel')));
    expect(countDialogs(container)).toBe(1);
    expect(loadInformation).toHaveBeenCalledWith('en', expect.any(AbortSignal));
    expect(container.textContent).toContain('Published policy for this visit');
    expect(container.textContent).not.toContain('menu.languageLabel');
    const detailClose = container.querySelectorAll('button').find(
      (button) => button.getAttribute('aria-label') === 'common.close',
    );
    expect(detailClose).toBeDefined();
    await act(async () => invokeReactClick(detailClose!));
    expect(countDialogs(container)).toBe(1);
    expect(container.textContent).toContain('menu.languageLabel');
    expect(document.activeElement).toBe(findElement(container, 'button', 'menu.privacyLabel'));
  });

  it('does not show the previous visit result after the credential client changes', async () => {
    const pending = deferred<GuestInformationResponse>();
    const oldClient = { loadInformation: vi.fn().mockReturnValue(pending.promise) } as unknown as GuestApiClient;
    const newClient = { loadInformation: vi.fn().mockResolvedValue({
      ...information, contact: { ...information.contact, displayName: 'New visit operator' },
    }) } as unknown as GuestApiClient;
    await act(async () => root?.render(<OverlayMoreMenu open onClose={() => {}} client={oldClient} />));
    await act(async () => invokeReactClick(findElement(container, 'button', 'menu.contactLabel')));
    await act(async () => root?.render(<OverlayMoreMenu open onClose={() => {}} client={newClient} />));
    expect(container.textContent).toContain('New visit operator');
    await act(async () => pending.resolve(information));
    expect(container.textContent).not.toContain('Visit operator');
    expect(container.textContent).toContain('New visit operator');
  });

  it('renders a recoverable read error and retries only on user action', async () => {
    const loadInformation = vi.fn().mockRejectedValueOnce(new Error('API down'))
      .mockResolvedValueOnce(information);
    const client = { loadInformation } as unknown as GuestApiClient;
    await act(async () => root?.render(<OverlayMoreMenu open onClose={() => {}} client={client} />));
    await act(async () => invokeReactClick(findElement(container, 'button', 'menu.contactLabel')));
    expect(container.textContent).toContain('information.loadFailed');
    expect(loadInformation).toHaveBeenCalledTimes(1);
    await act(async () => invokeReactClick(findElement(container, 'button', 'common.tryAgain')));
    expect(loadInformation).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Visit operator');
  });
});
