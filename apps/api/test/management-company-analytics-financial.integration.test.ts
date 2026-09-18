import { randomUUID } from "node:crypto";

import type { CompanyAnalyticsResponse } from "@valet/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  seedCompanyCurrentValidation,
  seedCompanyPayment,
  seedCompanySession,
  seedCompanySucceededRefund,
  type CompanySeedScope,
} from "./management-company-analytics-test-seed";

const fixture = new ManagementControlPlaneTestFixture();
let shared: Awaited<ReturnType<typeof scenario>>;

beforeAll(async () => {
  await fixture.start();
  shared = await scenario();
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function scenario() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name: "BE-11 finance" });
  const locations = await Promise.all(
    ["JOD A", "JOD B", "USD", "Historical GBP"].map((name) =>
      fixture.addLocation(membership.organizationId, { name }),
    ),
  );
  await fixture.query(`UPDATE locations SET currency='USD' WHERE id=$1`, [locations[2]!.locationId]);
  await fixture.query(`UPDATE locations SET currency='GBP' WHERE id=$1`, [locations[3]!.locationId]);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const scope = (index: number): CompanySeedScope => ({
    locationId: locations[index]!.locationId,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
  });
  return { auth, jodA: scope(0), jodB: scope(1), membership, historical: scope(3), usd: scope(2) };
}

async function completedPayment(
  scope: CompanySeedScope,
  input: { currency: string; hour: number; method: "CASH" | "DIGITAL"; validate?: boolean },
) {
  const hh = String(input.hour).padStart(2, "0");
  const sessionId = await seedCompanySession(fixture, scope, {
    completedAt: `2026-07-10T${hh}:10:00Z`,
    createdAt: `2026-07-10T${hh}:00:00Z`,
    state: "COMPLETED",
  });
  const paymentId = await seedCompanyPayment(fixture, scope, {
    currency: input.currency,
    method: input.method,
    paidAt: `2026-07-10T${hh}:20:00Z`,
    sessionId,
  });
  if (input.validate === true) {
    await seedCompanyCurrentValidation(fixture, scope, paymentId);
  }
  return paymentId;
}

async function cashShift(
  scope: CompanySeedScope,
  currency: string,
  expected: string,
  reported: string,
  variance: string,
) {
  await fixture.query(
    `INSERT INTO shifts
       (id,organization_id,location_id,membership_id,status,started_at,ended_at,
        cash_expected,cash_reported,cash_variance,cash_currency,cash_reported_at,
        cash_reported_by_membership_id)
     VALUES($1,$2,$3,$4,'ENDED','2026-07-10T07:00:00Z','2026-07-10T18:00:00Z',
            $5,$6,$7,$8,'2026-07-10T18:00:00Z',$4)`,
    [randomUUID(), scope.organizationId, scope.locationId, scope.membershipId,
      expected, reported, variance, currency],
  );
}

describe("MGT-BE-11 company financial source composition", () => {
  it("recomputes unequal digital/validation ratios and preserves source currencies", async () => {
    const state = shared;
    await Promise.all([
      completedPayment(state.jodA, {
        currency: "JOD",
        hour: 8,
        method: "DIGITAL",
        validate: true,
      }),
      ...[10, 12, 14].map((hour) =>
        completedPayment(state.jodB, { currency: "JOD", hour, method: "CASH" }),
      ),
      (async () => {
        const eurSession = await seedCompanySession(fixture, state.usd, {
          completedAt: "2026-07-10T16:10:00Z",
          createdAt: "2026-07-10T16:00:00Z",
          state: "COMPLETED",
        });
        const eurPayment = await seedCompanyPayment(fixture, state.usd, {
          currency: "EUR",
          sessionId: eurSession,
          status: "UNPAID",
        });
        await seedCompanyCurrentValidation(fixture, state.usd, eurPayment);
      })(),
      (async () => {
        const refundSession = await seedCompanySession(fixture, state.usd, {
          createdAt: "2026-07-09T08:00:00Z",
          state: "PARKED",
        });
        const usdPayment = await seedCompanyPayment(fixture, state.usd, {
          currency: "USD",
          sessionId: refundSession,
          status: "UNPAID",
        });
        await seedCompanySucceededRefund(fixture, state.usd, {
          amount: "2.750",
          completedAt: "2026-07-10T17:00:00Z",
          paymentId: usdPayment,
        });
      })(),
      completedPayment(state.historical, { currency: "GBP", hour: 18, method: "CASH" }),
    ]);
    await fixture.query(`UPDATE locations SET currency='AED' WHERE id=$1`, [state.historical.locationId]);
    await completedPayment(state.historical, { currency: "AED", hour: 20, method: "CASH" });

    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-07-10&to=2026-07-10`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    const summary = (response.body as unknown as CompanyAnalyticsResponse).summary;
    const groups = summary.financial.currencies;
    expect(Object.keys(summary.financial).sort()).toEqual(["cashReconciliation", "currencies"]);
    expect(groups.map((group) => group.currency)).toEqual(["AED", "EUR", "GBP", "JOD", "USD"]);
    expect(groups.find((group) => group.currency === "AED")).toMatchObject({
      collectedAmountTotal: "11.000",
      paidPaymentCount: 1,
    });
    expect(groups.find((group) => group.currency === "JOD")).toMatchObject({
      collectedAmountTotal: "44.000",
      digitalPaymentRate: { denominator: 4, numerator: 1, percentage: "25.00" },
      paidPaymentCount: 4,
      tipAmountTotal: "4.000",
      validationRate: { denominator: 4, numerator: 1, percentage: "25.00" },
    });
    expect(groups.find((group) => group.currency === "EUR")).toMatchObject({
      collectedAmountTotal: "0.000",
      currentValidationAmountTotal: "4.000",
      digitalPaymentRate: { denominator: 0, numerator: 0, percentage: null },
      paidPaymentCount: 0,
      validationRate: { denominator: 1, numerator: 1, percentage: "100.00" },
    });
    expect(groups.find((group) => group.currency === "USD")).toMatchObject({
      collectedAmountTotal: "0.000",
      paidPaymentCount: 0,
      succeededRefundAmountTotal: "2.750",
      validationRate: { denominator: 0, numerator: 0, percentage: null },
    });
    expect(groups.find((group) => group.currency === "GBP")).toMatchObject({
      collectedAmountTotal: "11.000",
      paidPaymentCount: 1,
    });
    const locationCurrencies = await fixture.query<{ currency: string }>(
      `SELECT currency FROM locations WHERE organization_id=$1 ORDER BY name`,
      [state.membership.organizationId],
    );
    expect(locationCurrencies.rows.map((row) => row.currency).sort()).toEqual([
      "AED", "JOD", "JOD", "USD",
    ]);
  });

  it("keeps closed-shift cash reconciliation separated by recorded currency", async () => {
    const state = shared;
    await fixture.query(`UPDATE locations SET currency='AED' WHERE id=$1`, [state.historical.locationId]);
    await Promise.all([
      cashShift(state.jodA, "JOD", "100.000", "98.000", "-2.000"),
      cashShift(state.usd, "USD", "50.000", "51.000", "1.000"),
      cashShift(state.historical, "AED", "70.000", "70.000", "0.000"),
    ]);

    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-07-10&to=2026-07-10`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    const summary = (response.body as unknown as CompanyAnalyticsResponse).summary;
    expect(summary.financial.cashReconciliation).toEqual([
      { cashExpectedTotal: "70.000", cashReportedTotal: "70.000", cashVarianceTotal: "0.000", currency: "AED" },
      { cashExpectedTotal: "100.000", cashReportedTotal: "98.000", cashVarianceTotal: "-2.000", currency: "JOD" },
      { cashExpectedTotal: "50.000", cashReportedTotal: "51.000", cashVarianceTotal: "1.000", currency: "USD" },
    ]);
  });
});
