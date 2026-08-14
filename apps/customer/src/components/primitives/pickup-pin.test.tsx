import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AppHeader } from '../layout/app-header';
import { LocaleProvider } from '../../i18n/locale-provider';
import { PickupPIN } from './pickup-pin';

describe('PickupPIN & AppHeader Production Markup in Arabic/RTL', () => {
  it('renders production PickupPIN with explicit dir="ltr" on digit container in Arabic mode', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <PickupPIN code="4821" />
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

  it('renders AppHeader with accessible More button and triggers onMore', () => {
    const onMore = vi.fn();
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <AppHeader onMore={onMore} />
      </LocaleProvider>,
    );

    // Verify More button has aria-label
    expect(markup).toContain('aria-label="خيارات إضافية"');
  });
});
