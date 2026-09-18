import { randomUUID } from "node:crypto";

import type { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

export interface CompanySeedScope {
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
}

export async function seedCompanySession(
  fixture: ManagementControlPlaneTestFixture,
  scope: CompanySeedScope,
  input: {
    readonly checkedInByMembershipId?: string;
    readonly checkingInCompletedAt?: string | null;
    readonly completedAt?: string | null;
    readonly completedByMembershipId?: string | null;
    readonly createdAt: string;
    readonly parkedAt?: string | null;
    readonly parkingStartedAt?: string | null;
    readonly readyAt?: string | null;
    readonly retrievalRequestedAt?: string | null;
    readonly retrievalStartedAt?: string | null;
    readonly state?: string;
  },
): Promise<string> {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await fixture.query(
    `INSERT INTO vehicles (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, 'BE-11 vehicle', transaction_timestamp())`,
    [vehicleId, scope.organizationId],
  );
  const state = input.state ?? "PARKED";
  const completed = state === "COMPLETED";
  await fixture.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id,
        ${completed ? "completed_at," : ""}
        created_at, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 day', $3, $4, $5,
             $6, $7,
             ${completed ? "$8::timestamptz," : ""}
             ${completed ? "$9" : "$8"}::timestamptz, transaction_timestamp())`,
    [
      sessionId,
      randomUUID(),
      scope.organizationId,
      scope.locationId,
      vehicleId,
      state,
      input.checkedInByMembershipId ?? scope.membershipId,
      ...(completed ? [input.completedAt ?? input.createdAt] : []),
      input.createdAt,
    ],
  );
  await fixture.query(
    `UPDATE valet_sessions
     SET checking_in_completed_at = $2::timestamptz,
         parking_started_at = $3::timestamptz,
         parked_at = $4::timestamptz,
         retrieval_requested_at = $5::timestamptz,
         retrieval_started_at = $6::timestamptz,
         ready_at = $7::timestamptz,
         completed_at = $8::timestamptz,
         completed_by_membership_id = $9
     WHERE id = $1`,
    [
      sessionId,
      input.checkingInCompletedAt ?? null,
      input.parkingStartedAt ?? null,
      input.parkedAt ?? null,
      input.retrievalRequestedAt ?? null,
      input.retrievalStartedAt ?? null,
      input.readyAt ?? null,
      input.completedAt ?? null,
      input.completedByMembershipId ?? null,
    ],
  );
  return sessionId;
}

export async function seedCompanyRetrievalRequest(
  fixture: ManagementControlPlaneTestFixture,
  scope: CompanySeedScope,
  input: {
    readonly requestedAt: string;
    readonly sessionId: string;
    readonly status?: "OPEN" | "CANCELLED";
    readonly targetSeconds: number | null;
  },
): Promise<string> {
  await fixture.query(
    `UPDATE locations SET sla_target_seconds = $2 WHERE id = $1`,
    [scope.locationId, input.targetSeconds],
  );
  const requestId = randomUUID();
  await fixture.query(
    `INSERT INTO retrieval_requests
       (id, organization_id, valet_session_id, requested_by_type, status, requested_at)
     VALUES ($1, $2, $3, 'CUSTOMER', $4, $5::timestamptz)`,
    [
      requestId,
      scope.organizationId,
      input.sessionId,
      input.status ?? "OPEN",
      input.requestedAt,
    ],
  );
  return requestId;
}

export async function seedCompanyPayment(
  fixture: ManagementControlPlaneTestFixture,
  scope: CompanySeedScope,
  input: {
    readonly currency: string;
    readonly method?: "CASH" | "DIGITAL";
    readonly paidAt?: string;
    readonly sessionId: string;
    readonly status?: "PAID" | "UNPAID";
  },
): Promise<string> {
  const paymentId = randomUUID();
  const status = input.status ?? "PAID";
  const paid = status === "PAID";
  const method = input.method ?? "CASH";
  await fixture.query(
    `INSERT INTO payments
       (id, organization_id, location_id, valet_session_id, service_payer,
        collection_method, currency, service_amount, tip_amount, amount_due,
        amount_paid, status, creation_idempotency_key, paid_at, provider,
        provider_reference, updated_at)
     VALUES ($1, $2, $3, $4, 'CUSTOMER', $5, $6, 10.000,
             $7, 11.000, $8, $9, $10,
             $11::timestamptz, $12, $13, transaction_timestamp())`,
    [
      paymentId,
      scope.organizationId,
      scope.locationId,
      input.sessionId,
      method,
      input.currency,
      paid ? "1.000" : "0.000",
      paid ? "11.000" : "0.000",
      status,
      randomUUID(),
      paid ? input.paidAt ?? null : null,
      method === "DIGITAL" ? "MOCKPROVIDER" : null,
      method === "DIGITAL" ? randomUUID() : null,
    ],
  );
  return paymentId;
}

export async function seedCompanyCurrentValidation(
  fixture: ManagementControlPlaneTestFixture,
  scope: CompanySeedScope,
  paymentId: string,
  amount = "4.000",
): Promise<void> {
  await fixture.query(
    `INSERT INTO validations
       (id, organization_id, payment_id, mode, amount, is_current,
        applied_by_membership_id, applied_at)
     VALUES ($1, $2, $3, 'PARTIAL', $4, TRUE, $5, transaction_timestamp())`,
    [randomUUID(), scope.organizationId, paymentId, amount, scope.membershipId],
  );
}

export async function seedCompanySucceededRefund(
  fixture: ManagementControlPlaneTestFixture,
  scope: CompanySeedScope,
  input: { readonly amount: string; readonly completedAt: string; readonly paymentId: string },
): Promise<void> {
  await fixture.query(
    `INSERT INTO refunds
       (id, organization_id, payment_id, amount, reason, status,
        authorized_by_membership_id, idempotency_key, requested_at, completed_at)
     VALUES ($1, $2, $3, $4, 'BE-11 refund', 'SUCCEEDED', $5, $6,
             $7::timestamptz, $7::timestamptz)`,
    [
      randomUUID(),
      scope.organizationId,
      input.paymentId,
      input.amount,
      scope.membershipId,
      randomUUID(),
      input.completedAt,
    ],
  );
}

export async function seedCompanyIncident(
  fixture: ManagementControlPlaneTestFixture,
  scope: CompanySeedScope,
  input: {
    readonly createdAt: string;
    readonly sessionId: string;
    readonly severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    readonly type: string;
  },
): Promise<void> {
  await fixture.query(
    `INSERT INTO incidents
       (id, organization_id, location_id, valet_session_id, status, severity,
        type, description, reported_by_membership_id, created_at)
     VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, 'BE-11 incident', $7,
             $8::timestamptz)`,
    [
      randomUUID(),
      scope.organizationId,
      scope.locationId,
      input.sessionId,
      input.severity ?? "HIGH",
      input.type,
      scope.membershipId,
      input.createdAt,
    ],
  );
}
