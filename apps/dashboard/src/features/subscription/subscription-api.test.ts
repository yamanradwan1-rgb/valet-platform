import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  fetchLocationSubscription,
  subscriptionPath,
  type SubscriptionClient,
} from "./subscription-api";

/**
 * Endpoint contract pins for the D4-004 subscription READ surface.
 * Re-verified against
 * apps/api/src/modules/dashboard/subscription.controller.ts:
 * - GET /dashboard/locations/:locationId/subscription (the ONLY route)
 *
 * The backend exposes no mutation/billing/price/invoice/payment-method/
 * customer-portal API for subscriptions, so this module deliberately exports
 * no mutation function and a source invariant below pins that no write verb
 * can creep in silently.
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const ORG_ID = "11111111-2222-4333-8444-555555555555";

interface RecordedRequest {
  readonly path: string;
  readonly options: { readonly signal?: AbortSignal };
}

function recordingClient(
  responder: () => unknown,
): { client: SubscriptionClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: SubscriptionClient = {
    async request<T>(path: string, options: Record<string, unknown> = {}) {
      requests.push({
        options: options as RecordedRequest["options"],
        path,
      });
      return responder() as T;
    },
  };
  return { client, requests };
}

function presentPayload(): Record<string, unknown> {
  return {
    locationId: LOCATION_ID,
    organizationId: ORG_ID,
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

describe("location subscription endpoint", () => {
  it("builds the exact subscription path under the staff API base", () => {
    expect(subscriptionPath(LOCATION_ID)).toBe(
      `/dashboard/locations/${LOCATION_ID}/subscription`,
    );
  });

  it("GET reads a present subscription through strict parsing", async () => {
    const { client, requests } = recordingClient(presentPayload);
    const response = await fetchLocationSubscription(client, LOCATION_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_ID}/subscription`,
    );
    expect(response.subscription?.planCode).toBe("PILOT_STANDARD");
    expect(response.subscription?.status).toBe("TRIAL");
    expect(response.subscription?.entitlements.reportExports).toBe(false);
  });

  it("passes subscription:null through VERBATIM (no fabricated plan)", async () => {
    const { client } = recordingClient(() => ({
      locationId: LOCATION_ID,
      organizationId: ORG_ID,
      subscription: null,
    }));
    const response = await fetchLocationSubscription(client, LOCATION_ID);
    expect(response.organizationId).toBe(ORG_ID);
    expect(response.locationId).toBe(LOCATION_ID);
    expect(response.subscription).toBeNull();
  });

  it("rejects drifted responses instead of rendering unknown shapes", async () => {
    for (const payload of [
      // Extra top-level field:
      () => ({ ...presentPayload(), extra: true }),
      // Missing entitlements inside the state:
      () => ({
        locationId: LOCATION_ID,
        organizationId: ORG_ID,
        subscription: { planCode: "PILOT_STANDARD", status: "TRIAL" },
      }),
      // Unknown subscription field:
      () => ({
        locationId: LOCATION_ID,
        organizationId: ORG_ID,
        subscription: {
          ...(presentPayload().subscription as Record<string, unknown>),
          renewalDate: "2030-01-01",
        },
      }),
    ]) {
      const { client } = recordingClient(payload);
      await expect(
        fetchLocationSubscription(client, LOCATION_ID),
      ).rejects.toMatchObject({ code: "SUBSCRIPTION_RESPONSE_INVALID" });
    }
  });
});

describe("read-only surface invariants", () => {
  const source = readFileSync(
    new URL("./subscription-api.ts", import.meta.url),
    "utf8",
  );

  it("exports NO mutation function and never sends a write verb", () => {
    expect(source.includes('method: "PUT"')).toBe(false);
    expect(source.includes('method: "POST"')).toBe(false);
    expect(source.includes('method: "PATCH"')).toBe(false);
    expect(source.includes('method: "DELETE"')).toBe(false);
    expect(/export (async )?function (set|clear|update|create|delete)/u.test(source)).toBe(
      false,
    );
  });

  it("documents that no billing surface exists anywhere on this route", () => {
    // Strip comments so prose in documentation cannot trip the scan; only
    // actual code content is checked.
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/^\s*\/\/.*$/gmu, "");
    for (const banned of ["stripe", "invoice", "checkout", "price", "renewal"]) {
      expect(codeOnly.includes(banned)).toBe(false);
    }
  });
});
