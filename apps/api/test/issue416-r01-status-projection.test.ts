import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ISSUE416_R01_SAFE_STATUS_SQL,
  readIssue416R01StatusInTrustedTransaction,
  type Issue416R01ScopedTarget,
} from "../src/modules/management/issue416-r01-status-projection";
import { Issue416ResetUnavailableError } from "../src/modules/auth/issue416-password-reset-errors";

const target: Issue416R01ScopedTarget = {
  organizationId: randomUUID(),
  targetMembershipId: randomUUID(),
  targetUserId: randomUUID(),
};

function read(row: object) {
  const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [row] });
  return { query, result: readIssue416R01StatusInTrustedTransaction({ query } as never, target) };
}

describe("Issue416 dormant private R01 status read", () => {
  it("only projects the newest scoped generation and its non-secret state", async () => {
    const { query, result } = read({
      latestGeneration: "3", linkState: "ACTIVE", expiresAt: new Date("2026-11-14T23:00:00Z"),
    });
    await expect(result).resolves.toEqual({
      eligible: true, latestGeneration: 3, linkState: "ACTIVE", expiresAt: "2026-11-14T23:00:00.000Z",
    });
    expect(query).toHaveBeenCalledWith(ISSUE416_R01_SAFE_STATUS_SQL, [
      target.organizationId, target.targetMembershipId, target.targetUserId,
    ]);
    expect(ISSUE416_R01_SAFE_STATUS_SQL).toContain("ORDER BY generation DESC");
    expect(ISSUE416_R01_SAFE_STATUS_SQL).toContain("target_membership_id = $2::uuid");
    expect(ISSUE416_R01_SAFE_STATUS_SQL).not.toContain("token_hash");
    expect(ISSUE416_R01_SAFE_STATUS_SQL).not.toContain("issuer_user_id");
  });

  it("represents never-issued status without revealing a reset token", async () => {
    await expect(read({ latestGeneration: "0", linkState: "NONE", expiresAt: null }).result)
      .resolves.toEqual({ eligible: true, latestGeneration: 0, linkState: "NONE", expiresAt: null });
  });

  it.each([
    { latestGeneration: "9007199254740993", linkState: "ACTIVE", expiresAt: new Date() },
    { latestGeneration: "-1", linkState: "ACTIVE", expiresAt: new Date() },
    { latestGeneration: "0", linkState: "ACTIVE", expiresAt: new Date() },
    { latestGeneration: "5", linkState: "ACTIVE", expiresAt: null },
    { latestGeneration: "5", linkState: "NONE", expiresAt: null },
    { latestGeneration: "5", linkState: "ACTIVE", expiresAt: "invalid" },
  ])("fails closed on invalid projected state %j", async (row) => {
    await expect(read(row).result).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
  });

  it("fails closed on private SQL query denial or missing rows", async () => {
    const query = vi.fn().mockRejectedValue(new Error("permission denied for schema"));
    await expect(readIssue416R01StatusInTrustedTransaction({ query } as never, target))
      .rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    expect(query).toHaveBeenCalledTimes(1);
    const missing = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(readIssue416R01StatusInTrustedTransaction({ query: missing } as never, target))
      .rejects.toBeInstanceOf(Issue416ResetUnavailableError);
  });

  it("denies malformed target identity before private SQL", async () => {
    const query = vi.fn();
    await expect(readIssue416R01StatusInTrustedTransaction({ query } as never, {
      ...target, organizationId: "not-uuid",
    })).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    expect(query).not.toHaveBeenCalled();
  });
});
