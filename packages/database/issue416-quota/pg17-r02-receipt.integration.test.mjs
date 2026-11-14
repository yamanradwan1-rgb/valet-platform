import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUDIENCE, expectSavepointRejection, fingerprint,
  reserveQuota, syntheticRequest, withQuotaRollback,
} from "./pg17-quota-fixture.mjs";

describe("Issue416 R02 PG17 evidence and unknown outcome — NOT RUN", () => {
  it("denies fake domain receipt without consumed RESET_ISSUE challenge", async () => {
    await withQuotaRollback(async (client) => {
      const request = syntheticRequest();
      await reserveQuota(client, request);
      await expectSavepointRejection(client, () => client.query(
        "INSERT INTO auth_proof_private.reset_issue_domain_evidence " +
        "(audience,operation_id,request_fingerprint,challenge_id,outcome) " +
        "VALUES ($1,$2,$3,$4,'UNCHANGED')",
        [AUDIENCE, request.operationId, fingerprint(request.marker), randomUUID()],
      ), "42501");
      const { rows } = await client.query(
        "SELECT auth_proof_private.reconcile_reset_issue_quota($1,$2) AS state",
        [AUDIENCE, request.operationId],
      );
      expect(rows[0].state).toBe("PENDING");
    });
  });

  it("never discounts an unresolved domain outcome or a linkless replay", async () => {
    await withQuotaRollback(async (client) => {
      const request = syntheticRequest();
      const first = await reserveQuota(client, request);
      expect(await reserveQuota(client, request)).toEqual(first);
      const result = await client.query(
        "SELECT auth_proof_private.reconcile_reset_issue_quota($1,$2) AS state",
        [AUDIENCE, request.operationId],
      );
      expect(result.rows[0].state).toBe("PENDING");
      const { rows } = await client.query(
        "SELECT b.state,b.finalization_basis," +
        "count(e.reservation_id)::int AS entries," +
        "count(*) FILTER (WHERE e.state='PENDING')::int AS pending " +
        "FROM auth_proof_private.reset_issue_quota_bundles b " +
        "JOIN auth_proof_private.reset_issue_quota_entries e " +
        "ON e.audience=b.audience AND e.operation_id=b.operation_id " +
        "WHERE b.audience=$1 AND b.operation_id=$2 " +
        "GROUP BY b.state,b.finalization_basis",
        [AUDIENCE, request.operationId],
      );
      expect(rows).toEqual([{
        state: "PENDING", finalization_basis: null, entries: 4, pending: 4,
      }]);
    });
  });

  it("rejects changed request fingerprint and preserves same four IDs", async () => {
    await withQuotaRollback(async (client) => {
      const request = syntheticRequest();
      const original = await reserveQuota(client, request);
      await expectSavepointRejection(client, () => reserveQuota(client, {
        ...request, marker: request.marker + "-changed",
      }), "23505");
      expect(await reserveQuota(client, request)).toEqual(original);
    });
  });

  it.skip("requires authorized committed domain receipt and lost-COMMIT fixture", () => {
    // NOT RUN: a rollback-only fixture cannot prove durable 900s expiry,
    // genuine reset generation, response-loss retry across committed leases,
    // or independently attested finalizer idempotency. No fake receipt.
  });
});
