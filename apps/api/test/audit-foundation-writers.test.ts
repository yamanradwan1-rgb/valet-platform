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
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const eventId = randomUUID();
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
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("VALUES ($1, $2, NULL, NULL");
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (id) DO NOTHING");
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(eventId);
  });

  it("rejects non-allowlisted and secret-bearing tenant metadata before SQL", async () => {
    const query = vi.fn();
    const write = (metadata: Record<string, string>, keys: string[]) =>
      appendOrganizationAuditEvent(transaction(query), {
        actor: { type: "SYSTEM" },
        allowedMetadataKeys: keys,
        entityId: randomUUID(),
        entityType: "Organization",
        eventType: "ORGANIZATION_SETTING_CHANGED",
        metadata,
        occurredAt: new Date(),
        organizationId: randomUUID(),
      });
    await expect(write({ unexpected: "value" }, ["expected"])).rejects.toThrow(
      "allowlist",
    );
    await expect(
      write({ totpSeed: "never-store" }, ["totpSeed"]),
    ).rejects.toThrow("allowlist");
    expect(query).not.toHaveBeenCalled();
  });

  it("uses a caller-provided stable account event identity in the existing transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const eventId = randomUUID();
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
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (id) DO NOTHING");
    expect(query.mock.calls[0]?.[1]).toEqual([
      eventId,
      userId,
      "USER",
      userId,
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
