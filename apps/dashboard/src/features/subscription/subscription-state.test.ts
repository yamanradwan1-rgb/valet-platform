import { describe, expect, it } from "vitest";

import type { SubscriptionStatus } from "@valet/contracts";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import { DashboardApiError } from "../../lib/api/api-error";
import {
  SUBSCRIPTION_ENTITLEMENT_ORDER,
  entitlementLabelKey,
  subscriptionFailureMessageKey,
  subscriptionStatusLabelKey,
} from "./subscription-state";

/**
 * Display-rule pins for the read-only Subscription surface (D4-004). The
 * mappers are exhaustive over the shared contract types (a new backend enum
 * member or entitlement breaks compilation until labeled) and every label
 * resolves in BOTH locales — raw enum values are never rendered.
 */

const ALL_STATUSES: readonly SubscriptionStatus[] = [
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
];

describe("subscription status labels", () => {
  it("maps every contract status to its enum.* key", () => {
    expect(subscriptionStatusLabelKey("TRIAL")).toBe(
      "enum.subscription.TRIAL",
    );
    expect(subscriptionStatusLabelKey("ACTIVE")).toBe(
      "enum.subscription.ACTIVE",
    );
    expect(subscriptionStatusLabelKey("SUSPENDED")).toBe(
      "enum.subscription.SUSPENDED",
    );
  });

  it("every status label resolves in EN and AR", () => {
    for (const status of ALL_STATUSES) {
      const key = subscriptionStatusLabelKey(status);
      expect(typeof enTranslations[key]).toBe("string");
      expect(typeof arTranslations[key]).toBe("string");
    }
    expect(enTranslations["enum.subscription.SUSPENDED"]).toBe("Suspended");
    expect(arTranslations["enum.subscription.ACTIVE"]).toBe("نشط");
  });
});

describe("entitlement labels", () => {
  it("exposes exactly the three contract entitlements in stable order", () => {
    expect([...SUBSCRIPTION_ENTITLEMENT_ORDER]).toEqual([
      "dashboardAccess",
      "reportExports",
      "basicBranding",
    ]);
  });

  it("maps each entitlement to a key that resolves in both locales", () => {
    for (const name of SUBSCRIPTION_ENTITLEMENT_ORDER) {
      const key = entitlementLabelKey(name);
      expect(typeof enTranslations[key]).toBe("string");
      expect(typeof arTranslations[key]).toBe("string");
    }
    expect(enTranslations["subscription.entitlement.basicBranding"]).toBe(
      "Basic branding",
    );
    expect(arTranslations["subscription.entitlement.basicBranding"]).toBe(
      "الهوية البصرية الأساسية",
    );
  });
});

function apiError(
  kind: DashboardApiError["kind"],
  code: string,
  isNetworkError = false,
): DashboardApiError {
  return new DashboardApiError({
    code,
    isNetworkError,
    kind,
    message: code,
    status: 0,
  });
}

describe("failure message mapping", () => {
  it("maps every truthful failure class to its user-safe key", () => {
    expect(
      subscriptionFailureMessageKey(apiError("server", "NETWORK_ERROR", true)),
    ).toBe("states.networkError");
    expect(
      subscriptionFailureMessageKey(apiError("session-expired", "X")),
    ).toBe("errors.sessionExpired");
    expect(
      subscriptionFailureMessageKey(
        apiError("authorization-masked", "AUTHORIZATION_DENIED"),
      ),
    ).toBe("errors.accessDenied");
    expect(
      subscriptionFailureMessageKey(apiError("rate-limited", "X")),
    ).toBe("errors.rateLimited");
    expect(
      subscriptionFailureMessageKey(apiError("server", "INTERNAL_ERROR")),
    ).toBe("subscription.state.loadFailed");
    expect(subscriptionFailureMessageKey(new Error("raw"))).toBe(
      "errors.requestFailed",
    );
  });
});
