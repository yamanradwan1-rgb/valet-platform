import React from 'react';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { it } from 'vitest';
import { AppShell } from '../../src/components/layout/app-shell';
import { Btn } from '../../src/components/primitives/btn';
import { TrustStrip } from '../../src/components/primitives/trust-strip';
import { StatusBadge } from '../../src/components/primitives/status-badge';
import { LocaleProvider } from '../../src/i18n/locale-provider';
import { ThemeProvider } from '../../src/theme/theme-provider';
import { GuestSessionContext, type GuestSessionContextValue } from '../../src/features/session/use-guest-session';
import { DEMO_GROUPS } from '../../src/features/demo/demo-registry';
import { DemoScreenRenderer } from '../../src/features/demo/demo-screen-renderer';
import { OverlayConfirmRequest } from '../../src/features/retrieval/overlay-confirm-request';
import { OverlayMoreMenu } from '../../src/features/deferred/overlay-more-menu';
import { OverlayVehicleDetails } from '../../src/features/deferred/overlay-vehicle-details';
import { OverlayGuestContextConflict } from '../../src/features/auth/overlay-guest-context-conflict';
import { demoSessions } from '../../src/features/demo/demo-fixtures';

const noop = () => {};
it('exports real Customer components for browser color-only comparison when requested', () => {
  const output = process.env.QA338_RENDER;
  if (!output) return;
  mkdirSync(output, { recursive: true });
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8').replace(/^@import[^\n]+\n/u, '');
  const screens = DEMO_GROUPS.flatMap((group) => group.items).filter((item) => item.kind === 'screen');
  for (const locale of ['en', 'ar'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const color of ['#00FF00', '#8000FF', 'fallback']) {
        const session = { ...demoSessions.parked,
          ...(color === 'fallback' ? {} : { branding: { displayName: 'Fixture venue', primaryColor: color } }) };
        const value: GuestSessionContextValue = {
          session, isExpired: false, isNetworkError: false, failureKind: null,
          isLoading: false, isRefreshing: false, isFresh: true, isStale: false,
          isMutating: false, cooldownSeconds: 0, beginMutation: () => null,
          error: null, refreshSession: async () => {}, updateSession: noop,
        };
        const views = [
          ...screens.map((item) => ({ name: item.id, element: <DemoScreenRenderer
            demoScreen={item.id} onSelectScreen={noop} onRequestClick={noop} onViewDetails={noop} /> })),
          { name: 'confirm', element: <OverlayConfirmRequest open onClose={noop} onConfirm={noop} /> },
          { name: 'details', element: <OverlayVehicleDetails open onClose={noop} session={session} /> },
          { name: 'menu', element: <OverlayMoreMenu open onClose={noop} /> },
          { name: 'context', element: <OverlayGuestContextConflict open scope="ACTIVE" isSwitching={false}
            isSwitchOutcomeAmbiguous={false} onContinueCurrent={noop} onOpenNew={noop} /> },
          { name: 'controls', element: <><Btn>Primary</Btn><Btn variant="ghost">Link</Btn>
            <Btn disabled>Disabled</Btn><Btn loading>Loading</Btn><Btn variant="danger">Danger</Btn>
            <TrustStrip />{(['info', 'active', 'success', 'warning', 'neutral'] as const).map((status) =>
              <StatusBadge key={status} status={status} label={status} />)}</> },
        ];
        for (const view of views) {
          const markup = renderToStaticMarkup(<LocaleProvider initialLocale={locale}>
            <ThemeProvider initialTheme={theme}><GuestSessionContext.Provider value={value}>
              <AppShell onMore={noop}>{view.element}</AppShell>
            </GuestSessionContext.Provider></ThemeProvider></LocaleProvider>);
          const name = `${locale}-${theme}-${color.replace('#', '')}-${view.name}`;
          writeFileSync(join(output, `${name}.html`), `<!doctype html><html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" data-theme="${theme}"><head><meta charset="utf-8"><style>${css}</style></head><body>${markup}</body></html>`);
        }
      }
    }
  }
});
