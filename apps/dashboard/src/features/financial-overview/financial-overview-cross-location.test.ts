import { describe, expect, it } from "vitest";

import {
  idleLatestRequestSnapshot,
  type LatestRequestSnapshot,
} from "../../lib/api/latest-request-gate";
import {
  selectScopedValue,
  stampScope,
  type ScopedValue,
} from "../../lib/api/scoped-view";
import type { StaffApiClient } from "../../lib/api/staff-api-client";
import type { FinancialOverviewResponse } from "@valet/contracts";
import { createFinancialOverviewLoader } from "./financial-overview-loader";

/**
 * Cross-location visibility for /financial (D5-001 stale-paint elimination).
 *
 * Drives the REAL loader (latest-request-wins gate) wired exactly as
 * `useFinancialOverview` wires it: snapshots are stamped with the OWNING
 * EFFECT's location, and the view model is selected during render against
 * the current location — so a settled Location A payload can never be
 * returned once Location B is selected, even before A's cleanup runs.
 */

const LOC_A = "11111111-1111-4111-8111-111111111111";
const LOC_B = "22222222-2222-4222-8222-222222222222";

interface PendingRequest {
  resolve(response: FinancialOverviewResponse): void;
  reject(error: unknown): void;
}

class ScopedHarness {
  scope: string | null = null;
  readonly emissions: Array<
    ScopedValue<LatestRequestSnapshot<FinancialOverviewResponse>>
  > = [];
  readonly pending: PendingRequest[] = [];
  readonly loader = createFinancialOverviewLoader({
    client: {
      request: () =>
        new Promise<FinancialOverviewResponse>((resolve, reject) => {
          this.pending.push({ resolve, reject });
        }),
    } as unknown as Pick<StaffApiClient, "request">,
    onChange: (snapshot) => {
      this.emissions.push(stampScope(this.scope, snapshot));
    },
  });

  get latest():
    | ScopedValue<LatestRequestSnapshot<FinancialOverviewResponse>>
    | undefined {
    return this.emissions[this.emissions.length - 1];
  }

  viewUnder(
    currentLocation: string | null,
  ): LatestRequestSnapshot<FinancialOverviewResponse> {
    return selectScopedValue(
      this.latest ?? stampScope(null, idleLatestRequestSnapshot()),
      currentLocation,
      idleLatestRequestSnapshot(),
    );
  }
}

/** Contract-valid envelope; the currency distinguishes locations. */
function responseFor(currency: string): FinancialOverviewResponse {
  return {
    currencies: [
      {
        amountDueTotal: "10.000",
        amountPaidTotal: "10.000",
        collectionMethodCounts: [{ count: 1, method: "CASH" }],
        currency,
        currentValidationAmountTotal: "0.000",
        paymentCount: 1,
        statusCounts: [{ count: 1, status: "PAID" }],
        succeededRefundAmountTotal: "0.000",
        tipAmountTotal: "0.000",
      },
    ],
  };
}

/** Lets queued microtasks (promise callbacks) settle. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("cross-location visibility: financial", () => {
  it("cannot render Location A figures once the selection is Location B", async () => {
    const harnessA = new ScopedHarness();
    harnessA.scope = LOC_A;
    harnessA.loader.load(LOC_A);
    expect(harnessA.viewUnder(LOC_A).phase).toBe("loading");
    harnessA.pending[0]!.resolve(responseFor("JOD"));
    await tick();
    expect(harnessA.viewUnder(LOC_A).phase).toBe("ready");

    // Steps 2-4: selection becomes B; evaluating BEFORE the switch effect
    // yields B's neutral idle posture — never A's ready figures.
    const preEffect = harnessA.viewUnder(LOC_B);
    expect(preEffect.phase).toBe("idle");
    expect(preEffect.data).toBeNull();
  });

  it("keeps a late in-flight A response hidden after the switch", async () => {
    const harnessA = new ScopedHarness();
    harnessA.scope = LOC_A;
    harnessA.loader.load(LOC_A);

    // Production wiring: B's effect creates a NEW loader stamped with B.
    const harnessB = new ScopedHarness();
    harnessB.scope = LOC_B;
    harnessB.loader.load(LOC_B);
    expect(harnessB.viewUnder(LOC_B).phase).toBe("loading");

    // The straggler A response lands now, while A's cleanup is still
    // pending: it settles A's own state under its A stamp only.
    harnessA.pending[0]!.resolve(responseFor("JOD"));
    await tick();
    expect(harnessA.viewUnder(LOC_A).phase).toBe("ready");

    // ...and B keeps rendering B's own loading posture — never A figures.
    expect(harnessB.viewUnder(LOC_B).phase).toBe("loading");
    expect(harnessB.viewUnder(LOC_B).data).toBeNull();
  });

  it("renders B's own loading then ready states for B only", async () => {
    const harnessB = new ScopedHarness();
    harnessB.scope = LOC_B;
    harnessB.loader.load(LOC_B);
    expect(harnessB.latest?.ownerId).toBe(LOC_B);
    expect(harnessB.viewUnder(LOC_B).phase).toBe("loading");

    harnessB.pending[0]!.resolve(responseFor("USD"));
    await tick();
    const visible = harnessB.viewUnder(LOC_B);
    expect(visible.phase).toBe("ready");
    expect(visible.data?.currencies[0]?.currency).toBe("USD");
  });
});
