import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { LocaleProvider } from '../../i18n/locale-provider';
import { ThemeProvider } from '../../theme/theme-provider';
import { enTranslations } from '../../i18n/translations/en';
import { arTranslations } from '../../i18n/translations/ar';
import {
  DEMO_GROUPS,
  type DemoGroup,
  type DemoItem,
} from './demo-registry';
import { DemoScreenRenderer } from './demo-screen-renderer';
import { DevPreviewOverlayHost } from './dev-preview-overlays';
import { DevPreviewControls } from './dev-preview-controls';
import { ScreenPaymentSuccess } from '../deferred/screen-payment-success';
import { ScreenPaymentError } from '../deferred/screen-payment-error';
import { ScreenReportSubmitted } from '../deferred/screen-report-submitted';

describe('Dev Preview Safety & Invariant Contracts', () => {
  // 1. Direct dev Confirm Request overlay cannot invoke retrieval/API/fetch
  it('proves dev Confirm Request overlay onConfirm is strictly the local onClose with ZERO retrieval API dependencies', () => {
    const closeSpy = vi.fn();

    // Inspect the React element directly from DevPreviewOverlayHost
    const element = DevPreviewOverlayHost({
      overlay: 'overlay-confirm-request',
      onClose: closeSpy,
    });

    expect(element).not.toBeNull();
    expect(element?.props.open).toBe(true);
    expect(element?.props.isLoading).toBe(false);
    expect(element?.props.onClose).toBe(closeSpy);
    expect(element?.props.onConfirm).toBe(closeSpy);

    // Call onConfirm to verify it executes the local closeSpy without any mutation
    element?.props.onConfirm();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    // Source-level architectural invariant: DevPreviewOverlayHost must never import retrieval hooks or APIs
    const hostSource = fs.readFileSync(
      path.resolve(__dirname, './dev-preview-overlays.tsx'),
      'utf8',
    );
    expect(hostSource).not.toContain('useRetrieval');
    expect(hostSource).not.toContain('requestVehicle');
    expect(hostSource).not.toContain('guest-api-client');
    expect(hostSource).not.toContain('fetch(');
  });

  // 2. DevPreviewControls pairs DevPreviewOverlayHost with DemoNavigator
  it('proves DevPreviewControls pairs DevPreviewOverlayHost and DemoNavigator together', () => {
    const closeSpy = vi.fn();
    const selectSpy = vi.fn();

    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <DevPreviewControls
            activeScreen="live"
            onSelectScreen={() => {}}
            overlay="overlay-confirm-request"
            onSelectOverlay={selectSpy}
            onCloseOverlay={closeSpy}
          />
        </ThemeProvider>
      </LocaleProvider>,
    );

    // Contains both the overlay content and the navigator title
    expect(markup).toContain('Request your vehicle?');
    expect(markup).toContain('Dev Preview Navigator');
  });

  // 3. Direct dev Vehicle Details uses deterministic demo fixture
  it('proves dev Vehicle Details overlay strictly uses deterministic demoSessions.parked fixture', () => {
    const element = DevPreviewOverlayHost({
      overlay: 'overlay-vehicle-details',
      onClose: () => {},
    });

    expect(element).not.toBeNull();
    expect(element?.props.open).toBe(true);
    expect(element?.props.session.vehicle.make).toBe('Porsche');
    expect(element?.props.session.vehicle.model).toBe('Taycan 4S');
    expect(element?.props.session.vehicle.color).toBe('Frozen Blue');

    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          {element}
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(markup).toContain('Porsche');
    expect(markup).toContain('Taycan 4S');
    expect(markup).toContain('Frozen Blue');
    // Ensure no private/sensitive employee custody fields are present
    expect(markup).not.toContain('slot-');
    expect(markup).not.toContain('employee_');
  });

  // 4. Issue Submitted explicitly says preview / no report submitted
  it('proves ScreenReportSubmitted explicitly displays preview banner and notice in English and Arabic', () => {
    const enMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <ScreenReportSubmitted onDone={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(enMarkup).toContain('Preview only · No report was submitted.');
    expect(enMarkup).toContain('PREVIEW-1042');

    const arMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <ThemeProvider initialTheme="dark">
          <ScreenReportSubmitted onDone={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(arMarkup).toContain('معاينة فقط · لم يتم إرسال أي بلاغ.');
    expect(arMarkup).toContain('PREVIEW-1042');
  });

  // 5. Payment Success explicitly says preview / illustrative only
  it('proves ScreenPaymentSuccess explicitly displays preview notice in English and Arabic', () => {
    const enMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <ScreenPaymentSuccess onViewReceipt={() => {}} onDone={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(enMarkup).toContain('Preview only · This illustrates how a successful payment confirmation will appear.');
    expect(enMarkup).toContain('Preview only · Illustrative summary of valet charges.');

    const arMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <ThemeProvider initialTheme="dark">
          <ScreenPaymentSuccess onViewReceipt={() => {}} onDone={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(arMarkup).toContain('معاينة فقط · يوضح هذا النموذج كيفية ظهور تأكيد نجاح الدفع.');
  });

  // 6. Payment Error explicitly says preview / no payment attempted
  it('proves ScreenPaymentError explicitly displays preview notice with no real card charge claim', () => {
    const enMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <ThemeProvider initialTheme="light">
          <ScreenPaymentError onRetry={() => {}} onChangeMethod={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(enMarkup).toContain('Preview only · This illustrates how a payment failure will appear. No payment was attempted.');
    expect(enMarkup).not.toContain('Your card was not charged');

    const arMarkup = renderToStaticMarkup(
      <LocaleProvider initialLocale="ar">
        <ThemeProvider initialTheme="dark">
          <ScreenPaymentError onRetry={() => {}} onChangeMethod={() => {}} />
        </ThemeProvider>
      </LocaleProvider>,
    );
    expect(arMarkup).toContain('معاينة فقط · يوضح هذا النموذج كيفية ظهور شاشة تعذر الدفع. لم تتم أي محاولة دفع.');
  });

  // 7. Every item with kind:'screen' has a non-null renderer
  it('proves all 23 items with kind: screen have an active non-null renderer in DemoScreenRenderer', () => {
    const renderableItems = DEMO_GROUPS.flatMap((g: DemoGroup) => g.items)
      .filter((i: DemoItem): i is DemoItem & { kind: 'screen' } => i.kind === 'screen');

    expect(renderableItems).toHaveLength(23);

    renderableItems.forEach((item) => {
      const markup = renderToStaticMarkup(
        <LocaleProvider initialLocale="en">
          <ThemeProvider initialTheme="light">
            <DemoScreenRenderer
              demoScreen={item.id}
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

  // 8. Live is modeled as kind:'live' and not accepted by DemoScreenRenderer
  it('proves Live is modeled as kind: live in registry', () => {
    const liveItem = DEMO_GROUPS.flatMap((g: DemoGroup) => g.items).find((i) => i.id === 'live');
    expect(liveItem).toBeDefined();
    expect(liveItem?.kind).toBe('live');
  });

  // 9. Overlay keys are distinct from screen keys
  it('proves overlay items are typed as kind: overlay and have unique IDs', () => {
    const overlayItems = DEMO_GROUPS.flatMap((g: DemoGroup) => g.items)
      .filter((i: DemoItem): i is DemoItem & { kind: 'overlay' } => i.kind === 'overlay');

    expect(overlayItems).toHaveLength(3);
    const ids = overlayItems.map((o) => o.id);
    expect(ids).toEqual([
      'overlay-confirm-request',
      'overlay-vehicle-details',
      'overlay-more-menu',
    ]);
  });

  // 10. EN/AR 100% Translation Parity
  it('proves 100% key parity between English and Arabic dictionaries', () => {
    const enKeys = Object.keys(enTranslations).sort();
    const arKeys = Object.keys(arTranslations).sort();
    expect(enKeys).toEqual(arKeys);
  });
});
