import { describe, expect, it } from "vitest";
import { managementPresenceAuditEvents } from "@valet/contracts";
import { projectPresenceAuditDetails } from "../src/modules/management/management-audit-presence-projection";
import {
  managementAuditFamilyFor,
  isManagementAuditSupervisorEventType,
} from "../src/modules/management/management-audit-event-catalog";

describe("safe presence management history", () => {
  it("discards hostile private metadata and invalid values even on allowed keys", () => {
    expect(
      projectPresenceAuditDetails({
        revision: 2,
        operation: "SET",
        field: "shiftStartPresenceMode",
        latitude: 31.95001,
        longitude: 35.91,
        accuracyMeters: 1,
        distance: 3,
        capturedAt: "2026-10-04T10:00:00Z",
        requestFingerprint: "a".repeat(64),
        note: "private",
        state: "secret",
        reason: "private",
      }),
    ).toEqual({
      kind: "PRESENCE",
      revision: 2,
      operation: "SET",
      field: "shiftStartPresenceMode",
    });
    expect(
      projectPresenceAuditDetails({
        reason: "APPROVER_AUTHORITY_REVOKED",
        revision: 3,
      }),
    ).toEqual({
      kind: "PRESENCE",
      reason: "APPROVER_AUTHORITY_REVOKED",
      revision: 3,
    });
  });
  it("publishes each presence history family without adding Supervisor visibility", () => {
    for (const event of managementPresenceAuditEvents) {
      expect(managementAuditFamilyFor(event)).toBe("PRESENCE");
      expect(isManagementAuditSupervisorEventType(event)).toBe(false);
    }
  });
});
