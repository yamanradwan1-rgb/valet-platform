import { describe, expect, it } from "vitest";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import { canRetry, errorMessageKey } from "./financial-overview-view";
import {
  formatCurrencyAmount,
  formatPaymentCount,
  hasCurrencyGroups,
  isCurrentLocationCurrency,
} from "./financial-overview-display";
import {
  DashboardApiError,
  mapNetworkError,
  type DashboardApiFailureKind,
} from "../../lib/api/api-error";

describe("financial overview money display", () => {
  it("concatenates the group's own currency with its exact amount string", () => {
    // Zero padding survives verbatim; no float round-trip is involved.
    expect(formatCurrencyAmount("JOD", "1140.500")).toBe("JOD 1140.500");
    expect(formatCurrencyAmount("USD", "0.000")).toBe("USD 0.000");
  });

  it("renders payment counts as plain strings", () => {
    const group = {
      amountDueTotal: "10.000",
      amountPaidTotal: "10.000",
      collectionMethodCounts: [],
      currency: "JOD",
      currentValidationAmountTotal: "0.000",
      paymentCount: 84,
      statusCounts: [],
      succeededRefundAmountTotal: "0.000",
      tipAmountTotal: "1.250",
    };
    expect(formatPaymentCount(group)).toBe("84");
  });

  it("flags only the matching configured location currency", () => {
    const group = {
      amountDueTotal: "1.000",
      amountPaidTotal: "1.000",
      collectionMethodCounts: [],
      currency: "JOD",
      currentValidationAmountTotal: "0.000",
      paymentCount: 1,
      statusCounts: [],
      succeededRefundAmountTotal: "0.000",
      tipAmountTotal: "0.000",
    };
    expect(isCurrentLocationCurrency(group, "JOD")).toBe(true);
    expect(isCurrentLocationCurrency(group, "USD")).toBe(false);
    expect(isCurrentLocationCurrency(group, null)).toBe(false);
    expect(isCurrentLocationCurrency(group, undefined)).toBe(false);
    expect(isCurrentLocationCurrency(group, "")).toBe(false);
  });

  it("detects empty and non-empty currency group lists", () => {
    expect(hasCurrencyGroups({ currencies: [] })).toBe(false);
    expect(hasCurrencyGroups({ currencies: [{}] })).toBe(true);
  });
});

describe("financial overview EN/AR labels", () => {
  it("labels every payment status in both locales", () => {
    for (const status of [
      "NOT_REQUIRED",
      "UNPAID",
      "PENDING",
      "PAID",
      "FAILED",
    ] as const) {
      expect(enTranslations[`enum.payment.${status}`]).toBeTruthy();
      expect(arTranslations[`enum.payment.${status}`]).toBeTruthy();
    }
  });

  it("labels every collection method in both locales", () => {
    for (const method of ["NONE", "CASH", "DIGITAL"] as const) {
      expect(enTranslations[`enum.collection.${method}`]).toBeTruthy();
      expect(arTranslations[`enum.collection.${method}`]).toBeTruthy();
    }
  });

  it("keeps the financial fragment bilingual with honest-empty copy", () => {
    expect(enTranslations["financial.empty"]).toContain("No payment activity");
    expect(arTranslations["financial.empty"]).toContain("لا يوجد نشاط مدفوعات");
    expect(enTranslations["financial.currencyGroupLabel"]).toBe(
      "Currency group",
    );
    expect(arTranslations["financial.currencyGroupLabel"]).toBe(
      "مجموعة العملة",
    );
  });
});

describe("financial overview error semantics (§15)", () => {
  function errorOf(
    kind: DashboardApiFailureKind,
    code: string,
    isNetworkError = false,
  ): DashboardApiError {
    return new DashboardApiError({
      kind,
      status: 0,
      code,
      message: "x",
      isNetworkError,
    });
  }

  it("maps masked 404 and forbidden to access-denied without retry", () => {
    for (const kind of ["authorization-masked", "forbidden"] as const) {
      const error = errorOf(kind, "LOCATION_ACCESS_DENIED");
      expect(errorMessageKey(error)).toBe("financial.error.accessDenied");
      expect(canRetry(error)).toBe(false);
    }
  });

  it("never offers retry for a finished session", () => {
    const error = new DashboardApiError({
      kind: "session-expired",
      status: 401,
      code: "STAFF_AUTHENTICATION_FAILED",
      message: "expired",
    });
    expect(canRetry(error)).toBe(false);
  });

  it("maps network failures to the network message with retry", () => {
    const error = mapNetworkError();
    expect(errorMessageKey(error)).toBe("financial.error.network");
    expect(canRetry(error)).toBe(true);
  });

  it("maps server/schema-drift failures to load-failed with retry", () => {
    for (const kind of ["server", "rate-limited", "validation"] as const) {
      const error = errorOf(kind, "ANY_BACKEND_CODE");
      expect(errorMessageKey(error)).toBe("financial.error.loadFailed");
      expect(canRetry(error)).toBe(true);
    }
  });
});
