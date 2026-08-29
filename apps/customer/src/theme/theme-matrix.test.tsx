import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '../i18n/locale-provider';
import { ThemeProvider } from './theme-provider';
import { AppHeader } from '../components/layout/app-header';
import { BottomSheet } from '../components/layout/bottom-sheet';
import { Btn } from '../components/primitives/btn';
import { PickupPIN } from '../components/primitives/pickup-pin';
import { DynamicQRCode } from '../features/handoff/qr-code';
import { OverlayMoreMenu } from '../features/deferred/overlay-more-menu';
import { ScreenRequested } from '../features/retrieval/screen-requested';
import { ScreenNetworkUnavailable } from '../features/deferred/screen-system';
import { ScreenPaymentOverview, ScreenAddTip } from '../features/deferred/screen-payment';
import { ScreenReadyQR } from '../features/handoff/screen-ready-qr';
import type { GuestSafeSession } from '../lib/api/guest-api-types';
import type { Locale } from '../i18n/locale';
import type { Theme } from './theme';

describe('4-Mode Visual & Accessibility Verification Matrix', () => {
  const modes: { locale: Locale; theme: Theme; name: string }[] = [
    { locale: 'en', theme: 'light', name: 'English Light' },
    { locale: 'en', theme: 'dark', name: 'English Dark' },
    { locale: 'ar', theme: 'light', name: 'Arabic Light' },
    { locale: 'ar', theme: 'dark', name: 'Arabic Dark' },
  ];

  modes.forEach(({ locale, theme, name }) => {
    describe(`Mode: ${name}`, () => {
      it('renders AppHeader with stable logo and accessible controls', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <AppHeader onMore={() => {}} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('vaylet-logo-light');
        expect(markup).toContain('vaylet-logo-dark');
        expect(markup).toContain('aria-label');
      });

      it('renders BottomSheet with theme-appropriate background and overlay token', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <BottomSheet open={true} onClose={() => {}} title="Test Sheet">
                <div>Content</div>
              </BottomSheet>
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('background-color:var(--v-sheet-bg)');
        expect(markup).toContain('border-top:var(--v-sheet-border)');
        expect(markup).toContain('background-color:var(--v-overlay)');
      });

      it('renders secondary Btn with transparent background for exact Light parity', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <Btn variant="secondary">Action</Btn>
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('background-color:transparent');
      });

      it('renders PickupPIN with dir="ltr" regardless of locale or theme', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <PickupPIN code="1234" />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('dir="ltr"');
        expect(markup).toContain('>1<');
        expect(markup).toContain('>2<');
        expect(markup).toContain('>3<');
        expect(markup).toContain('>4<');
      });

      it('renders DynamicQRCode with invariant #FFFFFF scan background and #07111F modules', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <DynamicQRCode payload="test-matrix-payload" size={180} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('fill="#FFFFFF"');
        expect(markup).toContain('fill="#07111F"');
      });

      it('renders OverlayMoreMenu with accessible switch control', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <OverlayMoreMenu open={true} onClose={() => {}} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('role="switch"');
        expect(markup).toContain(`aria-checked="${theme === 'dark'}"`);
      });

      it('renders ScreenRequested cancel button with border and borderRadius for exact Light parity', () => {
        const mockSession: GuestSafeSession = {
          readyAt: null,
          valetSessionId: 'test-session-id',
          state: 'REQUESTED',
          vehicle: { make: 'Tesla', model: 'Model S', color: 'White' },
        };

        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <ScreenRequested
                session={mockSession}
                onCancel={() => {}}
                error="Sample error message"
              />
            </ThemeProvider>
          </LocaleProvider>,
        );

        // Cancel button has background none, border, border-radius 10, and textSecondary color
        expect(markup).toContain('background:none');
        expect(markup).toContain('border:1px solid var(--v-border)');
        expect(markup).toContain('border-radius:10px');
        expect(markup).toContain('color:var(--v-text-secondary)');

        // Error box uses semantic danger surface
        expect(markup).toContain('background-color:var(--v-danger-surface)');
      });

      it('renders ScreenNetworkUnavailable without extra background fill on last-state card', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <ScreenNetworkUnavailable onRetry={() => {}} lastKnownState="PARKED" />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).not.toContain('background-color:var(--v-surface-raised)');
      });

      it('renders ScreenPaymentOverview and ScreenAddTip with semantic warning and tip tokens', () => {
        const markupOverview = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <ScreenPaymentOverview onAddTip={() => {}} onPay={() => {}} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markupOverview).toContain('background-color:var(--v-warning-surface)');
        expect(markupOverview).toContain('color:var(--v-warning-text)');

        const markupTip = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <ScreenAddTip onContinue={() => {}} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markupTip).toContain('border:2px solid var(--v-border)');
      });

      it('renders ScreenReadyQR loading placeholder with qrPlaceholderBorder token', () => {
        const mockSession: GuestSafeSession = {
          readyAt: '2026-08-29T12:00:00.000Z',
          valetSessionId: 'test-session-id',
          state: 'HANDOFF_PENDING',
          vehicle: { make: 'Tesla', model: 'Model S', color: 'White' },
        };

        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <ScreenReadyQR session={mockSession} qrPayload={undefined} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('border:var(--v-qr-placeholder-border)');
      });
    });
  });
});
