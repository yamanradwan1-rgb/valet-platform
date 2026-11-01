import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  isNestedMfaReadError,
  nestedMfaReadResult,
} from "../../components/foundation/use-nested-mfa-bridge";

function error(
  status: number,
  code: string,
  kind: "mfa" | "authorization" = "mfa",
) {
  return new DashboardApiError({
    kind,
    status,
    code,
    message: "Protected read failed.",
  });
}

describe("Privacy & Contact nested MFA error classification", () => {
  it("signals only the exact backend 403 MFA_STEP_UP_REQUIRED error", () => {
    const stepUp = error(403, "MFA_STEP_UP_REQUIRED");
    expect(isNestedMfaReadError(stepUp)).toBe(true);
    expect(nestedMfaReadResult([null, stepUp, null], false)).toEqual({
      kind: "required",
      reason: stepUp,
    });
    for (const other of [
      error(409, "MFA_ENROLLMENT_PENDING"),
      error(403, "MFA_FACTOR_NOT_OWNED"),
      error(401, "MFA_STEP_UP_REQUIRED"),
      error(403, "MFA_STEP_UP_REQUIRED", "authorization"),
      error(403, "LOCATION_ACCESS_DENIED", "authorization"),
      new DashboardApiError({ kind: "network", message: "Offline." }),
      new Error("Request aborted."),
    ]) {
      expect(isNestedMfaReadError(other)).toBe(false);
      expect(nestedMfaReadResult([other], false)).toBeNull();
    }
  });

  it("does not treat unrelated read success as assurance of a failing read", () => {
    const stepUp = error(403, "MFA_STEP_UP_REQUIRED");
    expect(nestedMfaReadResult([null, stepUp], true)).toEqual({
      kind: "required",
      reason: stepUp,
    });
    expect(nestedMfaReadResult([null, null], false)).toBeNull();
    expect(nestedMfaReadResult([null, null], true)).toEqual({
      kind: "succeeded",
    });
  });
});
