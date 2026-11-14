import { describe, expect, it } from "vitest";
import {
  dashboardApiErrorFromResponse,
  dashboardMalformedError,
  dashboardNetworkError,
} from "../../../lib/api/dashboard-api-error";
import { isStaffResetIssueOutcomeAmbiguous } from "./staff-password-reset-ambiguity";

describe("Issue416 reset POST ambiguity boundary", () => {
  it.each([408, 500, 502, 503, 504, 599])(
    "treats HTTP %i as an unknown COMMIT even when API classifier says unknown",
    (status) => {
      const reason = dashboardApiErrorFromResponse(status, {
        code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
        message: "Unavailable",
        requestId: "synthetic",
      });
      expect(isStaffResetIssueOutcomeAmbiguous(reason)).toBe(true);
    },
  );

  it("also treats response parsing and network transport failures as unknown", () => {
    expect(isStaffResetIssueOutcomeAmbiguous(dashboardNetworkError())).toBe(true);
    expect(isStaffResetIssueOutcomeAmbiguous(dashboardMalformedError())).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422, 429])(
    "keeps HTTP %i on its existing explicit error path",
    (status) => {
      const reason = dashboardApiErrorFromResponse(status, {
        code: "STAFF_PASSWORD_RESET_CONFLICT",
        message: "Denied",
        requestId: "synthetic",
      });
      expect(isStaffResetIssueOutcomeAmbiguous(reason)).toBe(false);
    },
  );
});
