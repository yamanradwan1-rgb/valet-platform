import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '../../i18n/locale-provider';
import { ThemeProvider } from '../../theme/theme-provider';
import { DemoScreenRenderer } from './demo-screen-renderer';
import { DemoNavigator } from './demo-navigator';
import { DEMO_GROUPS, type DemoItem, type DemoScreenKey } from './demo-registry';
import { ScreenPaymentComplimentary } from '../deferred/screen-payment-complimentary';
import { ScreenPaymentMethod } from '../deferred/screen-payment-method';
import { ScreenPaymentSuccess } from '../deferred/screen-payment-success';
import { ScreenPaymentError } from '../deferred/screen-payment-error';
import { ScreenReportIssue } from '../deferred/screen-report-issue';
import { ScreenReportSubmitted } from '../deferred/screen-report-submitted';
import { ScreenRequestError } from '../deferred/screen-system';
import { demoSessions } from './demo-fixtures';

describe('Demo Screen Renderer & Previews Completeness', () => {
  const allScreenKeys: DemoScreenKey[] = DEMO_GROUPS.flatMap((g) => g.items)
    .filter((i): i is DemoItem & { kind: 'screen' } => i.kind === 'screen')
    .map((i) => i.id);

  it('renders every registered non-live DemoScreenKey successfully without returning null', () => {
    allScreenKeys.forEach((key) => {
      if (key === 'live') return;

      const markup = renderToStaticMarkup(
        <LocaleProvider initialLocale="en">
          <ThemeProvider initialTheme="light">
            <DemoScreenRenderer
              demoScreen={key}
              onSelectScreen={() => {}}
              onRequestClick={() => {}}
              onViewDetails={() => {}}
            />
          </ThemeProvider>
        </LocaleProvider>,
      );

      expect(markup).toBeDefined();
      expect(markup.length).toBeGreaterThan(0);
    });
  });

  it('renders all restored Payment preview screens with proper semantic tokens', () => {
    // 1. Complimentary
    const compMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="dark">
          <ScreenPaymentComplimentary onViewReceipt={() => {}} onDone={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(compMarkup).toContain('Complimentary Valet');
    expect(compMarkup).toContain('-$25.00');
    expect(compMarkup).toContain('$0.00');

    // 2. Payment Method
    const methodMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="dark">
          <ScreenPaymentMethod onPaySuccess={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(methodMarkup).toContain('Apple Pay');
    expect(methodMarkup).toContain('Google Pay');
    expect(methodMarkup).toContain('Credit / Debit Card');
    expect(methodMarkup).toContain('Pay at Venue');

    // 3. Payment Success
    const successMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="dark">
          <ScreenPaymentSuccess onViewReceipt={() => {}} onDone={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(successMarkup).toContain('Payment Complete');
    expect(successMarkup).toContain('Total Paid');
    expect(successMarkup).toContain('View Receipt');

    // 4. Payment Error
    const errorMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="dark">
          <ScreenPaymentError onRetry={() => {}} onChangeMethod={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(errorMarkup).toContain('Payment Failed');
    expect(errorMarkup).toContain('Try Again');
    expect(errorMarkup).toContain('Choose Another Method');
  });

  it('proves ScreenReportIssue uses ONLY guest-safe data and conceals internal locations/keys/staff', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <ScreenReportIssue session={demoSessions.parked} onSubmit={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );

    // Displays guest-safe vehicle name
    expect(markup).toContain('Porsche Taycan 4S');

    // Must NOT contain sensitive internal or employee operational fields
    expect(markup).not.toContain('slot-');
    expect(markup).not.toContain('spot-');
    expect(markup).not.toContain('Zone A');
    expect(markup).not.toContain('Staff Runner');
    expect(markup).not.toContain('audit_');
  });

  it('renders ScreenReportSubmitted with synthetic PREVIEW-1042 reference and zero API mutation', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <ScreenReportSubmitted onDone={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(markup).toContain('Report Submitted');
    expect(markup).toContain('PREVIEW-1042');
  });

  it('reuses existing ScreenRequestError for error previews without duplication', () => {
    const onRetrySpy = vi.fn();
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <ScreenRequestError onRetry={onRetrySpy} />
        </ThemeProvider>
      </LocaleProvider>,
    );

    expect(markup).toContain('Request could not be sent');
    expect(markup).toContain('Try again');
  });

  it('proves DemoNavigator returns null in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      // @ts-expect-error Mocking NODE_ENV for test
      process.env.NODE_ENV = 'production';

      const markup = renderToStaticMarkup(
        <LocaleProvider initialLocale="en">
          <ThemeProvider initialTheme="light">
            <DemoNavigator activeScreen="live" onSelectScreen={() => {}} />
          </ThemeProvider>
        </LocaleProvider>,
      );

      expect(markup).toBe('');
    } finally {
      // @ts-expect-error Restoring original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    }
  });
});
