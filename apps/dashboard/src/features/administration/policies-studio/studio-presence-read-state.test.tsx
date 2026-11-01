import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { studioPresenceBridge } from "./studio-presence-bridge";
import { Workspace } from "./ui/Workspace";
import type { PresenceReadState } from "./ui/studio-types";

const harness = vi.hoisted(() => ({ context: {} as unknown }));
vi.mock("./ui/studio-context", () => ({ useStudio: () => harness.context }));
vi.mock("../reference-administration-page", () => ({
  ReferenceAdministrationPage: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("../../help/context-help", () => ({ ContextHelp: () => null }));
vi.mock("./ui/SettingsScope", () => ({ SettingsScope: () => null }));
vi.mock("./ui/PresenceReadiness", () => ({ PresenceReadiness: () => null }));
vi.mock("./ui/FieldList", () => ({
  FieldList: () => <span>Protected settings</span>,
}));
vi.mock("./ui/ZonesPane", () => ({
  ZonesPane: () => <span>Protected zones</span>,
}));

function render(
  state: PresenceReadState,
  locale: "en" | "ar" = "en",
  dirty = false,
) {
  const save = vi.fn();
  const read = {
    snapshot: {
      readState: state,
      policy: null,
      readiness: null,
      zones: [],
      policyLoading: state === "LOADING",
      zonesLoading: false,
      error:
        state === "ERROR"
          ? new DashboardApiError({
              kind: "conflict",
              code: "PRESENCE_AUTHORITY_BUSY",
              status: 409,
              message: "Must not display raw API conflict copy",
            })
          : null,
      available: !["DENIED", "NO_LOCATION", "INACTIVE"].includes(state),
      canEdit: state === "EDITABLE",
      canEditZones: state === "EDITABLE",
      blocked: state !== "EDITABLE",
      mutationMessage: null,
    },
    actions: { savePolicyDraft: save, saveZone: save },
  } as unknown as Parameters<typeof studioPresenceBridge>[0];
  const presence = studioPresenceBridge(read, locale);
  harness.context = {
    route: {
      role: "LOCATION_MANAGER",
      scope: "location",
      section: "presence",
      scenario: "ready",
      location: "synthetic",
    },
    locale,
    dirty,
    identity: "synthetic",
    editable: presence.editable,
    navigate: vi.fn(),
    adapter: { presence, settings: { availableKeys: [] }, reload: vi.fn() },
  };
  return { html: renderToStaticMarkup(<Workspace />), presence, save };
}

describe("Policies Studio distinguishes authoritative read state from permission", () => {
  it.each(["en", "ar"] as const)(
    "temporary 409 in %s is localized with Retry, without a permanent read-only banner",
    (locale) => {
      const { html, presence } = render("ERROR", locale);
      expect(html).toContain(
        locale === "en"
          ? "Attendance settings are temporarily busy"
          : "إعدادات الحضور مشغولة مؤقتًا",
      );
      expect(html).toContain(locale === "en" ? "Retry" : "إعادة المحاولة");
      expect(html).not.toContain("Must not display raw API conflict copy");
      expect(html).not.toContain("View-only for this scope or account");
      expect(presence.editable).toBe(false);
      expect(presence.zonesEditable).toBe(false);
    },
  );
  it.each(["LOADING", "ERROR", "DENIED", "NO_LOCATION", "INACTIVE"] as const)(
    "%s cannot infer a permanent permission downgrade",
    (state) => {
      const { html, presence } = render(state);
      expect(html).not.toContain("View-only for this scope or account");
      expect(html).not.toContain("Protected settings");
      expect(presence.editable).toBe(false);
    },
  );
  it("only successful read-only capability explains view-only permission", () => {
    expect(render("READ_ONLY").html).toContain(
      "View-only for this scope or account",
    );
    expect(render("EDITABLE").html).not.toContain(
      "View-only for this scope or account",
    );
  });
  it("retained drafts are accompanied by failure messaging while bridge saves stay blocked", async () => {
    const { html, presence, save } = render("ERROR", "en", true);
    expect(html).toContain("Protected settings");
    expect(html).toContain("Attendance settings are temporarily busy");
    expect(
      await presence.savePolicy("shiftStartPresenceMode", "OFF", false, false),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(save).not.toHaveBeenCalled();
  });
});
