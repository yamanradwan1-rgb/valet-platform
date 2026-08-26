import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { LocationSubscriptionResponse } from "@valet/contracts";

import { LocaleProvider } from "../../i18n/locale-provider";
import { DashboardApiError } from "../../lib/api/api-error";
import type { LatestRequestSnapshot } from "../../lib/api/latest-request-gate";
import { SubscriptionSurface } from "./subscription-view";

/**
 * Static-render pins for the read-only Subscription surface (D4-004):
 * backend facts render as plain text (status and entitlement state must be
 * understandable without color/icon), the null subscription renders a
 * neutral truthful state, and the fact surfaces contain NO interactive or
 * mutation affordance whatsoever.
 */

const noop = (): void => undefined;

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";

function presentData(): LocationSubscriptionResponse {
  return {
    locationId: LOCATION_ID,
    organizationId: "99999999-8888-4777-8666-555555555555",
    subscription: {
      entitlements: {
        basicBranding: true,
        dashboardAccess: true,
        reportExports: false,
      },
      planCode: "PILOT_STANDARD",
      status: "TRIAL",
    },
  };
}

function ready(
  data: LocationSubscriptionResponse,
): LatestRequestSnapshot<LocationSubscriptionResponse> {
  return { data, error: null, phase: "ready" };
}

function render(snapshot: LatestRequestSnapshot<LocationSubscriptionResponse>) {
  return renderToStaticMarkup(
    <LocaleProvider>
      <SubscriptionSurface retry={noop} snapshot={snapshot} />
    </LocaleProvider>,
  );
}

describe("subscription present", () => {
  const markup = render(ready(presentData()));

  it("renders plan code as an identifier — never a marketing name", () => {
    expect(markup.includes("PILOT_STANDARD")).toBe(true);
    expect(markup.includes("Pilot")).toBe(false);
    expect(markup.includes("Standard plan")).toBe(false);
  });

  it("exposes the human status text", () => {
    expect(markup.includes("Trial")).toBe(true);
    expect(markup.includes("TRIAL")).toBe(false);
  });

  it("renders all three entitlements with textual availability", () => {
    for (const label of [
      "Dashboard access",
      "Report exports",
      "Basic branding",
    ]) {
      expect(markup.includes(label)).toBe(true);
    }
    expect((markup.match(/Available/gu) ?? []).length).toBe(2);
    expect((markup.match(/Unavailable/gu) ?? []).length).toBe(1);
  });

  it("contains NO button/form/mutation affordance on the fact surface", () => {
    expect(markup.includes("<button")).toBe(false);
    expect(markup.includes("<form")).toBe(false);
  });
});

describe("null subscription renders a neutral truthful state", () => {
  it("shows the neutral empty state without implying cancelled/expired/free", () => {
    const markup = render(
      ready({
        locationId: LOCATION_ID,
        organizationId: "99999999-8888-4777-8666-555555555555",
        subscription: null,
      }),
    );
    expect(markup.includes("No subscription information available")).toBe(true);
    for (const banned of [
      "cancelled",
      "expired",
      "free plan",
      "billing failure",
      "Upgrade",
    ]) {
      expect(markup.toLowerCase().includes(banned.toLowerCase())).toBe(false);
    }
    expect(markup.includes("<button")).toBe(false);
  });
});

describe("loading and error postures", () => {
  it("loading renders an honest status region", () => {
    const markup = render({ data: null, error: null, phase: "loading" });
    expect(markup.includes('role="status"')).toBe(true);
    expect(markup.includes("Loading subscription…")).toBe(true);
  });

  it("error renders role=alert with the only allowed retry control", () => {
    const markup = render({
      data: null,
      error: new DashboardApiError({
        code: "INTERNAL_ERROR",
        kind: "server",
        message: "boom",
        status: 500,
      }),
      phase: "error",
    });
    expect(markup.includes('role="alert"')).toBe(true);
    expect(markup.includes("Retry")).toBe(true);
    expect(markup.includes("boom")).toBe(false); // raw error never leaks
  });
});
