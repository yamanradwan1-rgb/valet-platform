import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { appendAccountSecurityAuditEvent } from "../src/modules/audit/account-security-audit-event-writer";
import { appendOrganizationAuditEvent } from "../src/modules/audit/organization-audit-event-writer";

function transaction(
  query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
) {
  return { query } as unknown as PostgresTransaction;
}

describe("MGT-BE-01 internal audit writers", () => {
  it("writes Organization audit without fabricating a Location", async () => {
    const eventId = randomUUID();
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ id: eventId }] });
    await appendOrganizationAuditEvent(
      transaction(query),
      {
        actor: { membershipId: randomUUID(), type: "MEMBERSHIP" },
        allowedMetadataKeys: ["setting", "changed"],
        entityId: randomUUID(),
        entityType: "Organization",
        eventId,
        eventType: "ORGANIZATION_SETTING_CHANGED",
        metadata: { changed: true, setting: "example" },
        occurredAt: new Date("2026-09-15T00:00:00Z"),
        organizationId: randomUUID(),
      },
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain("NULL, NULL");
    expect(query.mock.calls[1]?.[0]).toContain("ON CONFLICT (id) DO NOTHING");
    expect(query.mock.calls[1]?.[1]?.[0]).toBe(eventId);
  });

  it("accepts exact and subset metadata allowlists", async () => {
    const query = vi.fn().mockImplementation((_sql, values) =>
      Promise.resolve({ rowCount: 1, rows: [{ id: values[0] }] }),
    );
    const write = (metadata: Record<string, string>) =>
      appendOrganizationAuditEvent(transaction(query), {
        actor: { type: "SYSTEM" },
        allowedMetadataKeys: ["changed", "setting"],
        entityId: randomUUID(),
        entityType: "Organization",
        eventType: "ORGANIZATION_SETTING_CHANGED",
        metadata,
        occurredAt: new Date(),
        organizationId: randomUUID(),
      });
    await expect(
      write({ changed: "true", setting: "language" }),
    ).resolves.toBeTypeOf("string");
    await expect(write({ setting: "language" })).resolves.toBeTypeOf(
      "string",
    );
  });

  it("rejects an unlisted metadata key before SQL", async () => {
    const query = vi.fn();
    await expect(
      appendOrganizationAuditEvent(transaction(query), {
        actor: { type: "SYSTEM" },
        allowedMetadataKeys: ["expected"],
        entityId: randomUUID(),
        entityType: "Organization",
        eventType: "ORGANIZATION_SETTING_CHANGED",
        metadata: { unexpected: "value" },
        occurredAt: new Date(),
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow("allowlist");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a prohibited metadata key even when allowlisted", async () => {
    const query = vi.fn();
    await expect(
      appendOrganizationAuditEvent(transaction(query), {
        actor: { type: "SYSTEM" },
        allowedMetadataKeys: ["totpSeed"],
        entityId: randomUUID(),
        entityType: "Organization",
        eventType: "ORGANIZATION_SETTING_CHANGED",
        metadata: { totpSeed: "never-store" },
        occurredAt: new Date(),
        organizationId: randomUUID(),
      }),
    ).rejects.toThrow("allowlist");
    expect(query).not.toHaveBeenCalled();
  });

  it("uses a caller-provided stable account event identity in the existing transaction", async () => {
    const eventId = randomUUID();
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ id: eventId }] });
    const userId = randomUUID();
    const result = await appendAccountSecurityAuditEvent(transaction(query), {
      actor: { type: "USER", userId },
      eventId,
      eventType: "ACCOUNT_SECURITY_EVENT_RECORDED",
      occurredAt: new Date("2026-09-15T00:00:00Z"),
      requestId: "request-safe-1",
      subjectUserId: userId,
    });
    expect(result).toBe(eventId);
    expect(query.mock.calls[0]?.[0]).toContain(
      "append_account_security_audit_event_exact",
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      eventId,
      userId,
      "USER",
      userId,
      null,
      "ACCOUNT_SECURITY_EVENT_RECORDED",
      "request-safe-1",
      null,
      new Date("2026-09-15T00:00:00Z"),
    ]);
  });

  it("propagates audit failure so the caller's transaction can roll back", async () => {
    const failure = new Error("audit insert failed");
    const query = vi.fn().mockRejectedValue(failure);
    await expect(
      appendAccountSecurityAuditEvent(transaction(query), {
        actor: { type: "ANONYMOUS" },
        eventType: "ACCOUNT_SECURITY_EVENT_DENIED",
        occurredAt: new Date(),
      }),
    ).rejects.toBe(failure);
  });
});
