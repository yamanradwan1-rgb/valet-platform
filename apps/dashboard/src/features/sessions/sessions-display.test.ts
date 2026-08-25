import { describe, expect, it } from "vitest";
import type { SessionOverviewEntry } from "@valet/contracts";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import {
  assigneeCellText,
  optionalIdOrDash,
  sessionFilterLabelKey,
  supportedSessionStates,
  vehicleDisplayLabel,
} from "./sessions-display";

const FULL_ID = "2dc14878-df98-4d0f-b164-bc2506a6b101";
const ASSIGNEE_ID = "eb39db89-54d2-45fa-a64e-29f89688f102";

function entry(overrides: {
  plateCountry?: string | null;
  plateNumber?: string | null;
  descriptor?: string | null;
}): SessionOverviewEntry {
  return {
    createdAt: "2026-08-24T09:14:00Z",
    currentAssigneeMembershipId: null,
    keySlotId: null,
    parkingSpotId: null,
    sessionId: FULL_ID,
    state: "PARKED",
    updatedAt: "2026-08-24T09:22:00Z",
    vehicle: {
      plateCountry: overrides.plateCountry ?? null,
      plateNumberNormalized: overrides.plateNumber ?? null,
      temporaryDescriptor: overrides.descriptor ?? null,
      vehicleId: "6225b06f-d0fd-4c02-a59c-b0388094b101",
    },
  };
}

describe("sessions display helpers", () => {
  it("prefers the normalized plate with its country", () => {
    const label = vehicleDisplayLabel(
      entry({ plateNumber: "12A3456", plateCountry: "JO" }),
      "Unnamed",
    );
    expect(label).toBe("12A3456 · JO");
  });

  it("shows the plate alone when the country is null", () => {
    expect(
      vehicleDisplayLabel(entry({ plateNumber: "12A3456" }), "Unnamed"),
    ).toBe("12A3456");
  });

  it("falls back to the temporary descriptor for plateless vehicles", () => {
    expect(
      vehicleDisplayLabel(entry({ descriptor: "Silver sedan" }), "Unnamed"),
    ).toBe("Silver sedan");
  });

  it("uses the caller-provided neutral fallback when nothing is known", () => {
    expect(vehicleDisplayLabel(entry({}), "Unnamed")).toBe("Unnamed");
  });

  it("renders unset spot/key identifiers as a dash, never an invented id", () => {
    expect(optionalIdOrDash(null)).toBe("—");
    expect(optionalIdOrDash(FULL_ID)).toBe("2dc14878…b101");
  });

  it("renders a nullable assignee as Unassigned text", () => {
    expect(assigneeCellText(null, "Unassigned")).toBe("Unassigned");
    expect(assigneeCellText(ASSIGNEE_ID, "Unassigned")).toBe("eb39db89…f102");
  });

  it("maps every backend-supported (non-completed) state to labels in EN and AR", () => {
    for (const state of supportedSessionStates()) {
      const key = sessionFilterLabelKey(state);
      expect(enTranslations[key].length).toBeGreaterThan(0);
      expect(arTranslations[key].length).toBeGreaterThan(0);
      expect(enTranslations[key]).not.toMatch(/_/u);
      expect(arTranslations[key]).not.toMatch(/_/u);
    }
  });

  it("keeps COMPLETED as a valid global label while absent from this surface", () => {
    // Global typed enum mapping stays intact for overview counts and others.
    expect(enTranslations["enum.session.COMPLETED"]).toBeTruthy();
    expect(arTranslations["enum.session.COMPLETED"]).toBeTruthy();
    // ...but the sessions filter model excludes it.
    expect(supportedSessionStates()).not.toContain("COMPLETED");
  });
});
