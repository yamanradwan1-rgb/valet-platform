import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ISSUE_SCOPES, attestedQuotaClient, quotaKey,
  reserveQuota, syntheticRequest, withQuotaRollback,
} from "./pg17-quota-fixture.mjs";

async function blockedSecondLease(firstRequest, secondRequest) {
  const first = await attestedQuotaClient();
  const second = await attestedQuotaClient();
  try {
    await first.query("BEGIN");
    await first.query("SET ROLE vap1_proof_owner");
    await reserveQuota(first, firstRequest);
    await second.query("BEGIN");
    await second.query("SET ROLE vap1_proof_owner");
    await second.query("SET LOCAL lock_timeout = '300ms'");
    let code;
    try {
      await reserveQuota(second, secondRequest);
    } catch (error) {
      code = error.code;
    }
    expect(code).toBe("55P03"); // Lock timeout, NOT bypass/oversubscription.
  } finally {
    await second.query("ROLLBACK").catch(() => {});
    await first.query("ROLLBACK").catch(() => {});
    await Promise.all([second.end().catch(() => {}), first.end().catch(() => {})]);
  }
}

describe("Issue416 R02 PG17 two-connection contention — NOT RUN", () => {
  it("serializes shared logical scope before cap evaluation", async () => {
    const shared = quotaKey(ISSUE_SCOPES[0][0], randomUUID());
    const first = syntheticRequest();
    const second = syntheticRequest();
    first.keys[0] = shared;
    second.keys[0] = shared;
    await blockedSecondLease(first, second);
    await withQuotaRollback(async (client) => {
      const result = await reserveQuota(client, second);
      expect(result.bundle_state).toBe("PENDING");
      expect(result.reservation_ids).toHaveLength(4);
    });
  });

  it("serializes same operation even when all four hashes differ", async () => {
    const first = syntheticRequest();
    const second = { ...syntheticRequest(), operationId: first.operationId };
    await blockedSecondLease(first, second);
  });

  it.skip("requires separately approved durable fixture for committed cap race", () => {
    // NOT RUN: rollback-only sessions cannot prove concurrent COMMIT
    // linearization, an unknown COMMIT acknowledgment or 900s recovery.
  });
});
