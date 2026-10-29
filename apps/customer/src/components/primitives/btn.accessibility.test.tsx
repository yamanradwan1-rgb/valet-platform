import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GuestFreshnessNotice } from '../../app/guest-freshness-notice';
import { GuestLiveRating } from '../../features/rating/guest-live-rating';
import {
  installTestDom,
  invokeReactClick,
  type TestDocument,
  type TestElement,
} from '../../app/guest-refresh-mounted.test-host';
import { LocaleProvider } from '../../i18n/locale-provider';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import { Btn } from './btn';

let root: Root;
let container: TestElement;
let document: TestDocument;

async function mount(tree: React.ReactNode) {
  await act(async () => { root.render(tree); });
}

function button(): TestElement {
  const element = container.querySelector('button');
  expect(element).not.toBeNull();
  return element!;
}

function isDisabled(element: TestElement): boolean {
  // The repository's minimal DOM host stores attributes without reflecting them
  // onto native boolean properties; the browser check covers actual disabled behavior.
  return element.getAttribute('disabled') !== null;
}

function expectLoadingName(action: string, element = button()) {
  expect(isDisabled(element)).toBe(true);
  expect(element.getAttribute('aria-busy')).toBe('true');
  expect(element.textContent).toBe(action);
  expect(element.childNodes).toHaveLength(2);
  const spinner = element.childNodes[0] as TestElement;
  const hiddenLabel = element.childNodes[1] as TestElement;
  expect(spinner.getAttribute('aria-hidden')).toBe('true');
  expect(spinner.getAttribute('class')).toBe('spin');
  expect(spinner.style.width).toBe('18px');
  expect(spinner.style.height).toBe('18px');
  expect(hiddenLabel.style.position).toBe('absolute');
  expect(hiddenLabel.style.clip).toBe('rect(0, 0, 0, 0)');
  expect(hiddenLabel.textContent).toBe(action);
}

beforeEach(() => {
  ({ document } = installTestDom());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  vi.restoreAllMocks();
});

describe('shared Guest Btn accessibility', () => {
  it('keeps the text of nested React children when loading', async () => {
    await mount(<Btn loading><strong>Submit</strong> rating</Btn>);
    expectLoadingName('Submit rating');
    expect(button().getAttribute('aria-label')).toBeNull();
  });

  it('retains the action through idle, loading, success and error without replacing the native button', async () => {
    const onClick = vi.fn();
    const action = 'Request vehicle';
    await mount(<Btn onClick={onClick}>{action}</Btn>);
    const firstButton = button();
    expect(firstButton.nodeName).toBe('BUTTON');
    expect(firstButton.getAttribute('type')).toBe('button');
    expect(firstButton.getAttribute('aria-busy')).toBe('false');
    expect(isDisabled(firstButton)).toBe(false);
    firstButton.focus();
    expect(document.activeElement).toBe(firstButton);
    invokeReactClick(firstButton);
    expect(onClick).toHaveBeenCalledTimes(1);

    await mount(<Btn onClick={onClick} loading>{action}</Btn>);
    expect(button()).toBe(firstButton);
    expectLoadingName(action);
    expect(button().getAttribute('tabindex')).toBeNull();

    // Parent settles either successfully or with an error; the action is usable again.
    await mount(<Btn onClick={onClick}>{action}</Btn>);
    expect(button()).toBe(firstButton);
    expect(button().getAttribute('aria-busy')).toBe('false');
    expect(isDisabled(button())).toBe(false);
    button().focus();
    expect(document.activeElement).toBe(firstButton);
    invokeReactClick(button());

    await mount(<Btn onClick={onClick} loading>{action}</Btn>);
    expectLoadingName(action);
    await mount(<Btn onClick={onClick}>{action}</Btn>);
    expect(button().textContent).toBe(action);
    expect(isDisabled(button())).toBe(false);
    invokeReactClick(button());
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['en', 'ltr', 'Refresh status'],
    ['ar', 'rtl', 'تحديث الحالة'],
  ] as const)('retains the real refresh action in %s / %s through loading', async (locale, direction, action) => {
    const onRefresh = vi.fn();
    const notice = (isRefreshing: boolean) => (
      <LocaleProvider initialLocale={locale}>
        <GuestFreshnessNotice
          visible cooldownSeconds={0} isRefreshing={isRefreshing} onRefresh={onRefresh}
        />
      </LocaleProvider>
    );
    await mount(notice(false));
    expect((document.documentElement as unknown as { dir: string }).dir).toBe(direction);
    expect(button().textContent).toBe(action);
    expect(isDisabled(button())).toBe(false);
    await mount(notice(true));
    expectLoadingName(action);
    await mount(notice(false));
    expect(button().getAttribute('aria-busy')).toBe('false');
    expect(button().textContent).toBe(action);
    expect(isDisabled(button())).toBe(false);
  });

  it.each([
    ['en', 'Submit rating', 'saved'],
    ['en', 'Submit rating', 'failed'],
    ['ar', 'إرسال التقييم', 'saved'],
    ['ar', 'إرسال التقييم', 'failed'],
  ] as const)('keeps rating identity in %s (%s) through saving to %s', async (locale, action, outcome) => {
    let resolve!: (result: { valetSessionId: string }) => void;
    let reject!: (reason: Error) => void;
    const pending = new Promise<{ valetSessionId: string }>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const submitRating = vi.fn(() => pending);
    const client = { submitRating } as unknown as GuestApiClient;
    await mount(
      <LocaleProvider initialLocale={locale}>
        <GuestLiveRating client={client} visitId="visit-360" canRate onBack={() => {}} />
      </LocaleProvider>,
    );
    const buttons = container.querySelectorAll('button');
    const submit = buttons[5]!;
    await act(async () => { invokeReactClick(buttons[4]!); });
    expect(submit.textContent).toBe(action);
    expect(isDisabled(submit)).toBe(false);
    await act(async () => { invokeReactClick(submit); });
    expectLoadingName(action, submit);
    expect(submitRating).toHaveBeenCalledWith(5);

    await act(async () => {
      if (outcome === 'saved') resolve({ valetSessionId: 'visit-360' });
      else reject(new Error('rating failed'));
      await pending.catch(() => undefined);
    });
    expect(submit.textContent).toBe(action);
    expect(submit.getAttribute('aria-busy')).toBe('false');
    expect(isDisabled(submit)).toBe(outcome === 'saved');
  });
});
