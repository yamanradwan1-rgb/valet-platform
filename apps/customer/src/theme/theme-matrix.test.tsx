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
import { ScreenPaymentOverview } from '../features/deferred/screen-payment';
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

      it('renders BottomSheet with theme-appropriate background token', () => {
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

      it('renders ScreenRequested cancel button with transparent background and no border', () => {
        const mockSession: GuestSafeSession = {
          valetSessionId: 'test-session-id',
          state: 'REQUESTED',
          vehicle: { make: 'Tesla', model: 'Model S', color: 'White' },
        };

        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <ScreenRequested session={mockSession} onCancel={() => {}} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('background:none');
        expect(markup).toContain('border:none');
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

      it('renders ScreenPaymentOverview warning banner with semantic warning tokens', () => {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}>
              <ScreenPaymentOverview onAddTip={() => {}} onPay={() => {}} />
            </ThemeProvider>
          </LocaleProvider>,
        );

        expect(markup).toContain('background-color:var(--v-warning-surface)');
        expect(markup).toContain('color:var(--v-warning-text)');
      });
    });
  });
});
