import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { reconcileA01UnknownCommit } from "../src/modules/auth/vap1/issue416-a01-unknown-commit";

const ids = {
  audience: "a01-recovery-fixture",
  operationId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  sessionId: "00000000-0000-4000-8000-000000000003",
  refreshId: "00000000-0000-4000-8000-000000000004",
  limiterReservationId: "00000000-0000-4000-8000-000000000005",
  accessHash: "staff-access-sha256:v1:" + "a".repeat(64),
  refreshHash: "staff-refresh-sha256:v1:" + "b".repeat(64),
};
const original = {
  id: ids.sessionId,
  user_id: ids.userId,
  operation_id: ids.operationId,
  refresh_id: ids.refreshId,
  limiter_reservation_id: ids.limiterReservationId,
  current_access_token_hash: ids.accessHash,
  refresh_token_hash: ids.refreshHash,
  receipt_outcome: "COMPLETED",
  access_expires_at: new Date("2026-11-14T21:00:00.000Z"),
  absolute_expires_at: new Date("2026-12-14T21:00:00.000Z"),
  refresh_cookie_max_age_seconds: 2592000,
};

function simulatedPool(rows: unknown[], throws = false) {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (!sql.includes("a01_read_commit_receipt") || params?.length !== 6) {
      throw new Error("unexpected receipt fixture query");
    }
    if (throws) throw new Error("read-only receipt unavailable");
    return { rows, rowCount: rows.length };
  });
  return { query, pool: { query } as unknown as PostgresPool };
}

describe("A01 UNKNOWN COMMIT receipt reconciliation", () => {
  it("uses one purpose-specific read and returns only proven original lineage", async () => {
    const { pool, query } = simulatedPool([original]);
    const result = await reconcileA01UnknownCommit(pool, ids);
    expect(result?.id).toBe(ids.sessionId);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, args] = query.mock.calls[0]!;
    expect(sql).toContain("auth_proof_private.a01_read_commit_receipt");
    expect(args).toEqual([
      ids.audience, ids.operationId, ids.userId, ids.sessionId,
      ids.refreshId, ids.limiterReservationId,
    ]);
  });

  it("treats missing, duplicate or inaccessible receipt as UNKNOWN", async () => {
    for (const rows of [[], [original, original]]) {
      const { pool } = simulatedPool(rows);
      await expect(reconcileA01UnknownCommit(pool, ids)).resolves.toBeUndefined();
    }
    const { pool } = simulatedPool([], true);
    await expect(reconcileA01UnknownCommit(pool, ids)).resolves.toBeUndefined();
  });

  it("does not accept same-operation wrong User, session, refresh or limiter", async () => {
    for (const field of [
      "user_id", "id", "refresh_id", "limiter_reservation_id",
    ] as const) {
      const row = { ...original, [field]: ids.operationId };
      const { pool } = simulatedPool([row]);
      await expect(reconcileA01UnknownCommit(pool, ids)).resolves.toBeUndefined();
    }
  });

  it("does not accept copied identity with wrong access/refresh verifier", async () => {
    for (const field of [
      "current_access_token_hash", "refresh_token_hash",
    ] as const) {
      const { pool } = simulatedPool([{ ...original, [field]: "forged" }]);
      await expect(reconcileA01UnknownCommit(pool, ids)).resolves.toBeUndefined();
    }
  });

  it("rejects non-committed or malformed receipts without a retry/mutation", async () => {
    for (const row of [
      { ...original, receipt_outcome: "PENDING" },
      { ...original, receipt_outcome: "REVOKED" },
      { ...original, operation_id: ids.userId },
      { ...original, access_expires_at: "2026-11-14T21:00:00.000Z" },
      { ...original, refresh_cookie_max_age_seconds: "2592000" },
    ]) {
      const { pool } = simulatedPool([row]);
      await expect(reconcileA01UnknownCommit(pool, ids)).resolves.toBeUndefined();
    }
  });
});
