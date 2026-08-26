import { describe, expect, it } from "vitest";

import type { LocationSubscriptionResponse } from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { LatestRequestSnapshot } from "../../lib/api/latest-request-gate";
import {
  createSubscriptionLoader,
  type SubscriptionLoader,
} from "./subscription-loader";

/**
 * Location-race pins for the subscription loader (D4-004): the read surface
 * is wired through the shared latest-request-wins gate so a late Location A
 * response can never render under Location B — including A's
 * organizationId/planCode — and a superseded request is aborted.
 */

const LOCATION_A = "11111111-1111-4111-8111-111111111111";
const LOCATION_B = "22222222-2222-4222-8222-222222222222";

function envelope(
  locationId: string,
  planCode: string | null,
): LocationSubscriptionResponse {
  return {
    locationId,
    organizationId: "99999999-8888-4777-8666-555555555555",
    subscription:
      planCode === null
        ? null
        : {
            entitlements: {
              basicBranding: true,
              dashboardAccess: true,
              reportExports: true,
            },
            planCode,
            status: "TRIAL",
          },
  };
}

interface Deferred {
  readonly signal: AbortSignal;
  reject(error: unknown): void;
  resolve(data: LocationSubscriptionResponse): void;
}

class Harness {
  readonly snapshots: LatestRequestSnapshot<LocationSubscriptionResponse>[] =
    [];
  readonly requests: Deferred[] = [];
  readonly loader: SubscriptionLoader;

  constructor() {
    this.loader = createSubscriptionLoader({
      client: {
        request: <T>(_path: string, options: Record<string, unknown> = {}) =>
          new Promise<T>((resolve, reject) => {
            this.requests.push({
              reject,
              resolve: resolve as (value: LocationSubscriptionResponse) => void,
              signal:
                (options.signal as AbortSignal | undefined) ??
                new AbortController().signal,
            });
          }),
      },
      onChange: (snapshot) => {
        this.snapshots.push(snapshot);
      },
    });
  }

  get latest(): LatestRequestSnapshot<LocationSubscriptionResponse> {
    return this.snapshots[this.snapshots.length - 1]!;
  }
}

/** Lets queued microtasks (promise callbacks) settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("subscription loader races", () => {
  it("A→B switch aborts A and commits a loading snapshot with data:null", () => {
    const harness = new Harness();
    harness.loader.load(LOCATION_A);
    harness.loader.load(LOCATION_B);
    expect(harness.latest.phase).toBe("loading");
    expect(harness.latest.data).toBeNull();
    expect(harness.requests[0]?.signal.aborted).toBe(true);
    expect(harness.requests[1]?.signal.aborted).toBe(false);
  });

  it("a late A response can never appear under B", async () => {
    const harness = new Harness();
    harness.loader.load(LOCATION_A);
    harness.loader.load(LOCATION_B);
    harness.requests[0]!.resolve(envelope(LOCATION_A, "PLAN_A"));
    await flush();
    // No snapshot after the switch ever carries A's payload:
    const afterSwitch = harness.snapshots.slice(2);
    expect(
      afterSwitch.some((s) => s.data !== null && s.data.locationId === LOCATION_A),
    ).toBe(false);
    expect(harness.latest.phase).toBe("loading");
    // B settles normally:
    harness.requests[1]!.resolve(envelope(LOCATION_B, "PLAN_B"));
    await flush();
    expect(harness.latest.phase).toBe("ready");
    if (harness.latest.phase === "ready") {
      expect(harness.latest.data.locationId).toBe(LOCATION_B);
      expect(harness.latest.data.subscription?.planCode).toBe("PLAN_B");
    }
  });

  it("null-subscription payloads pass through verbatim", async () => {
    const harness = new Harness();
    harness.loader.load(LOCATION_A);
    await flush();
    harness.requests[0]!.resolve(envelope(LOCATION_A, null));
    await flush();
    expect(harness.latest.phase).toBe("ready");
    if (harness.latest.phase === "ready") {
      expect(harness.latest.data.subscription).toBeNull();
    }
  });

  it("a late A rejection is dropped and never surfaces under B", async () => {
    const harness = new Harness();
    harness.loader.load(LOCATION_A);
    harness.loader.load(LOCATION_B);
    harness.requests[0]!.reject(new DashboardApiError({
      code: "AUTHORIZATION_DENIED",
      kind: "authorization-masked",
      message: "not available",
      status: 404,
    }));
    await flush();
    expect(harness.latest.phase).toBe("loading");
    expect(harness.latest.error).toBeNull();
    harness.requests[1]!.resolve(envelope(LOCATION_B, "PLAN_B"));
    await flush();
    expect(harness.latest.phase).toBe("ready");
  });

  it("retry re-runs exactly the last requested location", async () => {
    const harness = new Harness();
    harness.loader.load(LOCATION_A);
    harness.loader.load(LOCATION_B);
    harness.requests[1]!.reject(new Error("network down"));
    await flush();
    expect(harness.latest.phase).toBe("error");
    harness.loader.retry();
    expect(harness.requests).toHaveLength(3);
    harness.requests[2]!.resolve(envelope(LOCATION_B, null));
    await flush();
    expect(harness.latest.phase).toBe("ready");
  });

  it("dispose aborts the in-flight request and freezes state", async () => {
    const harness = new Harness();
    harness.loader.load(LOCATION_A);
    harness.loader.dispose();
    expect(harness.requests[0]?.signal.aborted).toBe(true);
    harness.requests[0]!.resolve(envelope(LOCATION_A, "LATE"));
    await flush();
    expect(harness.latest.phase).toBe("loading");
  });
});
