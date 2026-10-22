import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../../components/layout/app-shell";
import { LocaleProvider } from "../../i18n/locale-provider";
import { ThemeProvider } from "../../theme/theme-provider";
import { OverlayMoreMenu } from "../deferred/overlay-more-menu";
import { DEMO_GROUPS } from "./demo-registry";
import { DemoScreenRenderer } from "./demo-screen-renderer";
import { en } from "../../i18n/translations/en";
import { ar } from "../../i18n/translations/ar";

describe("#318 / #317 Customer navigation", () => {
  it.each(["production", "development"])(
    "has no bottom navigation in %s",
    (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      try {
        const markup = renderToStaticMarkup(
          <LocaleProvider initialLocale="en">
            <ThemeProvider initialTheme="light">
              <AppShell onMore={() => {}}>
                <span>Vehicle journey</span>
              </AppShell>
            </ThemeProvider>
          </LocaleProvider>,
        );
        expect(markup).toContain("Vehicle journey");
        expect(markup).not.toContain("<nav");
        expect(markup).not.toContain("Help");
        expect(
          existsSync(
            resolve(__dirname, "../../components/layout/bottom-nav.tsx"),
          ),
        ).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("removes tab routes and Help while retaining independent Payment and Rating previews", () => {
    const ids = DEMO_GROUPS.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    expect(ids).not.toContain("demo-help");
    expect(ids).toContain("demo-payment-overview");
    expect(ids).toContain("demo-rate-experience");
    for (const path of [
      "../../app/guest-app-root.tsx",
      "../post-visit/guest-post-visit-screen.tsx",
    ]) {
      const source = readFileSync(resolve(__dirname, path), "utf8");
      expect(source).not.toMatch(
        /CustomerTab|ScreenHelp|GuestOnsiteHelp|tab ===|surface === 'help'/,
      );
    }
  });

  it("Rating preview Done returns to existing Completed instead of removed Help", () => {
    const select = vi.fn();
    const element = DemoScreenRenderer({
      demoScreen: "demo-rate-experience",
      onSelectScreen: select,
      onRequestClick() {},
      onViewDetails() {},
    });
    element.props.onDone();
    expect(select).toHaveBeenCalledExactlyOnceWith("demo-completed");
  });

  it.each(["en", "ar"] as const)(
    "keeps the remaining More rows in %s without Photos",
    (locale) => {
      const markup = renderToStaticMarkup(
        <LocaleProvider initialLocale={locale}>
          <ThemeProvider initialTheme="light">
            <OverlayMoreMenu open onClose={() => {}} />
          </ThemeProvider>
        </LocaleProvider>,
      );
      const dictionary = locale === "en" ? en : ar;
      for (const key of [
        "menu.languageLabel",
        "menu.privacyLabel",
        "menu.contactLabel",
      ] as const)
        expect(markup).toContain(dictionary[key].replaceAll("&", "&amp;"));
      expect(markup).not.toContain(dictionary['menu.photosLabel']);
      expect(markup).not.toContain(locale === "en" ? "Help" : "المساعدة");
    },
  );
});
