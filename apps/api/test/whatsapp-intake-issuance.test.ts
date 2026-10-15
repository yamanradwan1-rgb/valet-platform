import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { SealedOutboundEnvelope } from "../src/modules/notifications/contracts/outbound-envelope";
import type { OutboundMessageIntent } from "../src/modules/notifications/contracts/outbound-intent";
import { persistInitialGuestOutbox } from "../src/modules/notifications/issuance/initial-guest-outbox";
import {
  issueInitialGuestAccessInTransaction,
  type EligibleInitialGuestRecipient,
  type InitialGuestScope,
} from "../src/modules/valet-sessions/initial-guest-issuance";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-token";
import { describe, expect, it, vi } from "vitest";

const scope: InitialGuestScope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
  customerId: "44444444-4444-4444-8444-444444444444",
  actorMembershipId: "55555555-5555-4555-8555-555555555555",
};
const issuedAt = new Date("2026-10-15T20:00:00.000Z");
const eligible: EligibleInitialGuestRecipient = {
  recipientDigest: `hmac:v1:${"q".repeat(43)}`,
  permissionId: randomUUID(),
  permissionRevision: 1,
  permissionExpiresAt: new Date("2026-10-16T20:00:00.000Z"),
  policyId: randomUUID(),
  bindingId: randomUUID(),
  bindingRevision: 2,
  policyRevision: 3,
  companyPolicyRevision: 2,
  templateVersion: "approved-v1",
  locale: "ar",
};

function fixture(updateGeneration: number | null = 1) {
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("clock_timestamp() AS now")) return { rows: [{ now: issuedAt }] };
    if (sql.includes("UPDATE valet_sessions")) {
      return {
        rows: updateGeneration === null ? [] : [
          { customer_access_generation: updateGeneration },
        ],
      };
    }
    return { rows: [] };
  });
  return { calls, tx: { query } as unknown as PostgresTransaction };
}

const deterministicToken = Buffer.alloc(32, 7).toString("base64url");

function makeDependencies(
  eligibleRecipient: EligibleInitialGuestRecipient | null = eligible,
) {
  const findEligibleRecipient = vi.fn(async (
    ...args: [PostgresTransaction, InitialGuestScope]
  ) => {
    void args;
    return eligibleRecipient;
  });
  const seal = vi.fn((token: string, aad: SealedOutboundEnvelope["aad"]) => {
    expect(token).toBe(deterministicToken);
    return {
      algorithm: "RSA-OAEP-SHA256" as const,
      keyVersion: "k1",
      ciphertext: Buffer.alloc(384),
      aad,
      purgeAt: new Date(aad.expiresAt),
    };
  });
  const persist = vi.fn(async (
    ...args: [PostgresTransaction, OutboundMessageIntent, SealedOutboundEnvelope, string]
  ): Promise<void> => {
    void args;
  });
  return {
    findEligibleRecipient,
    persist,
    seal,
    sealer: { seal },
    tokenBytesFactory: () => Buffer.alloc(32, 7),
  };
}

describe("initial Guest issuing inside the existing Intake transaction", () => {
  it("writes one generation, one intent and safe audit without leaking raw bearer", async () => {
    const db = fixture();
    const deps = makeDependencies();
    expect(await issueInitialGuestAccessInTransaction(db.tx, scope, deps)).toBe(true);
    const update = db.calls.find((call) => call.sql.includes("UPDATE valet_sessions"));
    expect(update?.params[3]).toBe(hashGuestAccessToken(deterministicToken));
    expect(update?.params[4]).toEqual(new Date("2026-10-16T20:00:00.000Z"));
    expect(deps.persist).toHaveBeenCalledTimes(1);
    const [transaction, intent, envelope, policyId] = deps.persist.mock.calls[0]!;
    expect(transaction).toBe(db.tx);
    expect(intent).toMatchObject({
      purpose: "INITIAL_GUEST_ACCESS",
      credentialGeneration: 1,
      scope,
      recipientDigest: eligible.recipientDigest,
      companyPolicyRevision: 2,
      expiresAt: new Date("2026-10-15T20:30:00.000Z"),
    });
    expect(policyId).toBe(eligible.policyId);
    expect(envelope.aad).toMatchObject({
      intentId: intent.id,
      credentialGeneration: 1,
      expiresAt: "2026-10-15T20:30:00.000Z",
    });
    const audit = db.calls.find((call) => call.sql.includes("INSERT INTO audit_events"));
    expect(audit?.params[6]).toBe("GUEST_ACCESS_ISSUED");
    const allSqlArgs = JSON.stringify(db.calls);
    expect(allSqlArgs).not.toContain(deterministicToken);
    expect(allSqlArgs).not.toContain("+9627");
    expect(allSqlArgs).not.toContain(eligible.recipientDigest);
  });

  it("does nothing without a verified eligible recipient", async () => {
    const db = fixture();
    const deps = makeDependencies(null);
    expect(await issueInitialGuestAccessInTransaction(db.tx, scope, deps)).toBe(false);
    expect(db.calls).toHaveLength(0);
    expect(deps.seal).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("rejects a changed placeholder or generation without writing outbox", async () => {
    const db = fixture(null);
    const deps = makeDependencies();
    await expect(issueInitialGuestAccessInTransaction(db.tx, scope, deps))
      .rejects.toMatchObject({ code: "GUEST_ACCESS_GENERATION_FAILED" });
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("propagates durable outbox failure so Intake rolls back its transaction", async () => {
    const db = fixture();
    const deps = makeDependencies();
    deps.persist.mockRejectedValueOnce(new Error("outbox-write-failed"));
    await expect(issueInitialGuestAccessInTransaction(db.tx, scope, deps))
      .rejects.toThrow("outbox-write-failed");
    expect(db.calls.some((call) => call.sql.includes("INSERT INTO audit_events")))
      .toBe(false);
  });

  it("skips expired consent after database locks without token issuance", async () => {
    const db = fixture();
    const deps = makeDependencies({ ...eligible, permissionExpiresAt: issuedAt });
    expect(await issueInitialGuestAccessInTransaction(db.tx, scope, deps)).toBe(false);
    expect(deps.seal).not.toHaveBeenCalled();
  });

  it("persists the independent company revision with a Location override intent", async () => {
    const db = fixture();
    const deps = makeDependencies();
    deps.persist.mockImplementation(persistInitialGuestOutbox);
    expect(await issueInitialGuestAccessInTransaction(db.tx, scope, deps)).toBe(true);
    const insert = db.calls.find(({ sql }) => sql.includes("INSERT INTO outbound_message_intents"));
    expect(insert?.sql).toContain("company_policy_revision");
    expect(insert?.params[15]).toBe(eligible.companyPolicyRevision);
    expect(insert?.params[10]).toBe(eligible.policyRevision);
    expect(db.calls.filter(({ sql }) => sql.includes("INSERT INTO outbound_message_")))
      .toHaveLength(3);
  });
});
