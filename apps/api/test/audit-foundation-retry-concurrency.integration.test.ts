import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { appendAccountSecurityAuditEvent } from "../src/modules/audit/account-security-audit-writer";
import { appendOrganizationAuditEvent } from "../src/modules/audit/organization-audit-writer";
import { ShiftTestContext, type ShiftFixture } from "./shift-test-context";

const context = new ShiftTestContext("audit_foundation_retry_concurrency");
let fixture: ShiftFixture;

beforeAll(async () => {
  await context.setup();
  fixture = await context.createFixture({ role: "ORG_ADMIN" });
}, 120_000);

afterAll(() => context.teardown(), 60_000);

function writeOrganization(input: {
  eventId: string;
  eventType: string;
  entityId: string;
  occurredAt: Date;
}) {
  return inPostgresTransaction(context.runtimePool, (transaction) =>
    appendOrganizationAuditEvent(transaction, {
      actor: { type: "SYSTEM" },
      allowedMetadataKeys: ["reason"],
      entityId: input.entityId,
      entityType: "Organization",
      eventId: input.eventId,
      eventType: input.eventType,
      metadata: { reason: "concurrency-proof" },
      occurredAt: input.occurredAt,
      organizationId: fixture.organizationId,
    }),
  );
}

function writeAccount(input: {
  eventId: string;
  eventType: string;
  occurredAt: Date;
}) {
  return inPostgresTransaction(context.runtimePool, (transaction) =>
    appendAccountSecurityAuditEvent(transaction, {
      actor: { type: "SYSTEM" },
      eventId: input.eventId,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      subjectUserId: fixture.userId,
    }),
  );
}

function expectOneSuccessOneConflict(
  results: PromiseSettledResult<string>[],
): void {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected).toMatchObject({
    reason: { code: "AUDIT_EVENT_IDENTITY_CONFLICT" },
    status: "rejected",
  });
}

describe("MGT-BE-01 stable audit identity concurrency", () => {
  it("converges concurrent exact Organization-wide retries to one row", async () => {
    const input = {
      entityId: randomUUID(),
      eventId: randomUUID(),
      eventType: "ORGANIZATION_CONCURRENT_RETRY",
      occurredAt: new Date("2026-09-16T00:10:00.123Z"),
    };
    await expect(
      Promise.all([writeOrganization(input), writeOrganization(input)]),
    ).resolves.toEqual([input.eventId, input.eventId]);
    const count = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM audit_events WHERE id = $1`,
      [input.eventId],
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("fails one concurrent Organization-wide conflicting reuse", async () => {
    const input = {
      entityId: randomUUID(),
      eventId: randomUUID(),
      occurredAt: new Date("2026-09-16T00:11:00.123Z"),
    };
    const results = await Promise.allSettled([
      writeOrganization({ ...input, eventType: "ORGANIZATION_CONFLICT_A" }),
      writeOrganization({ ...input, eventType: "ORGANIZATION_CONFLICT_B" }),
    ]);
    expectOneSuccessOneConflict(results);
  });

  it("converges concurrent exact account-security retries to one row", async () => {
    const input = {
      eventId: randomUUID(),
      eventType: "ACCOUNT_SECURITY_CONCURRENT_RETRY",
      occurredAt: new Date("2026-09-16T00:12:00.123Z"),
    };
    await expect(Promise.all([writeAccount(input), writeAccount(input)])).resolves.toEqual([
      input.eventId,
      input.eventId,
    ]);
    const count = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM account_security_audit_events WHERE id = $1`,
      [input.eventId],
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  it("fails one concurrent account-security conflicting reuse", async () => {
    const input = {
      eventId: randomUUID(),
      occurredAt: new Date("2026-09-16T00:13:00.123Z"),
    };
    const results = await Promise.allSettled([
      writeAccount({ ...input, eventType: "ACCOUNT_SECURITY_CONFLICT_A" }),
      writeAccount({ ...input, eventType: "ACCOUNT_SECURITY_CONFLICT_B" }),
    ]);
    expectOneSuccessOneConflict(results);
  });
});
