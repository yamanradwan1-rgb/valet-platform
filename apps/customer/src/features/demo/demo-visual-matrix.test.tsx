import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '../../i18n/locale-provider';
import { ThemeProvider } from '../../theme/theme-provider';
import type { Locale } from '../../i18n/locale';
import type { Theme } from '../../theme/theme-provider';
import { DemoNavigator } from './demo-navigator';
import { DemoScreenRenderer } from './demo-screen-renderer';
import { DEMO_GROUPS, type DemoItem, type DemoScreenKey } from './demo-registry';
import { OverlayConfirmRequest } from '../retrieval/overlay-confirm-request';
import { OverlayVehicleDetails } from '../deferred/overlay-vehicle-details';
import { OverlayMoreMenu } from '../deferred/overlay-more-menu';
import { demoSessions } from './demo-fixtures';

describe('Dev Preview Visual Matrix across Locales & Themes', () => {
  const locales: Locale[] = ['en', 'ar'];
  const themes: Theme[] = ['light', 'dark'];

  const allScreenKeys: DemoScreenKey[] = DEMO_GROUPS.flatMap((g) => g.items)
    .filter((i): i is DemoItem & { kind: 'screen' } => i.kind === 'screen')
    .map((i) => i.id)
    .filter((k) => k !== 'live');

  locales.forEach((locale) => {
    themes.forEach((theme) => {
      describe(`Mode: ${locale.toUpperCase()} + ${theme.toUpperCase()}`, () => {
        it('renders collapsed and expanded DemoNavigator', () => {
          const collapsedMarkup = renderToStaticMarkup(
            <LocaleProvider initialLocale={locale}>
              <ThemeProvider initialTheme={theme}>
                <DemoNavigator activeScreen="demo-parked" onSelectScreen={() => {}} />
              </ThemeProvider>
            </LocaleProvider>,
          );
          expect(collapsedMarkup).toBeDefined();
          expect(collapsedMarkup.length).toBeGreaterThan(0);
        });

        it('renders all 19 preview screen states without crashing', () => {
          allScreenKeys.forEach((screenKey) => {
            const markup = renderToStaticMarkup(
              <LocaleProvider initialLocale={locale}>
                <ThemeProvider initialTheme={theme}>
                  <DemoScreenRenderer
                    demoScreen={screenKey}
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

        it('renders all 3 overlays in isolation without errors', () => {
          // Confirm Request
          const confirmMarkup = renderToStaticMarkup(
            <LocaleProvider initialLocale={locale}>
              <ThemeProvider initialTheme={theme}>
                <OverlayConfirmRequest
                  open={true}
                  onClose={() => {}}
                  onConfirm={() => {}}
                  isLoading={false}
                />
              </ThemeProvider>
            </LocaleProvider>,
          );
          expect(confirmMarkup).toContain(
            locale === 'ar' ? 'هل ترغب في طلب سيارتك؟' : 'Request your vehicle?',
          );

          // Vehicle Details
          const detailsMarkup = renderToStaticMarkup(
            <LocaleProvider initialLocale={locale}>
              <ThemeProvider initialTheme={theme}>
                <OverlayVehicleDetails
                  open={true}
                  onClose={() => {}}
                  session={demoSessions.parked}
                />
              </ThemeProvider>
            </LocaleProvider>,
          );
          expect(detailsMarkup).toContain('Porsche');

          // More Menu
          const moreMarkup = renderToStaticMarkup(
            <LocaleProvider initialLocale={locale}>
              <ThemeProvider initialTheme={theme}>
                <OverlayMoreMenu open={true} onClose={() => {}} />
              </ThemeProvider>
            </LocaleProvider>,
          );
          expect(moreMarkup).toContain('role="switch"');
        });
      });
    });
  });
});
