import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appendAccountSecurityAuditEvent } from "../src/modules/audit/account-security-audit-event-writer";
import { appendOrganizationAuditEvent } from "../src/modules/audit/organization-audit-event-writer";
import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

const context = new ShiftTestContext("MGT-BE-01 audit retry writers");
let fixture: ShiftFixture;

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  await context.setup();
  fixture = await context.createFixture();
}, 120_000);

afterAll(async () => {
  await context.teardown();
}, 60_000);

describe("MGT-BE-01 exact audit retry persistence", () => {
  it("converges an exact Organization event retry to one immutable row", async () => {
    const eventId = randomUUID();
    const occurredAt = new Date("2026-09-15T12:00:00.000Z");
    const input = {
      actor: { type: "SYSTEM" as const },
      allowedMetadataKeys: ["setting"],
      entityId: fixture.organizationId,
      entityType: "Organization",
      eventId,
      eventType: "ORGANIZATION_SETTING_CHANGED",
      metadata: { setting: "language" },
      occurredAt,
      organizationId: fixture.organizationId,
    };
    const results = await Promise.all([
      inTransaction(context.runtimePool, (client) =>
        appendOrganizationAuditEvent(client, input),
      ),
      inTransaction(context.runtimePool, (client) =>
        appendOrganizationAuditEvent(client, input),
      ),
    ]);
    expect(results).toEqual([eventId, eventId]);

    const persisted = await context.adminPool.query(
      `SELECT count(*) OVER ()::int AS count, metadata_json
       FROM audit_events WHERE id=$1`,
      [eventId],
    );
    expect(persisted.rows[0]).toEqual({
      count: 1,
      metadata_json: input.metadata,
    });
  });

  it("rejects conflicting Organization identity and rolls back its mutation", async () => {
    const eventId = randomUUID();
    const occurredAt = new Date("2026-09-15T12:01:00.000Z");
    const input = {
      actor: { type: "SYSTEM" as const },
      allowedMetadataKeys: ["setting"],
      entityId: fixture.organizationId,
      entityType: "Organization",
      eventId,
      eventType: "ORGANIZATION_SETTING_CHANGED",
      metadata: { setting: "language" },
      occurredAt,
      organizationId: fixture.organizationId,
    };
    await inTransaction(context.runtimePool, (client) =>
      appendOrganizationAuditEvent(client, input),
    );
    const before = await context.adminPool.query<{ name: string }>(
      "SELECT name FROM organizations WHERE id=$1",
      [fixture.organizationId],
    );

    await expect(
      inTransaction(context.adminPool, async (client) => {
        await client.query("UPDATE organizations SET name='must roll back' WHERE id=$1", [
          fixture.organizationId,
        ]);
        await appendOrganizationAuditEvent(client, {
          ...input,
          metadata: { setting: "timezone" },
        });
      }),
    ).rejects.toThrow("Conflicting Organization audit event identity");
    const after = await context.adminPool.query<{ name: string }>(
      "SELECT name FROM organizations WHERE id=$1",
      [fixture.organizationId],
    );
    expect(after.rows[0]?.name).toBe(before.rows[0]?.name);
  });

  it("converges exact account event-ID retries and rejects changed content", async () => {
    const eventId = randomUUID();
    const input = {
      actor: { type: "USER" as const, userId: fixture.userId },
      eventId,
      eventType: "ACCOUNT_SECURITY_TESTED",
      occurredAt: new Date("2026-09-15T12:02:00.000Z"),
      requestId: "request-1",
      subjectUserId: fixture.userId,
    };
    const [first, retry] = await Promise.all([
      inTransaction(context.runtimePool, (client) =>
        appendAccountSecurityAuditEvent(client, input),
      ),
      inTransaction(context.runtimePool, (client) =>
        appendAccountSecurityAuditEvent(client, input),
      ),
    ]);
    expect({ first, retry }).toEqual({ first: eventId, retry: eventId });
    await expect(
      inTransaction(context.runtimePool, (client) =>
        appendAccountSecurityAuditEvent(client, {
          ...input,
          requestId: "different-request",
        }),
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const persisted = await context.adminPool.query(
      `SELECT count(*) OVER ()::int AS count, actor_type::text, event_type,
              request_id, subject_user_id::text
       FROM account_security_audit_events WHERE id=$1`,
      [eventId],
    );
    expect(persisted.rows[0]).toEqual({
      actor_type: "USER",
      count: 1,
      event_type: input.eventType,
      request_id: input.requestId,
      subject_user_id: fixture.userId,
    });
  });

  it("makes an account idempotency key converge only identical content", async () => {
    const firstId = randomUUID();
    const input = {
      actor: { type: "SYSTEM" as const },
      eventType: "ACCOUNT_SECURITY_REVIEWED",
      idempotencyKey: `security-review:${randomUUID()}`,
      occurredAt: new Date("2026-09-15T12:03:00.000Z"),
      subjectUserId: fixture.userId,
    };
    const first = await inTransaction(context.runtimePool, (client) =>
      appendAccountSecurityAuditEvent(client, input, () => firstId),
    );
    const retry = await inTransaction(context.runtimePool, (client) =>
      appendAccountSecurityAuditEvent(client, input, randomUUID),
    );
    expect({ first, retry }).toEqual({ first: firstId, retry: firstId });
    await expect(
      inTransaction(context.runtimePool, (client) =>
        appendAccountSecurityAuditEvent(
          client,
          { ...input, eventType: "ACCOUNT_SECURITY_CHANGED" },
          randomUUID,
        ),
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const persisted = await context.adminPool.query(
      `SELECT count(*)::int AS count, min(id::text) AS id
       FROM account_security_audit_events WHERE idempotency_key=$1`,
      [input.idempotencyKey],
    );
    expect(persisted.rows[0]).toEqual({ count: 1, id: firstId });
  });

  it("persists normalized controlled-operator account provenance", async () => {
    const eventId = randomUUID();
    await inTransaction(context.runtimePool, (client) =>
      appendAccountSecurityAuditEvent(client, {
        actor: { operatorRef: "RECOVERY-CHANGE-004R", type: "CONTROLLED_OPERATOR" },
        eventId,
        eventType: "ACCOUNT_RECOVERY_CONTROLLED",
        occurredAt: new Date("2026-09-15T12:04:00.000Z"),
        subjectUserId: fixture.userId,
      }),
    );
    const persisted = await context.adminPool.query(
      `SELECT actor_type::text, actor_operator_ref, actor_user_id::text
       FROM account_security_audit_events WHERE id=$1`,
      [eventId],
    );
    expect(persisted.rows[0]).toEqual({
      actor_operator_ref: "RECOVERY-CHANGE-004R",
      actor_type: "CONTROLLED_OPERATOR",
      actor_user_id: null,
    });
  });
});
