import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertIssue416R02AtomicClosureInTrustedTransaction,
  ISSUE416_R02_ATOMIC_CLOSURE_SQL,
  type Issue416R02KnownIssueIdentity,
} from "../src/modules/management/issue416-r02-atomic-closure";
import { Issue416ResetUnavailableError } from "../src/modules/auth/issue416-password-reset-errors";

function identity(): Issue416R02KnownIssueIdentity {
  return {
    audience: "vaylet:test",
    operationId: randomUUID(),
    resetId: randomUUID(),
    organizationId: randomUUID(),
    targetMembershipId: randomUUID(),
    targetUserId: randomUUID(),
    issuerMembershipId: randomUUID(),
    issuerUserId: randomUUID(),
    expectedGeneration: 0,
    issueAuditEventId: randomUUID(),
    tokenHash: `staff-password-reset-sha256:v1:${"a".repeat(64)}`,
    requestFingerprintHex: "b".repeat(64),
  };
}

describe("Issue416 dormant R02 protected issue post-write CAS closure", () => {
  it("checks exact operation/issuer/target/generation and four private R02 quotas", async () => {
    const input = identity();
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ closureOk: true }] });
    await expect(
      assertIssue416R02AtomicClosureInTrustedTransaction(
        { query } as never,
        input,
      ),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    const [statement, params] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toBe(ISSUE416_R02_ATOMIC_CLOSURE_SQL);
    expect(params).toEqual([
      input.audience,
      input.operationId,
      input.resetId,
      input.organizationId,
      input.targetMembershipId,
      input.targetUserId,
      input.issuerMembershipId,
      input.issuerUserId,
      1,
      input.issueAuditEventId,
      input.tokenHash,
      input.requestFingerprintHex,
    ]);
    expect(statement).toContain("r.generation = $9::bigint");
    expect(statement).toContain("r.request_fingerprint = pg_catalog.decode");
    expect(statement).toContain(
      "quota.request_fingerprint = r.request_fingerprint",
    );
    expect(statement).toContain(
      "e.request_fingerprint = r.request_fingerprint",
    );
    expect(statement).toContain(
      "challenge.payload_digest = receipt.payload_digest",
    );
    expect(statement).toContain(
      "challenge.organization_id = r.organization_id",
    );
    expect(statement).toContain("receipt.purpose = 'RESET_ISSUE'");
    expect(statement).toContain("receipt.outcome = 'COMPLETED'");
    expect(statement).toContain("challenge.consumed_at IS NOT NULL");
    expect(statement).toContain("challenge.actor_kind = 'STAFF'");
    expect(statement).toContain("audit.actor_type = 'USER'");
    expect(statement).toContain("audit.actor_user_id = r.issuer_user_id");
    expect(statement).toContain("audit.subject_user_id = r.target_user_id");
    expect(statement).toContain("entry.state IN ('PENDING','COUNTED')");
    expect(statement).toContain(") = 4");
    expect(statement).toContain("sibling.consumed_at IS NULL");
    expect(statement).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|COMMIT|SET ROLE)\b/i,
    );
    expect(statement).not.toContain("anti_abuse_events");
    expect(statement).not.toContain("vspr1.");
  });

  it.each([
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{ closureOk: false }] },
    { rowCount: 1, rows: [{ closureOk: null }] },
    { rowCount: 2, rows: [{ closureOk: true }, { closureOk: true }] },
  ])(
    "fails when signed proof, audit, quota or generation proof missing %j",
    async (result) => {
      const query = vi.fn().mockResolvedValue(result);
      await expect(
        assertIssue416R02AtomicClosureInTrustedTransaction(
          { query } as never,
          identity(),
        ),
      ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    },
  );

  it.each([
    { audience: "" },
    { operationId: "not-uuid" },
    { resetId: "not-uuid" },
    { organizationId: "not-uuid" },
    { issuerMembershipId: "not-uuid" },
    { targetUserId: "not-uuid" },
    { targetMembershipId: "not-uuid" },
    { issuerUserId: "not-uuid" },
    { issueAuditEventId: "not-uuid" },
    { expectedGeneration: -1 },
    { expectedGeneration: Number.MAX_SAFE_INTEGER },
    { tokenHash: "vspr1.secret" },
    { requestFingerprintHex: "nothex" },
  ])("rejects invalid identity/CAS before any SQL read %j", async (change) => {
    const query = vi.fn();
    await expect(
      assertIssue416R02AtomicClosureInTrustedTransaction({ query } as never, {
        ...identity(),
        ...change,
      }),
    ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    expect(query).not.toHaveBeenCalled();
  });

  it("never retries a potentially committed unknown database result", async () => {
    const query = vi.fn().mockRejectedValue(new Error("lost COMMIT ack"));
    await expect(
      assertIssue416R02AtomicClosureInTrustedTransaction(
        { query } as never,
        identity(),
      ),
    ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
