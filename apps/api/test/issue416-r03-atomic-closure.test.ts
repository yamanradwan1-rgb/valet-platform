import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertIssue416R03AtomicClosureInTrustedTransaction,
  ISSUE416_R03_ATOMIC_CLOSURE_SQL,
  type Issue416R03AtomicClosureIdentity,
} from "../src/modules/auth/issue416-r03-atomic-closure";
import { STAFF_AUTH_DUMMY_PASSWORD_HASH } from "../src/modules/auth/staff-password-verification";
import { Issue416ResetUnavailableError } from "../src/modules/auth/issue416-password-reset-errors";

function identity(): Issue416R03AtomicClosureIdentity {
  return {
    audience: "vaylet:test",
    resetId: randomUUID(),
    generation: 2,
    targetUserId: randomUUID(),
    redeemOperationId: randomUUID(),
    redeemAuditEventId: randomUUID(),
    tokenHash: `staff-password-reset-sha256:v1:${"a".repeat(64)}`,
    newPasswordHash: STAFF_AUTH_DUMMY_PASSWORD_HASH,
  };
}

describe("Issue416 dormant R03 same-transaction atomic closure", () => {
  it("reads exact private reset, password CAS, ANONYMOUS audit and completed receipt", async () => {
    const target = identity();
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ closureOk: true }],
    });
    await expect(
      assertIssue416R03AtomicClosureInTrustedTransaction(
        { query } as never,
        target,
      ),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    const [statement, values] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toBe(ISSUE416_R03_ATOMIC_CLOSURE_SQL);
    expect(values).toEqual([
      target.resetId,
      target.targetUserId,
      target.generation,
      target.redeemOperationId,
      target.redeemAuditEventId,
      target.tokenHash,
      target.newPasswordHash,
      target.audience,
    ]);
    expect(statement).toContain("r.generation = $3::bigint");
    expect(statement).toContain("r.token_hash = $6::text");
    expect(statement).toContain("e.reset_generation = r.generation");
    expect(statement).toContain("e.token_hash = r.token_hash");
    expect(statement).toContain("e.issuer_membership_id = r.issued_by_membership_id");
    expect(statement).toContain("r.consumed_at IS NOT NULL");
    expect(statement).toContain("r.consumed_at < r.expires_at");
    expect(statement).toContain("r.revoked_at IS NULL");
    expect(statement).toContain("u.password_hash = $7::text");
    expect(statement).toContain("a.actor_type = 'ANONYMOUS'");
    expect(statement).toContain("a.actor_user_id IS NULL");
    expect(statement).toContain(
      "a.event_type = 'STAFF_PASSWORD_RESET_PASSWORD_CHANGED'",
    );
    expect(statement).toContain("receipt.purpose = 'RESET_REDEEM'");
    expect(statement).toContain("receipt.outcome = 'COMPLETED'");
    expect(statement).toContain("receipt.challenge_id = e.challenge_id");
    expect(statement).toContain("receipt.payload_digest = e.payload_digest");
    expect(statement).toContain("challenge.payload_digest = receipt.payload_digest");
    expect(statement).toContain("challenge.state_digest = receipt.state_digest");
    expect(statement).toContain("challenge.consumed_at IS NOT NULL");
    expect(statement).toContain("challenge.actor_kind = 'ANONYMOUS'");
    expect(statement).toContain("challenge.actor_session_id IS NULL");
    expect(statement).toContain("challenge.membership_id IS NULL");
  });

  it("fences every session and dependent refresh lineage, all push, siblings", () => {
    const statement = ISSUE416_R03_ATOMIC_CLOSURE_SQL;
    expect(statement).toContain("public.staff_auth_sessions s");
    expect(statement).toContain(
      "s.user_id = $2::uuid AND s.revoked_at IS NULL",
    );
    expect(statement).toContain("public.staff_refresh_credentials rc");
    expect(statement).toContain("s.id = rc.session_id");
    expect(statement).toContain(
      "s.revoked_at IS NULL AND rc.consumed_at IS NULL",
    );
    expect(statement).toContain("public.staff_push_registrations p");
    expect(statement).toContain("s.id = p.staff_auth_session_id");
    expect(statement).toContain(
      "p.state = 'ACTIVE' OR p.provider_token IS NOT NULL",
    );
    expect(statement).toContain(
      "sibling.consumed_at IS NULL AND sibling.revoked_at IS NULL",
    );
    expect(statement).toContain("sibling.id <> $1::uuid");
    // This module can inspect effects only. Never mint proof or write directly
    // as the ordinary runtime SQL role, which lacks private ledger grants.
    expect(statement).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|SET ROLE|COMMIT|BEGIN)\b/i,
    );
    expect(statement).not.toContain("vspr1.");
  });

  it.each([
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{ closureOk: false }] },
    { rowCount: 1, rows: [{ closureOk: null }] },
    { rowCount: 2, rows: [{ closureOk: true }, { closureOk: true }] },
  ])(
    "fails closed when private closure evidence is absent/incomplete %j",
    async (result) => {
      const query = vi.fn().mockResolvedValue(result);
      await expect(
        assertIssue416R03AtomicClosureInTrustedTransaction(
          { query } as never,
          identity(),
        ),
      ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    },
  );

  it("does not retry on lost SQL reply or UNKNOWN COMMIT", async () => {
    const query = vi.fn().mockRejectedValue(new Error("unknown COMMIT"));
    await expect(
      assertIssue416R03AtomicClosureInTrustedTransaction(
        { query } as never,
        identity(),
      ),
    ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { audience: " " },
    { resetId: "not-uuid" },
    { targetUserId: "not-uuid" },
    { redeemOperationId: "not-uuid" },
    { redeemAuditEventId: "not-uuid" },
    { generation: 0 },
    { generation: -1 },
    { generation: Number.MAX_SAFE_INTEGER + 1 },
    { tokenHash: "vspr1.raw" },
    { newPasswordHash: "not-an-argon2id-hash" },
  ])(
    "rejects invalid expected identity before a SQL read %j",
    async (change) => {
      const query = vi.fn();
      await expect(
        assertIssue416R03AtomicClosureInTrustedTransaction({ query } as never, {
          ...identity(),
          ...change,
        }),
      ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
      expect(query).not.toHaveBeenCalled();
    },
  );
});
