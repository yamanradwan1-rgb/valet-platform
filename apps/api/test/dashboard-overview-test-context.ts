import { createHash, randomUUID } from "node:crypto";

import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";

import type { ShiftFixture } from "./shift-test-context";
import { DashboardTestContext } from "./dashboard-test-context";

export class DashboardOverviewTestContext extends DashboardTestContext {
  private baseFixtureValue?: ShiftFixture;

  constructor(label: string) {
    super(`overview_${label}`);
  }

  async managerFixture(): Promise<ShiftFixture> {
    if (this.baseFixtureValue === undefined) {
      this.baseFixtureValue = await this.createFixture({
        role: "LOCATION_MANAGER",
      });
    }
    return this.baseFixtureValue;
  }

  async staffSessionContext(userId: string): Promise<StaffSessionContext> {
    const sessionId = randomUUID();
    const accessTokenHash = `staff-access-sha256:v1:${createHash("sha256")
      .update(randomUUID())
      .digest("hex")}`;
    const inserted = await this.adminPool.query<{ readonly created_at: Date }>(
      `WITH decision AS (SELECT clock_timestamp() AS now)
       INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, created_at, last_rotated_at)
       SELECT $1, $2, $3, decision.now + interval '15 minutes',
              decision.now + interval '30 days', decision.now, decision.now
       FROM decision
       RETURNING created_at`,
      [sessionId, userId, accessTokenHash],
    );
    const createdAt = inserted.rows[0]?.created_at;
    if (createdAt === undefined)
      throw new Error("Staff test session was not created.");
    return {
      accessTokenHash,
      createdAt,
      staffAuthSessionId: sessionId,
      userId,
    };
  }

  private baseFixture(): ShiftFixture {
    if (this.baseFixtureValue === undefined) {
      throw new Error("Call managerFixture() before seeding.");
    }
    return this.baseFixtureValue;
  }

  async seedSession(input: {
    keySlotId?: string;
    parkingZoneId?: string;
    parkingSpotId?: string;
    currentAssigneeMembershipId?: string;
    createdAtIso?: string;
    state: string;
  }): Promise<string> {
    const base = await this.baseFixture();
    const sessionId = randomUUID();
    const vehicleId = randomUUID();
    const plate = randomUUID().slice(0, 8);
    await this.adminPool.query(
      `INSERT INTO vehicles (id, organization_id, plate_country,
          plate_number_raw, plate_number_normalized, temporary_descriptor,
          updated_at)
       VALUES ($1, $2, 'JO', $3, $3, NULL, transaction_timestamp())`,
      [vehicleId, base.organizationId, plate],
    );
    const completedColumn =
      input.state === "COMPLETED" ? "completed_at," : "";
    const completedPlaceholder =
      input.state === "COMPLETED" ? "transaction_timestamp()," : "";
    await this.adminPool.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id,
          key_slot_id, parking_zone_id, parking_spot_id,
          current_assignee_membership_id, created_at,
          ${completedColumn} updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 day', $3, $4,
               $5, $6, $7,
               $8, $9, $10, $11,
               COALESCE($12::timestamptz, transaction_timestamp()),
               ${completedPlaceholder} transaction_timestamp())`,
      [sessionId, randomUUID(), base.organizationId, base.locationId,
        vehicleId, input.state, base.membershipId, input.keySlotId ?? null,
        input.parkingZoneId ?? null, input.parkingSpotId ?? null,
        input.currentAssigneeMembershipId ?? null, input.createdAtIso ?? null],
    );
    return sessionId;
  }

  async seedRetrievalRequest(input: {
    requestedAgoMinutes: number;
    sessionId: string;
    status: "OPEN" | "ACCEPTED";
  }): Promise<string> {
    const base = await this.baseFixture();
    const requestId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO retrieval_requests
         (id, organization_id, valet_session_id, requested_by_type, status,
          requested_at)
       VALUES ($1, $2, $3, 'CUSTOMER', $4,
               transaction_timestamp() - ($5::text || ' minutes')::interval)`,
      [
        requestId,
        base.organizationId,
        input.sessionId,
        input.status,
        String(input.requestedAgoMinutes),
      ],
    );
    return requestId;
  }

  async seedTask(input: {
    assigneeMembershipId?: string | null;
    sessionId: string;
    status: string;
    taskType: "PARKING" | "RETRIEVAL";
  }): Promise<string> {
    const base = await this.baseFixture();
    const taskId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO tasks (id, organization_id, location_id,
          valet_session_id, task_type, status,
          current_assignee_membership_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, transaction_timestamp())`,
      [
        taskId,
        base.organizationId,
        base.locationId,
        input.sessionId,
        input.taskType,
        input.status,
        input.assigneeMembershipId ?? null,
      ],
    );
    return taskId;
  }

  async seedKeySlot(code: string): Promise<string> {
    const base = await this.baseFixture();
    const slotId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO key_slots (id, organization_id, location_id, code, status,
          updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [slotId, base.organizationId, base.locationId, code],
    );
    return slotId;
  }

  async seedIncident(input: {
    sessionId: string;
    status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
    reporterMembershipId?: string;
  }): Promise<string> {
    const base = await this.baseFixture();
    const incidentId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO incidents (id, organization_id, location_id,
          valet_session_id, status, severity, type, description,
          reported_by_membership_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'HIGH', 'KEY_MISSING', 'Details', $6,
               transaction_timestamp())`,
      [
        incidentId,
        base.organizationId,
        base.locationId,
        input.sessionId,
        input.status,
        input.reporterMembershipId ?? base.membershipId,
      ],
    );
    return incidentId;
  }

  async seedPayment(input: {
    currency: "JOD" | "USD";
    sessionId: string;
    status?:
      | "NOT_REQUIRED"
      | "UNPAID"
      | "PENDING"
      | "PAID"
      | "FAILED";
  }): Promise<string> {
    const base = await this.baseFixture();
    const paymentId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO payments (id, organization_id, location_id,
          valet_session_id, service_payer, collection_method, currency,
          service_amount, tip_amount, amount_due, amount_paid, status,
          creation_idempotency_key, paid_at, updated_at)
       VALUES ($1, $2, $3, $4, 'CUSTOMER', 'CASH', $5, 10.000, 1.000,
               11.000, 11.000, $6, $7, transaction_timestamp(),
               transaction_timestamp())`,
      [
        paymentId,
        base.organizationId,
        base.locationId,
        input.sessionId,
        input.currency,
        input.status ?? "PAID",
        randomUUID(),
      ],
    );
    return paymentId;
  }

  async seedSucceededRefund(input: {
    amount: string;
    paymentId: string;
  }): Promise<void> {
    const base = await this.baseFixture();
    await this.adminPool.query(
      `INSERT INTO refunds (id, organization_id, payment_id, amount, reason,
          status, authorized_by_membership_id, idempotency_key,
          requested_at, completed_at)
       VALUES ($1, $2, $3, $4, 'Service correction', 'SUCCEEDED', $5, $6,
               transaction_timestamp(), transaction_timestamp())`,
      [
        randomUUID(),
        base.organizationId,
        input.paymentId,
        input.amount,
        base.membershipId,
        randomUUID(),
      ],
    );
  }

  async seedCurrentValidation(input: {
    amount: string;
    paymentId: string;
  }): Promise<void> {
    const base = await this.baseFixture();
    await this.adminPool.query(
      `INSERT INTO validations (id, organization_id, payment_id, mode,
          amount, is_current, applied_by_membership_id, applied_at)
       VALUES ($1, $2, $3, 'FULL', $4, TRUE, $5, transaction_timestamp())`,
      [
        randomUUID(),
        base.organizationId,
        input.paymentId,
        input.amount,
        base.membershipId,
      ],
    );
  }
}
