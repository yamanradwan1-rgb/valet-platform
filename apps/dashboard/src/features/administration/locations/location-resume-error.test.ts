import { expect, it } from "vitest";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { locationResumeError } from "./location-resume-error";

it("localizes Resume feedback without changing MFA or conflict classification", () => {
  for (const locale of ["en", "ar"] as const) {
    for (const kind of ["conflict", "authorization", "network"] as const) {
      const error = new DashboardApiError({
        kind,
        status: 409,
        code: "SYNTHETIC",
        message: "Raw server feedback",
      });
      const feedback = locationResumeError(error, locale);
      expect(feedback).toMatchObject({ kind, status: 409, code: "SYNTHETIC" });
      expect(feedback.message).not.toContain("Raw server feedback");
      expect(/[\u0600-\u06ff]/.test(feedback.message)).toBe(locale === "ar");
    }
  }
  const mfa = new DashboardApiError({
    kind: "mfa",
    code: "MFA_STEP_UP_REQUIRED",
    message: "Verify",
  });
  expect(locationResumeError(mfa, "ar")).toBe(mfa);
});
