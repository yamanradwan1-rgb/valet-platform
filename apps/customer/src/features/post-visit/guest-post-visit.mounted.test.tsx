import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installTestDom, type TestElement } from '../../app/guest-refresh-mounted.test-host';
import { LocaleProvider } from '../../i18n/locale-provider';
import type { GuestApiClient } from '../../lib/api/guest-api-client';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { ScreenCompleted } from '../session/screen-completed';
import { GuestPostVisitScreen } from './guest-post-visit-screen';

const visitId = '123e4567-e89b-12d3-a456-426614174000';
const completed: GuestSafeSession = {
  valetSessionId: visitId,
  state: 'COMPLETED',
  readyAt: '2026-10-08T12:00:00.000Z',
  vehicle: { make: 'Toyota', model: 'Camry', color: 'Black' },
};

const payment = {
  releaseRequiresPayment: true,
  releaseSatisfied: true,
  payment: {
    servicePayer: 'CUSTOMER' as const,
    serviceAmount: '12.500',
    tipAmount: '0',
    amountDue: '12.500',
    amountPaid: '12.500',
    currentValidation: null,
    currency: 'JOD',
    collectionMethod: 'CASH' as const,
    status: 'PAID' as const,
    paidAt: '2026-10-08T13:00:00.000Z',
  },
  refunds: [],
};

function client(options: { authorized?: boolean } = {}): GuestApiClient {
  const authorized = options.authorized ?? true;
  return {
    loadSession: vi.fn(async () => {
      if (!authorized) throw new Error('expired');
      return completed;
    }),
    loadPaymentProjection: vi.fn(async () => payment),
    submitRating: vi.fn(async (rating: number) => ({
      valetSessionId: visitId,
      rating,
      ratedAt: '2026-10-08T13:05:00.000Z',
    })),
  } as unknown as GuestApiClient;
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('T5 mounted production post-visit surfaces', () => {
  let root: Root | null = null;
  let container: TestElement;

  beforeEach(() => {
    const dom = installTestDom();
    container = dom.document.createElement('div');
    dom.document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    vi.restoreAllMocks();
  });

  async function mount(node: React.ReactNode, locale: 'ar' | 'en' = 'en', theme: 'dark' | 'light' = 'light') {
    root = createRoot(container as unknown as Element);
    document.documentElement.setAttribute('data-theme', theme);
    await act(async () => {
      root?.render(
        <LocaleProvider initialLocale={locale}>{node}</LocaleProvider>,
      );
      await flush();
    });
  }

  it.each([
    ['en', 'light', 'Payment summary', 'Rate your experience', 'ltr'],
    ['en', 'dark', 'Payment summary', 'Rate your experience', 'ltr'],
    ['ar', 'light', 'ملخص الدفع', 'قيّم تجربتك', 'rtl'],
    ['ar', 'dark', 'ملخص الدفع', 'قيّم تجربتك', 'rtl'],
  ] as const)('mounts approved completed entries in %s/%s', async (locale, theme, summary, rating, direction) => {
    await mount(
      <ScreenCompleted session={completed} onViewReceipt={() => {}} onRateExperience={() => {}} />,
      locale,
      theme,
    );
    expect(container.textContent).toContain(summary);
    expect(container.textContent).toContain(rating);
    expect(document.documentElement.dir).toBe(direction);
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
  });

  it.each([
    ['en', 'light', 'Payment summary', 'Amount paid'],
    ['en', 'dark', 'Payment summary', 'Amount paid'],
    ['ar', 'light', 'ملخص الدفع', 'المبلغ المدفوع'],
    ['ar', 'dark', 'ملخص الدفع', 'المبلغ المدفوع'],
  ] as const)('renders canonical payment summary in %s/%s without a receipt claim', async (locale, theme, title, paidLabel) => {
    const api = client();
    await mount(
      <GuestPostVisitScreen client={api} session={completed} surface="payment" onBack={() => {}} />,
      locale,
      theme,
    );
    expect(container.textContent).toContain(title);
    expect(container.textContent).toContain(paidLabel);
    expect(container.textContent).not.toContain('Receipt');
    expect(api.loadPaymentProjection).toHaveBeenCalledTimes(1);
  });

  it('revalidates the 24h canonical post-visit authority and fails closed when unavailable', async () => {
    const api = client({ authorized: false });
    await mount(<GuestPostVisitScreen client={api} session={completed} surface="payment" onBack={() => {}} />);
    expect(container.textContent).toBe('Back');
    expect(api.loadPaymentProjection).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'light', 'Rate your experience', '1 star'],
    ['en', 'dark', 'Rate your experience', '1 star'],
    ['ar', 'light', 'قيّم تجربتك', 'نجمة واحدة'],
    ['ar', 'dark', 'قيّم تجربتك', 'نجمة واحدة'],
  ] as const)('shows zero-preselection rating in %s/%s', async (locale, theme, title, firstStar) => {
    const api = client();
    await mount(
      <GuestPostVisitScreen client={api} session={completed} surface="rating" onBack={() => {}} />,
      locale,
      theme,
    );
    const buttons = container.querySelectorAll('button');
    const stars = buttons.filter((button) => button.getAttribute('aria-pressed') !== null);
    expect(container.textContent).toContain(title);
    expect(stars[0]?.getAttribute('aria-label')).toBe(firstStar);
    expect(stars.every((star) => star.getAttribute('aria-pressed') === 'false')).toBe(true);
    const submit = buttons.find((button) => button.textContent.includes(locale === 'en' ? 'Submit rating' : 'إرسال التقييم'))!;
    const reactKey = Object.keys(submit).find((name) => name.startsWith('__reactProps$'))!;
    expect((submit as unknown as Record<string, { disabled?: boolean }>)[reactKey]?.disabled).toBe(true);
  });

  it('keeps Help hidden without a verified Location support fact and shows only approved copy when verified', async () => {
    const api = client();
    await mount(<GuestPostVisitScreen client={api} session={completed} surface="help" onBack={() => {}} />);
    expect(container.textContent).toBe('');

    await act(async () => {
      root?.render(
        <LocaleProvider initialLocale="en">
          <GuestPostVisitScreen client={api} session={completed} surface="help" onsiteSupportVerified onBack={() => {}} />
        </LocaleProvider>,
      );
      await flush();
    });
    expect(container.textContent).toContain('Need assistance?');
    expect(container.textContent).toContain('Please speak with a valet staff member at this location.');
    expect(container.textContent).not.toContain('reception');
  });
});
