import { randomUUID } from "node:crypto";

import type {
  DashboardOverviewTestContext,
} from "./dashboard-overview-test-context";

export interface AnalyticsSeedFixture {
  readonly locationId: string;
  readonly organizationId: string;
}

async function base(
  context: DashboardOverviewTestContext,
): Promise<AnalyticsSeedFixture & { membershipId: string }> {
  const fixture = await context.managerFixture();
  return {
    locationId: fixture.locationId,
    membershipId: fixture.membershipId,
    organizationId: fixture.organizationId,
  };
}

export async function analyticsSeedSession(
  context: DashboardOverviewTestContext,
  input: {
    state?: string;
    createdAtIso?: string;
    checkingInCompletedAtIso?: string | null;
    completedAtIso?: string | null;
    parkingStartedAtIso?: string | null;
    parkedAtIso?: string | null;
    readyAtIso?: string | null;
    retrievalRequestedAtIso?: string | null;
    retrievalStartedAtIso?: string | null;
  },
): Promise<string> {
  const ids = await base(context);
  const sessionId = randomUUID();
  const vehicleId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO vehicles (id, organization_id, temporary_descriptor,
        updated_at)
     VALUES ($1, $2, 'Analytics vehicle', transaction_timestamp())`,
    [vehicleId, ids.organizationId],
  );
  const isCompleted = (input.state ?? "PARKED") === "COMPLETED";
  const completedColumn = isCompleted ? "completed_at," : "";
  const completedValue = isCompleted
    ? "COALESCE($8::timestamptz, transaction_timestamp()),"
    : "";
  const createdAtParam = isCompleted ? "$9" : "$8";
  await context.adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id,
        ${completedColumn}
        created_at, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 day', $3, $4, $5,
             $6, $7,
             ${completedValue}
             COALESCE(${createdAtParam}::timestamptz, transaction_timestamp()),
             transaction_timestamp())`,
    [
      sessionId,
      randomUUID(),
      ids.organizationId,
      ids.locationId,
      vehicleId,
      input.state ?? "PARKED",
      ids.membershipId,
      ...(isCompleted ? [input.completedAtIso ?? null] : []),
      input.createdAtIso ?? null,
    ],
  );
  await context.adminPool.query(
    `UPDATE valet_sessions SET
        checking_in_completed_at = $2::timestamptz,
        parking_started_at = $3::timestamptz,
        parked_at = $4::timestamptz,
        retrieval_requested_at = $5::timestamptz,
        retrieval_started_at = $6::timestamptz,
        ready_at = $7::timestamptz,
        completed_at = $8::timestamptz
     WHERE id = $1`,
    [
      sessionId,
      input.checkingInCompletedAtIso ?? null,
      input.parkingStartedAtIso ?? null,
      input.parkedAtIso ?? null,
      input.retrievalRequestedAtIso ?? null,
      input.retrievalStartedAtIso ?? null,
      input.readyAtIso ?? null,
      input.completedAtIso ?? null,
    ],
  );
  return sessionId;
}

export async function analyticsSeedPayment(
  context: DashboardOverviewTestContext,
  input: {
    currency: "JOD" | "USD";
    method?: "CASH" | "DIGITAL";
    paidAtIso?: string;
    sessionId: string;
    status?: "PAID" | "UNPAID";
  },
): Promise<string> {
  const ids = await base(context);
  const paymentId = randomUUID();
  const paid = input.status ?? "PAID";
  const amountPaid = paid === "PAID" ? "11.000" : "0.000";
  const tipAmount = paid === "PAID" ? "1.000" : "0.000";
  await context.adminPool.query(
    `INSERT INTO payments (id, organization_id, location_id,
        valet_session_id, service_payer, collection_method, currency,
        service_amount, tip_amount, amount_due, amount_paid, status,
        creation_idempotency_key, paid_at, provider, provider_reference,
        updated_at)
     VALUES ($1, $2, $3, $4, 'CUSTOMER', $5, $6, 10.000, $7, 11.000,
             $8, $9, $10, $11::timestamptz, $12, $13,
             transaction_timestamp())`,
    [
      paymentId,
      ids.organizationId,
      ids.locationId,
      input.sessionId,
      input.method ?? "CASH",
      input.currency,
      tipAmount,
      amountPaid,
      paid,
      randomUUID(),
      input.paidAtIso ?? null,
      input.method === "DIGITAL" ? "MOCKPROVIDER" : null,
      input.method === "DIGITAL" ? randomUUID() : null,
    ],
  );
  return paymentId;
}

export async function analyticsSeedValidationPair(
  context: DashboardOverviewTestContext,
  input: { paymentId: string },
): Promise<void> {
  const ids = await base(context);
  const supersededId = randomUUID();
  const currentId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO validations (id, organization_id, payment_id, mode, amount,
        is_current, applied_by_membership_id, applied_at)
     VALUES ($1, $2, $3, 'FULL', 9.000, TRUE, $4, transaction_timestamp())`,
    [supersededId, ids.organizationId, input.paymentId, ids.membershipId],
  );
  await context.adminPool.query(
    `INSERT INTO validations (id, organization_id, payment_id, mode, amount,
        is_current, supersedes_validation_id, applied_by_membership_id,
        applied_at)
     VALUES ($1, $2, $3, 'PARTIAL', 4.000, FALSE, $4, $5,
             transaction_timestamp())`,
    [currentId, ids.organizationId, input.paymentId, supersededId, ids.membershipId],
  );
  await context.adminPool.query(
    `UPDATE validations SET is_current = (id = $2)
     WHERE id IN ($1, $2)`,
    [supersededId, currentId],
  );
}

export async function analyticsSeedRefund(
  context: DashboardOverviewTestContext,
  input: {
    amount: string;
    completedAtIso?: string;
    paymentId: string;
    status: "SUCCEEDED" | "PENDING";
  },
): Promise<string> {
  const ids = await base(context);
  const refundId = randomUUID();
  if (input.status === "SUCCEEDED") {
    await context.adminPool.query(
      `INSERT INTO refunds (id, organization_id, payment_id, amount, reason,
          status, authorized_by_membership_id, idempotency_key, requested_at,
          completed_at)
       VALUES ($1, $2, $3, $4, 'Analytics refund', 'SUCCEEDED', $5, $6,
               transaction_timestamp(),
               COALESCE($7::timestamptz, transaction_timestamp()))`,
      [
        refundId,
        ids.organizationId,
        input.paymentId,
        input.amount,
        ids.membershipId,
        randomUUID(),
        input.completedAtIso ?? null,
      ],
    );
  } else {
    await context.adminPool.query(
      `INSERT INTO refunds (id, organization_id, payment_id, amount, reason,
          status, authorized_by_membership_id, idempotency_key, provider,
          provider_reference, requested_at)
       VALUES ($1, $2, $3, $4, 'Analytics refund', 'PENDING', $5, $6,
               'MOCKPROVIDER', $7, transaction_timestamp())`,
      [
        refundId,
        ids.organizationId,
        input.paymentId,
        input.amount,
        ids.membershipId,
        randomUUID(),
        randomUUID(),
      ],
    );
  }
  return refundId;
}

export async function analyticsSeedCashShift(
  context: DashboardOverviewTestContext,
  input: { endedAtIso: string },
): Promise<void> {
  const ids = await base(context);
  await context.adminPool.query(
    `INSERT INTO shifts (id, organization_id, location_id, membership_id,
        status, started_at, ended_at, cash_expected, cash_reported,
        cash_variance, cash_currency, cash_reported_at,
        cash_reported_by_membership_id)
     VALUES ($1, $2, $3, $4, 'ENDED',
             $5::timestamptz - interval '8 hours', $5::timestamptz,
             100.000, 98.000, -2.000, 'USD', $5::timestamptz, $4)`,
    [
      randomUUID(),
      ids.organizationId,
      ids.locationId,
      ids.membershipId,
      input.endedAtIso,
    ],
  );
}

export async function analyticsSeedIncident(
  context: DashboardOverviewTestContext,
  input: {
    createdAtIso?: string;
    severity?: "LOW" | "HIGH";
    type?: string;
  },
): Promise<string> {
  const ids = await base(context);
  const sessionId = await analyticsSeedSession(context, { state: "PARKED" });
  const incidentId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO incidents (id, organization_id, location_id,
        valet_session_id, status, severity, type, description,
        reported_by_membership_id, created_at)
     VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, 'Analytics incident', $7,
             COALESCE($8::timestamptz, transaction_timestamp()))`,
    [
      incidentId,
      ids.organizationId,
      ids.locationId,
      sessionId,
      input.severity ?? "HIGH",
      input.type ?? "KEY",
      ids.membershipId,
      input.createdAtIso ?? null,
    ],
  );
  return incidentId;
}
