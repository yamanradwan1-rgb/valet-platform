import { describe, expect, it } from "vitest";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import type { TranslationKey } from "../../i18n/translations/types";
import { overviewErrorMessageKey } from "./error-message";
import { DashboardApiError } from "../../lib/api/api-error";

/**
 * Keys introduced by the D2-004 overview integration. Every one of them must
 * resolve to a real non-empty string in BOTH locales.
 */
const D2_004_KEYS: readonly TranslationKey[] = [
  "page.activeShifts.empty",
  "page.activeShifts.kpiLabel",
  "page.activeShifts.kpiSub",
  "page.activeShifts.scopeNote",
  "page.activeShifts.column.shiftId",
  "page.activeShifts.column.membershipId",
  "page.activeShifts.column.startedAt",
  "page.activeShifts.rowSubtitle",
  "page.keys.empty",
  "page.keys.kpiSlots",
  "page.keys.kpiActiveSlots",
  "page.keys.kpiHoldingSession",
  "page.keys.scopeNote",
  "page.keys.holdingSessionIdLabel",
  "page.keys.noHoldingSession",
  "page.keys.detailTitle",
  "page.keys.field.keySlotId",
  "page.keys.field.code",
  "page.keys.field.status",
  "page.incidents.description",
  "page.incidents.empty",
  "page.incidents.kpiVisible",
  "page.incidents.kpiHighCritical",
  "page.incidents.monitoringNote",
  "page.incidents.column.incidentId",
  "page.incidents.column.sessionId",
  "page.incidents.column.status",
  "page.incidents.column.severity",
  "page.incidents.column.type",
  "page.incidents.column.createdAt",
  "page.incidents.column.resolvedAt",
  "page.incidents.detailTitle",
  "page.incidents.field.description",
  "page.incidents.field.rawType",
  "page.incidents.unresolved",
  "actions.loadMore",
  "actions.retry",
  "states.loading",
  "states.errorGeneric",
  "states.networkError",
  "states.accessDenied",
];

const INCIDENT_STATUS_KEYS: readonly TranslationKey[] = [
  "enum.incident.OPEN",
  "enum.incident.INVESTIGATING",
  "enum.incident.RESOLVED",
  "enum.incident.CLOSED",
];

const SEVERITY_KEYS: readonly TranslationKey[] = [
  "enum.severity.LOW",
  "enum.severity.MEDIUM",
  "enum.severity.HIGH",
  "enum.severity.CRITICAL",
];

const KEY_SLOT_KEYS: readonly TranslationKey[] = [
  "enum.keySlot.ACTIVE",
  "enum.keySlot.INACTIVE",
];

describe("D2-004 dictionary coverage", () => {
  it("resolves every new key non-empty in EN and AR", () => {
    for (const key of D2_004_KEYS) {
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
    }
  });

  it("labels every incident status in both locales without raw enum underscores", () => {
    for (const key of INCIDENT_STATUS_KEYS) {
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
      expect(enTranslations[key]).not.toMatch(/_/u);
      expect(arTranslations[key]).not.toMatch(/_/u);
    }
  });

  it("labels every severity value in both locales", () => {
    for (const key of SEVERITY_KEYS) {
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
      expect(enTranslations[key]).not.toMatch(/_/u);
      expect(arTranslations[key]).not.toMatch(/_/u);
    }
  });

  it("labels ACTIVE/INACTIVE key slots in both locales", () => {
    for (const key of KEY_SLOT_KEYS) {
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
      expect(enTranslations[key]).not.toMatch(/_/u);
      expect(arTranslations[key]).not.toMatch(/_/u);
    }
  });

  it("keeps the incidents page copy honest about current/open monitoring", () => {
    expect(enTranslations["page.incidents.description"]).toMatch(
      /open and investigating/iu,
    );
    expect(enTranslations["page.incidents.monitoringNote"]).toMatch(
      /read-only/iu,
    );
    expect(arTranslations["page.incidents.monitoringNote"]).toMatch(
      /القراءة|للقراءة/u,
    );
  });
});

describe("paginated KPI truthfulness", () => {
  /**
   * Every KPI whose value is computed from currently loaded cursor-paginated
   * rows. The backend exposes no authoritative total, so each label must
   * explicitly say the count covers only loaded/listed rows.
   */
  const LOADED_ROW_KPI_KEYS: readonly TranslationKey[] = [
    "page.activeShifts.kpiLabel",
    "page.activeShifts.kpiSub",
    "page.keys.kpiSlots",
    "page.keys.kpiActiveSlots",
    "page.keys.kpiHoldingSession",
    "page.incidents.kpiVisible",
    "page.incidents.kpiHighCritical",
  ];

  it("qualifies every loaded-row KPI as shown/loaded/listed in EN and AR", () => {
    for (const key of LOADED_ROW_KPI_KEYS) {
      expect(enTranslations[key]).toMatch(/loaded|shown|listed|among/iu);
      expect(arTranslations[key]).toMatch(/المحمّلة|المعروضة|ضمن/u);
    }
  });

  it("never presents these counts as authoritative totals", () => {
    for (const key of LOADED_ROW_KPI_KEYS) {
      expect(enTranslations[key].toLowerCase()).not.toMatch(
        /\btotal\b|location-wide|site-wide/u,
      );
      expect(arTranslations[key]).not.toMatch(/الإجمالي/u);
    }
  });

  it("keeps the raw recorded incident type available in details", () => {
    expect(enTranslations["page.incidents.field.rawType"]).toMatch(
      /recorded/iu,
    );
    expect(arTranslations["page.incidents.field.rawType"]).toMatch(/مسجّل/u);
  });
});

describe("overviewErrorMessageKey", () => {
  function errorOf(kind: DashboardApiError["kind"], isNetwork: boolean) {
    return new DashboardApiError({
      kind,
      status: kind === "authorization-masked" ? 404 : 500,
      code: "TEST_CODE",
      message: "test",
      isNetworkError: isNetwork,
    });
  }

  it("maps masked authorization denials to an access message", () => {
    expect(
      overviewErrorMessageKey(errorOf("authorization-masked", false)),
    ).toBe("states.accessDenied");
  });

  it("maps network failures to connection guidance", () => {
    expect(overviewErrorMessageKey(errorOf("server", true))).toBe(
      "states.networkError",
    );
  });

  it("uses the generic message for other failures and for null", () => {
    expect(overviewErrorMessageKey(errorOf("server", false))).toBe(
      "states.errorGeneric",
    );
    expect(overviewErrorMessageKey(null)).toBe("states.errorGeneric");
  });
});
