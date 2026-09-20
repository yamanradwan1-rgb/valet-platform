import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  isUncertainMfaMutation,
  mfaErrorKey,
  shouldReconcileMfaMutation,
} from "./mfa-ui";

function apiError(kind: ConstructorParameters<typeof DashboardApiError>[0]["kind"], code: string) {
  return new DashboardApiError({ kind, code, message: "raw server detail" });
}

describe("MFA UI error policy", () => {
  it("maps verification failures to safe UI copy", () => {
    expect(mfaErrorKey(apiError("mfa", "MFA_VERIFICATION_FAILED"))).toBe(
      "mfaErrorVerification",
    );
    expect(mfaErrorKey(apiError("mfa", "MFA_RATE_LIMITED"))).toBe(
      "mfaErrorRateLimited",
    );
  });

  it("reconciles mutations whose server outcome may be unknown", () => {
    expect(isUncertainMfaMutation(apiError("network", "NETWORK_ERROR"))).toBe(true);
    expect(isUncertainMfaMutation(apiError("malformed", "MALFORMED_RESPONSE"))).toBe(true);
    expect(isUncertainMfaMutation(apiError("unknown", "SERVER_ERROR"))).toBe(true);
    expect(isUncertainMfaMutation(apiError("mfa", "MFA_VERIFICATION_FAILED"))).toBe(false);
    expect(shouldReconcileMfaMutation(apiError("mfa", "MFA_ENROLLMENT_NOT_AVAILABLE"))).toBe(true);
  });
});
