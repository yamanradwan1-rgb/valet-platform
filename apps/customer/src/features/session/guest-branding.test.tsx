import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "../../components/layout/app-shell";
import { LocaleProvider } from "../../i18n/locale-provider";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import { ThemeProvider } from "../../theme/theme-provider";
import {
  currentClientSession,
  applyCurrentClientSessionUpdate,
  retainCurrentSessionBranding,
} from "./client-bound-session";
import { GuestApiClient } from "../../lib/api/guest-api-client";
import { guestBrandStyle } from "./guest-branding";
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
  theme: "light" | "dark" = "light",
  unavailable: "network" | "error" | null = null,
) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale}>
      <ThemeProvider initialTheme={theme}>
        <GuestSessionContext.Provider
          value={{
            session: value,
            isExpired: expired,
            isNetworkError: unavailable === "network",
            failureKind: unavailable ? 'NETWORK' : null,
            isLoading: false,
            isRefreshing: false,
            isFresh: true,
            isStale: false,
            isMutating: false,
            cooldownSeconds: 0,
            beginMutation: () => null,
            error: unavailable ? "Read unavailable" : null,
            refreshSession: async () => {},
            updateSession: () => {},
          }}
        >
          <AppShell onMore={() => {}}>
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
    const latest = { current: oldA };
    const activeClient = { current: clientA };
    const apply = vi.fn();
    const delayedA = (snapshot: GuestSafeSession) =>
      applyCurrentClientSessionUpdate(
        latest,
        activeClient,
        clientA,
        snapshot,
        apply,
      );
    activeClient.current = clientB;
    latest.current = currentB;
    delayedA(oldA.value);
    expect(apply).not.toHaveBeenCalled();
    expect(render(latest.current.value)).toContain("Current B");
    activeClient.current = replacementA;
    delayedA(oldA.value);
    expect(apply).not.toHaveBeenCalled();
    expect(render(currentClientSession(oldA, clientB))).not.toContain(
      "--brand-primary:",
    );
    expect(render(currentB.value, true)).not.toContain("Current B");
    expect(render(currentB.value, true)).not.toContain("--brand-primary:");
  });

  it("retains authoritative B when a command captured under A completes without branding", () => {
    const client = {};
    const brandA = session("Brand A");
    const brandB = session("Brand B", "#004488");
    const latest = { current: { client, value: brandA } };
    const applied: GuestSafeSession[] = [];
    const capturedCommand = (snapshot: GuestSafeSession) =>
      applyCurrentClientSessionUpdate(
        latest,
        { current: client },
        client,
        snapshot,
        (snapshot) => {
          latest.current = { client, value: snapshot };
          applied.push(snapshot);
        },
      );
    const { branding, ...command } = brandA;
    expect(branding).toBeDefined();
    latest.current = { client, value: brandB };
    capturedCommand({ ...command, state: "REQUESTED" });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.state).toBe("REQUESTED");
    expect(applied[0]?.branding).toEqual(brandB.branding);
    expect(render(latest.current.value)).toContain("Brand B");
    expect(render(latest.current.value)).not.toContain("Brand A");

    latest.current = {
      client,
      value: { ...brandB, valetSessionId: "replacement-session" },
    };
    capturedCommand(command);
    expect(applied).toHaveLength(1);
    expect(latest.current.value.valetSessionId).toBe("replacement-session");
  });

  it.each([
    ["dark", "#2575FC"],
    ["light", "#176BFF"],
  ] as const)(
    "preserves the existing %s accent %s without safe branding",
    (theme, accent) => {
      const css = readFileSync(
        new URL("../../app/globals.css", import.meta.url),
        "utf8",
      );
      const themeAccent = css.match(
        new RegExp(
          `\\[data-theme="${theme}"\\]\\s*\\{[^}]*?--v-blue:\\s*(#[0-9A-F]{6});`,
          "u",
        ),
      )?.[1];
      expect(themeAccent).toBe(accent);
      const { branding, ...withoutBranding } = session("Venue");
      expect(branding).toBeDefined();
      for (const value of [
        null,
        withoutBranding,
        session("Venue", "invalid"),
        session("Venue", "#808080"),
      ]) {
        const style = guestBrandStyle(value, theme === "dark");
        expect(style).toEqual({});
        expect(style).not.toHaveProperty("--v-blue");
        expect(style).not.toHaveProperty("--v-blue-hover");
        expect(render(value, false, "en", theme)).not.toContain(
          "--brand-primary:",
        );
        expect(render(value, false, "en", theme)).not.toContain("--v-blue:");
      }
      const branded = session(
        "Venue",
        theme === "dark" ? "#AADDFF" : "#0057B8",
      );
      expect(render(branded, true, "en", theme)).not.toContain("--v-blue:");
      for (const unavailable of ["network", "error"] as const) {
        expect(render(branded, false, "en", theme, unavailable)).not.toContain(
          "--v-blue:",
        );
      }
    },
  );

  it("falls back for missing/invalid/unsafe colors and keeps contrast-safe dark branding", () => {
    for (const color of ["invalid", "#FFFFFF", "#FFFF00"]) {
      expect(guestBrandStyle(session("Venue", color), false)).toEqual({});
    }
    expect(guestBrandStyle(null, false)).toEqual({});
    const dark = guestBrandStyle(session("Venue", "#AADDFF"), true);
    expect(dark).toHaveProperty("--brand-primary", "#AADDFF");
    expect(dark).toHaveProperty("--brand-on-primary", "#07111F");
    expect(dark).not.toHaveProperty("--v-bg");
    expect(dark).not.toHaveProperty("--v-success");
  });
});
