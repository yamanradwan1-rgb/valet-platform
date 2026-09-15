import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  appendAccountSecurityAuditEvent,
  appendControlledOperatorAccountSecurityAuditEvent,
  type AccountSecurityAuditEventInput,
  type ControlledOperatorAccountSecurityAuditEventInput,
} from "../src/modules/audit/account-security-audit-writer";
import {
  appendOrganizationAuditEvent,
  type OrganizationAuditEventInput,
} from "../src/modules/audit/organization-audit-writer";
import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

const context = new ShiftTestContext("audit_foundation_writers");
let fixture: ShiftFixture;

beforeAll(async () => {
  await context.setup();
  fixture = await context.createFixture({ role: "ORG_ADMIN" });
}, 120_000);

afterAll(() => context.teardown(), 60_000);

function organizationInput(
  overrides: Partial<OrganizationAuditEventInput> = {},
): OrganizationAuditEventInput {
  return {
    actor: { type: "SYSTEM" },
    allowedMetadataKeys: ["reason", "enabled"],
    entityId: randomUUID(),
    entityType: "Organization",
    eventId: randomUUID(),
    eventType: "ORGANIZATION_AUDIT_TEST",
    metadata: { enabled: true, reason: "management-test" },
    occurredAt: new Date("2026-09-16T00:00:00.123Z"),
    organizationId: fixture.organizationId,
    ...overrides,
  };
}

function accountInput(
  overrides: Partial<AccountSecurityAuditEventInput> = {},
): AccountSecurityAuditEventInput {
  return {
    actor: { type: "SYSTEM" },
    eventId: randomUUID(),
    eventType: "ACCOUNT_SECURITY_TEST",
    occurredAt: new Date("2026-09-16T00:01:00.456Z"),
    subjectUserId: fixture.userId,
    ...overrides,
  };
}

async function writeOrganization(input: OrganizationAuditEventInput) {
  return inPostgresTransaction(context.runtimePool, (transaction) =>
    appendOrganizationAuditEvent(transaction, input),
  );
}

async function writeAccount(input: AccountSecurityAuditEventInput) {
  return inPostgresTransaction(context.runtimePool, (transaction) =>
    appendAccountSecurityAuditEvent(transaction, input),
  );
}

async function writeControlledAccount(
  input: ControlledOperatorAccountSecurityAuditEventInput,
) {
  return inPostgresTransaction(context.adminPool, (transaction) =>
    appendControlledOperatorAccountSecurityAuditEvent(transaction, input),
  );
}

describe("MGT-BE-01 organization audit writer", () => {
  it("stores exact allowlisted metadata and an allowlisted subset", async () => {
    const exact = organizationInput();
    const subset = organizationInput({ metadata: { reason: "subset" } });
    await writeOrganization(exact);
    await writeOrganization(subset);

    const rows = await context.adminPool.query(
      `SELECT id::text, location_id::text, valet_session_id::text,
              actor_type::text, metadata_json
       FROM audit_events WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[exact.eventId, subset.eventId]],
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_type: "SYSTEM",
          id: exact.eventId,
          location_id: null,
          metadata_json: exact.metadata,
          valet_session_id: null,
        }),
        expect.objectContaining({
          actor_type: "SYSTEM",
          id: subset.eventId,
          location_id: null,
          metadata_json: subset.metadata,
          valet_session_id: null,
        }),
      ]),
    );
  });

  it.each([
    [
      "forbidden allowlist key",
      { allowedMetadataKeys: ["requestBody"], metadata: {} },
    ],
    [
      "unlisted key",
      { allowedMetadataKeys: ["reason"], metadata: { extra: "x" } },
    ],
    [
      "secret key",
      { allowedMetadataKeys: ["password"], metadata: { password: "x" } },
    ],
    ["raw contact key", { allowedMetadataKeys: ["email"], metadata: {} }],
    ["raw GPS key", { allowedMetadataKeys: ["latitude"], metadata: {} }],
    ["oversized value", { metadata: { reason: "x".repeat(501) } }],
    ["control character", { metadata: { reason: "line\nbreak" } }],
    ["positive infinity", { metadata: { enabled: Number.POSITIVE_INFINITY } }],
    ["NaN", { metadata: { enabled: Number.NaN } }],
    ["object value", { metadata: { reason: { nested: true } } }],
    ["array value", { metadata: { reason: ["nested"] } }],
  ] as const)("rejects %s before storage", async (_name, overrides) => {
    const input = organizationInput(
      overrides as Partial<OrganizationAuditEventInput>,
    );
    await expect(writeOrganization(input)).rejects.toMatchObject({
      code: "UNSAFE_AUDIT_EVENT",
    });
    const stored = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_events WHERE id = $1`,
      [input.eventId],
    );
    expect(stored.rows[0]?.count).toBe(0);
  });

  it("deduplicates an exact stable-id retry to one row", async () => {
    const input = organizationInput();
    await writeOrganization(input);
    await expect(writeOrganization(input)).resolves.toBe(input.eventId);
    const stored = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_events WHERE id = $1`,
      [input.eventId],
    );
    expect(stored.rows[0]?.count).toBe(1);
  });

  it("rejects stable-id reuse with different facts", async () => {
    const input = organizationInput();
    await writeOrganization(input);
    await expect(
      writeOrganization({ ...input, metadata: { reason: "different" } }),
    ).rejects.toMatchObject({ code: "AUDIT_EVENT_IDENTITY_CONFLICT" });
  });

  it("rolls back a sibling mutation when audit identity conflicts", async () => {
    const input = organizationInput();
    await writeOrganization(input);
    const customerId = randomUUID();
    await expect(
      inPostgresTransaction(context.runtimePool, async (transaction) => {
        await transaction.query(
          `INSERT INTO customers
             (id, organization_id, phone_normalized, updated_at)
           VALUES ($1, $2, '+962799999999', transaction_timestamp())`,
          [customerId, fixture.organizationId],
        );
        await appendOrganizationAuditEvent(transaction, {
          ...input,
          eventType: "ORGANIZATION_AUDIT_CHANGED",
        });
      }),
    ).rejects.toMatchObject({ code: "AUDIT_EVENT_IDENTITY_CONFLICT" });
    const customer = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM customers WHERE id = $1`,
      [customerId],
    );
    expect(customer.rows[0]?.count).toBe(0);
  });
});

describe("MGT-BE-01 account-security audit writer", () => {
  it("participates in the caller's existing transaction", async () => {
    const input = accountInput();
    const transaction = await context.runtimePool.connect();
    try {
      await transaction.query("BEGIN");
      await appendAccountSecurityAuditEvent(transaction, input);
      await transaction.query("ROLLBACK");
    } finally {
      transaction.release();
    }
    const stored = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM account_security_audit_events WHERE id = $1`,
      [input.eventId],
    );
    expect(stored.rows[0]?.count).toBe(0);
  });

  it("persists USER, SYSTEM, ANONYMOUS and controlled-operator provenance", async () => {
    const inputs = [
      accountInput({ actor: { type: "USER", userId: fixture.userId } }),
      accountInput({ actor: { type: "SYSTEM" }, subjectUserId: null }),
      accountInput({ actor: { type: "ANONYMOUS" }, subjectUserId: null }),
    ];
    for (const input of inputs) await writeAccount(input);
    const controlled: ControlledOperatorAccountSecurityAuditEventInput = {
      ...accountInput(),
      actor: { type: "CONTROLLED_OPERATOR", operatorRef: "CHANGE-79" },
    };
    await writeControlledAccount(controlled);

    const rows = await context.adminPool.query(
      `SELECT id::text, actor_type::text, actor_user_id::text,
              controlled_operator_ref
       FROM account_security_audit_events WHERE id = ANY($1::uuid[])`,
      [[...inputs.map((input) => input.eventId), controlled.eventId]],
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_type: "USER",
          actor_user_id: fixture.userId,
        }),
        expect.objectContaining({ actor_type: "SYSTEM", actor_user_id: null }),
        expect.objectContaining({
          actor_type: "ANONYMOUS",
          actor_user_id: null,
        }),
        expect.objectContaining({
          actor_type: "CONTROLLED_OPERATOR",
          actor_user_id: null,
          controlled_operator_ref: "CHANGE-79",
        }),
      ]),
    );
  });

  it("denies controlled-operator provenance through the runtime boundary", async () => {
    const eventId = randomUUID();
    await expect(
      context.runtimePool.query(
        `SELECT append_account_security_audit_event(
           $1::uuid, 'ACCOUNT_SECURITY_TEST', $2::uuid,
           'CONTROLLED_OPERATOR'::account_security_actor_type,
           NULL::uuid, 'CHANGE-RUNTIME', $3::timestamptz
         )`,
        [eventId, fixture.userId, new Date("2026-09-16T00:02:00.000Z")],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const stored = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM account_security_audit_events WHERE id = $1`,
      [eventId],
    );
    expect(stored.rows[0]?.count).toBe(0);
  });

  it("deduplicates exact retry and rejects conflicting stable-id reuse", async () => {
    const input = accountInput();
    await writeAccount(input);
    await expect(writeAccount(input)).resolves.toBe(input.eventId);
    await expect(
      writeAccount({ ...input, eventType: "ACCOUNT_SECURITY_CHANGED" }),
    ).rejects.toMatchObject({ code: "AUDIT_EVENT_IDENTITY_CONFLICT" });
    const stored = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM account_security_audit_events WHERE id = $1`,
      [input.eventId],
    );
    expect(stored.rows[0]?.count).toBe(1);
  });

  it("exposes no metadata payload in the account-security writer input", () => {
    type HasMetadata = "metadata" extends keyof AccountSecurityAuditEventInput
      ? true
      : false;
    const hasMetadata: HasMetadata = false;
    expect(hasMetadata).toBe(false);
  });
});
