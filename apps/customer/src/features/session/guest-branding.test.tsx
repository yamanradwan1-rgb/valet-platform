import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../../components/layout/app-shell";
import { LocaleProvider } from "../../i18n/locale-provider";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import { ThemeProvider } from "../../theme/theme-provider";
import {
  currentClientSession,
  retainCurrentSessionBranding,
} from "./client-bound-session";
import { GuestApiClient } from "../../lib/api/guest-api-client";
import { DEFAULT_BRAND_PRIMARY, guestBrandStyle } from "./guest-branding";
import { ScreenParked } from "./screen-parked";
import { GuestSessionContext } from "./use-guest-session";

function session(
  displayName: string,
  primaryColor = "#0057B8",
): GuestSafeSession {
  return {
    valetSessionId: "11111111-1111-4111-8111-111111111111",
    state: "PARKED",
    readyAt: null,
    vehicle: { make: "Toyota", model: "Camry", color: "White" },
    branding: { displayName, primaryColor },
  };
}

function render(
  value: GuestSafeSession | null,
  expired = false,
  locale: "en" | "ar" = "en",
) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale}>
      <ThemeProvider initialTheme="light">
        <GuestSessionContext.Provider
          value={{
            session: value,
            isExpired: expired,
            isNetworkError: false,
            isLoading: false,
            error: null,
            refreshSession: async () => {},
            updateSession: () => {},
          }}
        >
          <AppShell tab="vehicle" onTab={() => {}} onMore={() => {}}>
            {value && !expired ? (
              <ScreenParked
                session={value}
                onRequestClick={() => {}}
                onViewDetails={() => {}}
              />
            ) : null}
          </AppShell>
        </GuestSessionContext.Provider>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

describe("effective Guest branding consumption", () => {
  it("parses the effective read projection and retains branding only on same-session command responses", async () => {
    const projected = session("Projected venue");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(projected)));
    try {
      const result = await new GuestApiClient(
        "test-token",
        "http://localhost/v1/guest",
      ).loadSession();
      expect(render(result)).toContain("Projected venue");
      const { branding: _branding, ...command } = projected;
      expect(_branding).toBeDefined();
      expect(retainCurrentSessionBranding(result, command).branding).toEqual(
        projected.branding,
      );
      expect(
        retainCurrentSessionBranding(result, {
          ...command,
          valetSessionId: "different-session",
        }).branding,
      ).toBeUndefined();
      expect(
        retainCurrentSessionBranding(null, command).branding,
      ).toBeUndefined();
    } finally {
      fetch.mockRestore();
    }
  });
  it.each(["en", "ar"] as const)(
    "renders backend effective names and runtime accent in %s without changing geometry",
    (locale) => {
      const company = render(session("Company default"), false, locale);
      const override = render(session("هوية الموقع"), false, locale);
      const cleared = render(session("Company default"), false, locale);
      expect(company).toContain("Company default");
      expect(override).toContain("هوية الموقع");
      expect(cleared).toBe(company);
      expect(company).toContain("--brand-primary:#0057B8");
      expect(company).toContain("--v-blue:var(--brand-primary)");
      expect(company).toContain("background-color:var(--v-blue)");
      expect(company).toContain("vaylet-logo-light");
      expect(override.replace("هوية الموقع", "Company default")).toBe(company);
    },
  );

  it("immediately drops A on client replacement and rejects late A snapshots, including A→B→A", () => {
    const clientA = {};
    const clientB = {};
    const replacementA = {};
    const oldA = { client: clientA, value: session("Old A") };
    expect(render(currentClientSession(oldA, clientA))).toContain("Old A");
    expect(render(currentClientSession(oldA, clientB))).not.toContain("Old A");
    expect(render(currentClientSession(oldA, replacementA))).not.toContain(
      "Old A",
    );
    expect(render(currentClientSession(oldA, null))).not.toContain("Old A");
    const currentB = { client: clientB, value: session("Current B") };
    expect(render(currentClientSession(currentB, clientB))).toContain(
      "Current B",
    );
    expect(render(currentClientSession(oldA, clientB))).toContain(
      `--brand-primary:${DEFAULT_BRAND_PRIMARY}`,
    );
    expect(render(currentB.value, true)).not.toContain("Current B");
    expect(render(currentB.value, true)).toContain(
      `--brand-primary:${DEFAULT_BRAND_PRIMARY}`,
    );
  });

  it("falls back for missing/invalid/unsafe colors and keeps contrast-safe dark branding", () => {
    for (const color of ["invalid", "#FFFFFF", "#FFFF00"]) {
      expect(guestBrandStyle(session("Venue", color), false)).toHaveProperty(
        "--brand-primary",
        DEFAULT_BRAND_PRIMARY,
      );
    }
    expect(guestBrandStyle(null, false)).toHaveProperty(
      "--brand-primary",
      DEFAULT_BRAND_PRIMARY,
    );
    const dark = guestBrandStyle(session("Venue", "#AADDFF"), true);
    expect(dark).toHaveProperty("--brand-primary", "#AADDFF");
    expect(dark).toHaveProperty("--brand-on-primary", "#07111F");
    expect(dark).not.toHaveProperty("--v-bg");
    expect(dark).not.toHaveProperty("--v-success");
  });
});
