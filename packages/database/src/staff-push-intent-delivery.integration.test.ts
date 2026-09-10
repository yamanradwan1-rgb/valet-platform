import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  StaffPushTestContext,
  type StaffPushScope,
} from "./staff-push-test-context.js";

interface PostgresError extends Error {
  code?: string;
  constraint?: string;
}

const context = new StaffPushTestContext();
let first: StaffPushScope;
let second: StaffPushScope;

async function expectDatabaseError(
  operation: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL to reject the operation.");
  } catch (error) {
    const postgresError = error as PostgresError;
    expect(postgresError.code).toBe(code);
    if (constraint !== undefined) {
      expect(postgresError.constraint).toBe(constraint);
    }
  }
}

beforeAll(async () => {
  await context.setup();
  first = await context.createScope();
  second = await context.createScope();
}, 120_000);
afterAll(() => context.teardown(), 60_000);

describe("StaffPushIntent database invariants", () => {
  it("enforces exact Organization/Location/ValetSession/Task ownership", async () => {
    await expectDatabaseError(
      context.createIntent(first, { taskId: second.taskId }),
      "23503",
      "staff_push_intents_scope_task_id_fkey",
    );
    await expectDatabaseError(
      context.createIntent(first, {
        locationId: second.locationId,
        organizationId: second.organizationId,
      }),
      "23503",
    );
  });

  it("deduplicates the one accepted kind by Task", async () => {
    const intentId = await context.createIntent(first);
    await expectDatabaseError(
      context.createIntent(first),
      "23505",
      "staff_push_intents_kind_task_id_key",
    );
    expect(intentId).toBeDefined();
  });

  it("requires a positive policy version and future expiry without defaults", async () => {
    await expectDatabaseError(
      context.createIntent(second, { expiresAt: new Date(0) }),
      "23514",
      "staff_push_intents_expiry_check",
    );
    await expectDatabaseError(
      context.client.query(
        `INSERT INTO staff_push_intents
           (id, organization_id, location_id, valet_session_id, task_id, kind,
            policy_version, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'EMPLOYEE_RETRIEVAL_REQUESTED', 0,
                 transaction_timestamp() + interval '1 minute')`,
        [
          randomUUID(),
          second.organizationId,
          second.locationId,
          second.valetSessionId,
          second.taskId,
        ],
      ),
      "23514",
      "staff_push_intents_policy_version_check",
    );
  });

  it("keeps intent trigger identity immutable", async () => {
    const intentId = await context.createIntent(second);
    await expectDatabaseError(
      context.client.query(
        `UPDATE staff_push_intents
         SET expires_at = expires_at + interval '1 minute' WHERE id = $1`,
        [intentId],
      ),
      "23514",
    );
  });
});

describe("StaffPushDelivery database invariants", () => {
  it("enforces same-Organization intent and recipient membership", async () => {
    const intent = await context.client.query<{ id: string }>(
      `SELECT id FROM staff_push_intents WHERE organization_id = $1 LIMIT 1`,
      [first.organizationId],
    );
    const intentId = intent.rows[0]!.id;
    const registrationId = await context.createRegistration(first);
    await expectDatabaseError(
      context.createDelivery(second, intentId, registrationId, {
        organizationId: first.organizationId,
      }),
      "23503",
      "staff_push_deliveries_org_recipient_membership_id_fkey",
    );
    await expectDatabaseError(
      context.createDelivery(first, intentId, registrationId, {
        organizationId: second.organizationId,
      }),
      "23503",
      "staff_push_deliveries_org_intent_id_fkey",
    );
  });

  it("creates one delivery per intent and registration", async () => {
    const registrationId = await context.createRegistration(first);
    const intent = await context.client.query<{ id: string }>(
      `SELECT id FROM staff_push_intents WHERE organization_id = $1 LIMIT 1`,
      [first.organizationId],
    );
    const intentId = intent.rows[0]!.id;
    await context.createDelivery(first, intentId, registrationId);
    await expectDatabaseError(
      context.createDelivery(first, intentId, registrationId),
      "23505",
      "staff_push_deliveries_intent_registration_key",
    );
  });

  it("rejects invalid attempt bounds and non-PENDING creation", async () => {
    const registrationId = await context.createRegistration(second);
    const intent = await context.client.query<{ id: string }>(
      `SELECT id FROM staff_push_intents WHERE organization_id = $1 LIMIT 1`,
      [second.organizationId],
    );
    await expectDatabaseError(
      context.createDelivery(second, intent.rows[0]!.id, registrationId, {
        maxAttempts: 0,
      }),
      "23514",
      "staff_push_deliveries_attempts_check",
    );
    await expectDatabaseError(
      context.client.query(
        `INSERT INTO staff_push_deliveries
           (id, organization_id, intent_id, registration_id,
            recipient_membership_id, state, max_attempts, next_attempt_at,
            terminal_at)
         VALUES ($1, $2, $3, $4, $5, 'SUPPRESSED', 1, NULL,
                 transaction_timestamp())`,
        [
          randomUUID(),
          second.organizationId,
          intent.rows[0]!.id,
          registrationId,
          second.membershipId,
        ],
      ),
      "23514",
    );
  });

  it("enforces claim increments, lease shape, fencing identity, and terminality", async () => {
    const registrationId = await context.createRegistration(first);
    const intent = await context.client.query<{ id: string }>(
      `SELECT id FROM staff_push_intents WHERE organization_id = $1 LIMIT 1`,
      [first.organizationId],
    );
    const inserted = await context.createDelivery(
      first,
      intent.rows[0]!.id,
      registrationId,
    );
    const deliveryId = inserted.rows[0]!.id as string;
    const leaseToken = randomUUID();
    await expectDatabaseError(
      context.client.query(
        `UPDATE staff_push_deliveries
         SET state = 'LEASED', next_attempt_at = NULL, lease_token = $2,
             lease_expires_at = transaction_timestamp() + interval '1 minute'
         WHERE id = $1`,
        [deliveryId, leaseToken],
      ),
      "23514",
    );
    await context.client.query(
      `UPDATE staff_push_deliveries
       SET state = 'LEASED', attempt_count = 1, next_attempt_at = NULL,
           lease_token = $2,
           lease_expires_at = transaction_timestamp() + interval '1 minute',
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [deliveryId, leaseToken],
    );
    const staleFence = await context.client.query(
      `UPDATE staff_push_deliveries
       SET state = 'SUPPRESSED', lease_token = NULL, lease_expires_at = NULL,
           terminal_at = transaction_timestamp(),
           updated_at = transaction_timestamp()
       WHERE id = $1 AND state = 'LEASED' AND lease_token = $2`,
      [deliveryId, randomUUID()],
    );
    expect(staleFence.rowCount).toBe(0);
    await expectDatabaseError(
      context.client.query(
        `UPDATE staff_push_deliveries
         SET attempt_count = 2, lease_token = $2,
             lease_expires_at = transaction_timestamp() + interval '2 minutes'
         WHERE id = $1`,
        [deliveryId, randomUUID()],
      ),
      "23514",
    );
    await context.client.query(
      `UPDATE staff_push_deliveries
       SET state = 'PROVIDER_ACCEPTED', lease_token = NULL,
           lease_expires_at = NULL, provider_result_class = 'ACCEPTED',
           provider_accepted_at = transaction_timestamp(),
           terminal_at = transaction_timestamp(),
           updated_at = transaction_timestamp()
       WHERE id = $1 AND state = 'LEASED' AND lease_token = $2`,
      [deliveryId, leaseToken],
    );
    await expectDatabaseError(
      context.client.query(
        `UPDATE staff_push_deliveries SET state = 'SUPPRESSED' WHERE id = $1`,
        [deliveryId],
      ),
      "23514",
    );
  });

  it("creates the due, lease, registration, and recipient access indexes", async () => {
    const result = await context.client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'staff_push_deliveries'`,
    );
    const names = result.rows.map((row) => row.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "staff_push_deliveries_due_idx",
        "staff_push_deliveries_lease_expiry_idx",
        "staff_push_deliveries_registration_state_idx",
        "staff_push_deliveries_recipient_state_idx",
      ]),
    );
  });
});
