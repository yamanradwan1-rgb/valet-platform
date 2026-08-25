import { describe, expect, it } from "vitest";

import { DashboardApiError } from "./api-error";
import { apiErrorMessageKey } from "./api-error-message";
import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";

function errorOf(
  kind: DashboardApiError["kind"],
  status: number,
  code: string,
): DashboardApiError {
  return new DashboardApiError({ kind, status, code, message: "backend" });
}

describe("api error message mapping", () => {
  it("never exposes raw backend codes as user messages", () => {
    for (const error of [
      errorOf("session-expired", 401, "STAFF_AUTHENTICATION_REQUIRED"),
      errorOf("forbidden", 403, "ROLE_FORBIDDEN"),
      errorOf("authorization-masked", 404, "AUTHORIZATION_DENIED"),
      errorOf("conflict", 409, "CONFIGURATION_OVERRIDE_CONFLICT"),
      errorOf("validation", 400, "REQUEST_INVALID"),
      errorOf("rate-limited", 429, "STAFF_AUTHENTICATION_RATE_LIMITED"),
      errorOf("not-found", 404, "OTHER"),
      errorOf("server", 500, "INTERNAL_ERROR"),
      errorOf("network", 0, "NETWORK_ERROR"),
    ]) {
      const key = apiErrorMessageKey(error);
      expect(enTranslations[key]).toBeTruthy();
      expect(arTranslations[key]).toBeTruthy();
      expect(enTranslations[key]).not.toContain(error.code);
    }
  });

  it("maps authorization masking to a friendly access-denied surface", () => {
    expect(
      apiErrorMessageKey(
        errorOf("authorization-masked", 404, "AUTHORIZATION_DENIED"),
      ),
    ).toBe("errors.accessDenied");
    expect(apiErrorMessageKey(errorOf("forbidden", 403, "X"))).toBe(
      "errors.accessDenied",
    );
  });

  it("maps session expiry and rate limiting distinctly", () => {
    expect(
      apiErrorMessageKey(errorOf("session-expired", 401, "X")),
    ).toBe("errors.sessionExpired");
    expect(apiErrorMessageKey(errorOf("rate-limited", 429, "X"))).toBe(
      "errors.rateLimited",
    );
  });

  it("falls back to a generic friendly failure for unknown errors", () => {
    expect(apiErrorMessageKey(new Error("boom"))).toBe("errors.requestFailed");
    expect(apiErrorMessageKey(undefined)).toBe("errors.requestFailed");
  });
});
