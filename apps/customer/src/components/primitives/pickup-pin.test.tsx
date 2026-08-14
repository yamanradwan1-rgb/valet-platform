import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AppHeader } from '../layout/app-header';
import { LocaleProvider } from '../../i18n/locale-provider';
import { ThemeProvider } from '../../theme/theme-provider';
import { PickupPIN } from './pickup-pin';
import { DynamicQRCode } from '../../features/handoff/qr-code';
import { OverlayMoreMenu } from '../../features/deferred/overlay-more-menu';

describe('Guest UI Theme and RTL/LTR Visual Contracts', () => {
  it('renders production PickupPIN with explicit dir="ltr" in Arabic + Dark mode', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <ThemeProvider initialTheme="dark">
          <PickupPIN code="4821" />
        </ThemeProvider>
      </LocaleProvider>,
    );

    // Verify the Arabic localized label
    expect(markup).toContain('رمز الاستلام');

    // Verify the digit container has explicit dir="ltr"
    expect(markup).toContain('dir="ltr"');

    // Verify all 4 digits are rendered in sequence
    expect(markup).toContain('>4<');
    expect(markup).toContain('>8<');
    expect(markup).toContain('>2<');
    expect(markup).toContain('>1<');
  });

  it('proves DynamicQRCode preserves static high-contrast scanning surface (#FFFFFF background and #07111F modules)', () => {
    const payload = 'vhq1.test-session-token-proof';
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="dark">
          <DynamicQRCode payload={payload} size={180} />
        </ThemeProvider>
      </LocaleProvider>,
    );

    // Verify static white background for quiet zone and scanning contrast
    expect(markup).toContain('fill="#FFFFFF"');

    // Verify static dark modules (#07111F)
    expect(markup).toContain('fill="#07111F"');
  });

  it('renders AppHeader with accessible More button', () => {
    const onMore = vi.fn();
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <ThemeProvider initialTheme="dark">
          <AppHeader onMore={onMore} />
        </ThemeProvider>
      </LocaleProvider>,
    );

    // Verify More button has aria-label
    expect(markup).toContain('aria-label="خيارات إضافية"');
  });

  it('renders OverlayMoreMenu with accessible single interactive switch control for Dark Mode in Arabic', () => {
    const onClose = vi.fn();
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <ThemeProvider initialTheme="dark">
          <OverlayMoreMenu open={true} onClose={onClose} />
        </ThemeProvider>
      </LocaleProvider>,
    );

    // Verify switch control role, aria-checked, and localized label
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-label="تبديل الوضع الداكن"');
    expect(markup).toContain('الوضع الداكن');
    expect(markup).toContain('التبديل بين المظهر الفاتح والداكن');
  });

  it('renders OverlayMoreMenu with accessible single interactive switch control for Dark Mode in English', () => {
    const onClose = vi.fn();
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <OverlayMoreMenu open={true} onClose={onClose} />
        </ThemeProvider>
      </LocaleProvider>,
    );

    // Verify switch control role, aria-checked, and localized label in English
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup).toContain('aria-label="Toggle dark mode"');
    expect(markup).toContain('Dark mode');
    expect(markup).toContain('Switch between light and dark themes');
  });
});
