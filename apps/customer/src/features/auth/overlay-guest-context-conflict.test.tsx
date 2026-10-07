import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '../../i18n/locale-provider';
import { getDirectionForLocale } from '../../i18n/locale';
import {
  shouldPreserveAmbiguousGuestSnapshot,
  shouldShowGuestContextConflict,
} from './guest-context-conflict-gate';
import { OverlayGuestContextConflict } from './overlay-guest-context-conflict';

function render(locale: 'en' | 'ar', scope: 'ACTIVE' | 'POST_VISIT'): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale}>
      <OverlayGuestContextConflict
        open
        scope={scope}
        isSwitching={false}
        isSwitchOutcomeAmbiguous={false}
        onContinueCurrent={vi.fn()}
        onOpenNew={vi.fn()}
      />
    </LocaleProvider>,
  );
}

describe('Owner-approved same-browser Guest context conflict overlay', () => {
  it('renders the exact approved English ACTIVE copy using existing button semantics', () => {
    const markup = render('en', 'ACTIVE');
    expect(markup).toContain('You already have an open visit');
    expect(markup).toContain(
      'This browser is connected to another visit. Choose which visit you want to continue.',
    );
    expect(markup).toContain('Continue current visit');
    expect(markup).toContain('Open new visit');
    expect((markup.match(/<button/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('renders the exact approved English POST_VISIT explanatory copy', () => {
    expect(render('en', 'POST_VISIT')).toContain(
      'You still have access to your previous visit. Opening the new visit will move this browser to it.',
    );
  });

  it('renders the exact approved Arabic ACTIVE and POST_VISIT copy', () => {
    const active = render('ar', 'ACTIVE');
    expect(active).toContain('لديك زيارة مفتوحة');
    expect(active).toContain(
      'هذا المتصفح مرتبط بزيارة أخرى. اختر الزيارة التي تريد المتابعة بها.',
    );
    expect(active).toContain('متابعة الزيارة الحالية');
    expect(active).toContain('فتح الزيارة الجديدة');
    expect(render('ar', 'POST_VISIT')).toContain(
      'لا يزال لديك وصول إلى زيارتك السابقة. فتح الزيارة الجديدة سينقل هذا المتصفح إليها.',
    );
  });

  it('preserves the repository EN/LTR and AR/RTL direction contract', () => {
    expect(getDirectionForLocale('en')).toBe('ltr');
    expect(getDirectionForLocale('ar')).toBe('rtl');
  });

  it('keeps the approved actions disabled from implicit dismissal while switch outcome is ambiguous', () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="en">
        <OverlayGuestContextConflict
          open
          scope="ACTIVE"
          isSwitching={false}
          isSwitchOutcomeAmbiguous
          onContinueCurrent={vi.fn()}
          onOpenNew={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(markup).toContain('Continue current visit');
    expect(markup).toContain('disabled');
    expect(markup).toContain('Open new visit');
  });

  it('waits for the authoritative current snapshot before displaying the conflict sheet', () => {
    expect(
      shouldShowGuestContextConflict({
        hasSession: false,
        isExpired: false,
        isSwitchOutcomeAmbiguous: false,
      }),
    ).toBe(false);
    expect(
      shouldShowGuestContextConflict({
        hasSession: true,
        isExpired: false,
        isSwitchOutcomeAmbiguous: false,
      }),
    ).toBe(true);
  });

  it('hides a definite invalidated source but preserves its last snapshot while switch outcome is ambiguous', () => {
    expect(
      shouldShowGuestContextConflict({
        hasSession: true,
        isExpired: true,
        isSwitchOutcomeAmbiguous: false,
      }),
    ).toBe(false);
    expect(
      shouldShowGuestContextConflict({
        hasSession: true,
        isExpired: true,
        isSwitchOutcomeAmbiguous: true,
      }),
    ).toBe(true);
    expect(
      shouldPreserveAmbiguousGuestSnapshot({
        hasSession: true,
        isSwitchOutcomeAmbiguous: true,
      }),
    ).toBe(true);
  });
});
