import { describe, expect, it, vi } from "vitest";
import {
  attendanceZone,
  locationPolicy,
} from "../../../../e2e/support/presence-data";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import type { PresenceApi } from "./shift-presence-api";
import { presenceErrorKey } from "./shift-presence-errors";
import {
  isLastStrictAttendanceZone,
  saveZoneWithReadinessFeedback,
} from "./shift-presence-zone-readiness";
import { presenceCopy } from "./shift-presence-copy";

function context(action: "start" | "end" = "start", inherited = false) {
  const policy = locationPolicy();
  policy.company[`${action}Mode`] = inherited ? "REQUIRE" : "WARN_ONLY";
  policy.overrides[`${action}ModeOverride`] = inherited
    ? null
    : "REQUIRE_OR_OVERRIDE";
  policy.effective[`${action}Mode`] = inherited
    ? "REQUIRE"
    : "REQUIRE_OR_OVERRIDE";
  policy.readiness.applicability = "STRICT";
  const zone = attendanceZone();
  return {
    policy,
    current: { zone, readiness: { ...policy.readiness } },
    input: { ...zone, state: "DISABLED", expectedRevision: zone.revision },
  };
}

describe("#344 persisted last-zone readiness explanation", () => {
  it.each(["start", "end"] as const)(
    "uses strict %s with company inheritance or saved override",
    (action) => {
      for (const inherited of [true, false]) {
        const { policy, current, input } = context(action, inherited);
        expect(isLastStrictAttendanceZone(policy, current, input)).toBe(true);
      }
    },
  );
  it("rejects additional zones, non-strict, mismatched snapshots, stale revision and unrelated edits", () => {
    const { policy, current, input } = context();
    expect(
      isLastStrictAttendanceZone(
        { ...policy, readiness: { ...policy.readiness, activeZoneCount: 2 } },
        current,
        input,
      ),
    ).toBe(false);
    expect(isLastStrictAttendanceZone(locationPolicy(), current, input)).toBe(
      false,
    );
    expect(
      isLastStrictAttendanceZone(
        policy,
        {
          ...current,
          readiness: {
            ...current.readiness,
            configurationFingerprint: "b".repeat(64),
          },
        },
        input,
      ),
    ).toBe(false);
    expect(
      isLastStrictAttendanceZone(policy, current, {
        ...input,
        expectedRevision: 2,
      }),
    ).toBe(false);
    expect(
      isLastStrictAttendanceZone(policy, current, { ...input, label: "Other" }),
    ).toBe(false);
    expect(
      isLastStrictAttendanceZone(
        { ...policy, effective: { ...policy.effective, startMode: "OFF" } },
        current,
        input,
      ),
    ).toBe(false);
  });
  it("diagnoses only rejected disable, keeps the original code and never retries writes", async () => {
    const { policy, current, input } = context("end");
    const error = new DashboardApiError({
      kind: "conflict",
      status: 409,
      code: "PRESENCE_NOT_READY",
      message: "Rejected",
    });
    const api = {
      saveZone: vi.fn().mockRejectedValue(error),
      policy: vi.fn().mockResolvedValue(policy),
      zone: vi.fn().mockResolvedValue(current),
    };
    const result = await saveZoneWithReadinessFeedback(
      api as unknown as PresenceApi,
      current.zone.id,
      input,
      false,
    ).catch((reason: unknown) => reason);
    expect(presenceErrorKey(result)).toBe("lastZoneError");
    expect(result).toMatchObject({ code: "PRESENCE_NOT_READY", status: 409 });
    expect(api.saveZone).toHaveBeenCalledTimes(1);
    api.policy.mockRejectedValue(new Error("Unavailable"));
    await expect(
      saveZoneWithReadinessFeedback(
        api as unknown as PresenceApi,
        current.zone.id,
        input,
        false,
      ),
    ).rejects.toBe(error);
  });
  it.each(["CONFLICT", "AUTHORIZATION_DENIED", "UNKNOWN"])(
    "keeps %s mapping and skips diagnosis",
    async (code) => {
      const error = new DashboardApiError({
        kind: "unknown",
        code,
        message: "Rejected",
      });
      const api = {
        saveZone: vi.fn().mockRejectedValue(error),
        policy: vi.fn(),
      };
      await expect(
        saveZoneWithReadinessFeedback(
          api as unknown as PresenceApi,
          "zone",
          {},
          false,
        ),
      ).rejects.toBe(error);
      expect(api.policy).not.toHaveBeenCalled();
    },
  );
  it("provides actionable EN/AR generic and precise copy", () => {
    for (const locale of ["en", "ar"] as const) {
      expect(presenceCopy(locale)("lastZoneError")).toContain(
        locale === "ar" ? "آخر منطقة" : "last active attendance zone",
      );
      expect(presenceCopy(locale)("notReadyError")).toContain(
        locale === "ar" ? "راجع الجاهزية" : "Review Readiness",
      );
    }
  });
});
