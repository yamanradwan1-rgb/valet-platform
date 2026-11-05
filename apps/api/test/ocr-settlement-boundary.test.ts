import { randomUUID } from "node:crypto";
import type { PostgresPool } from "../src/common/database/postgres";
import { describe, expect, it, vi } from "vitest";
import { settleOcr } from "../src/modules/check-in-api/plate-ocr-recovery/ocr-settle";
import type {
  OcrObservedResult,
  OcrSettlementHandle,
} from "../src/modules/check-in-api/plate-ocr-recovery/ocr-settlement-contract";

const handle: OcrSettlementHandle = {
  attemptId: randomUUID(),
  organizationId: randomUUID(),
  membershipId: randomUUID(),
  locationId: randomUUID(),
  periodId: randomUUID(),
  accountAlias: "qa_account",
  ownerNonce: randomUUID(),
  revision: "1",
};

const match = {
  status: "MATCH" as const,
  candidate: { plateNumberRaw: "SENSITIVE-PLATE", confidence: 0.95 },
};

const invoked: OcrObservedResult = {
  response: match,
  fetchInvoked: true,
  disposition: "UNKNOWN",
  observationClass: "HTTP_COMPLETE",
  httpClass: "2XX",
  failureClass: "NONE",
  durationMs: 150,
};

function mockPool(settled = true) {
  const query = vi.fn(async () => ({
    rowCount: 1,
    rows: [{ settled }],
  }));
  return { query, pool: { query } as unknown as PostgresPool };
}

describe("Issue #429 settlement is conservative after committed debit", () => {
  it("binds full persisted scope, owner nonce, revision and sanitized observation", async () => {
    const { query, pool } = mockPool();
    expect(await settleOcr(pool, handle, invoked)).toBe(true);
    expect(query).toHaveBeenCalledOnce();
    const [statement, values] = query.mock.calls[0]! as unknown as [
      string,
      unknown[],
    ];
    expect(statement).toContain("public.ocr_settle(");
    expect(statement).not.toContain("UPDATE ocr_attempts");
    expect(values).toEqual([
      handle.attemptId,
      handle.organizationId,
      handle.membershipId,
      handle.locationId,
      handle.periodId,
      handle.accountAlias,
      handle.ownerNonce,
      "1",
      "UNKNOWN",
      "HTTP_COMPLETE",
      "2XX",
      "NONE",
      150,
    ]);
    expect(JSON.stringify(values)).not.toContain("SENSITIVE-PLATE");
  });

  it("only permits NOT_SENT for owner-observed pre-fetch retirement", async () => {
    const { pool, query } = mockPool();
    const notSent: OcrObservedResult = {
      response: { status: "UNAVAILABLE" },
      fetchInvoked: false,
      disposition: "NOT_SENT",
      observationClass: "NOT_INVOKED",
      httpClass: "NONE",
      failureClass: "CANCELLED",
      durationMs: 0,
    };
    expect(await settleOcr(pool, handle, notSent)).toBe(true);
    const [, values] = query.mock.calls[0]! as unknown as [string, unknown[]];
    expect(values[8]).toBe("NOT_SENT");
    expect(values[9]).toBe("NOT_INVOKED");
  });

  it.each([
    { ...invoked, disposition: "NOT_SENT" },
    { ...invoked, observationClass: "NOT_INVOKED" },
    { ...invoked, httpClass: "HTTP_2XX" },
    { ...invoked, durationMs: 120001 },
    { ...invoked, durationMs: 1.5 },
    { ...invoked, failureClass: "RAW_PROVIDER_RESPONSE" },
    { ...invoked, fetchInvoked: false },
    {
      ...invoked,
      fetchInvoked: undefined,
      disposition: "NOT_SENT",
      observationClass: "NOT_INVOKED",
      httpClass: "NONE",
    },
  ])(
    "refuses fabricated remote release/invalid bounded evidence before SQL",
    async (bad) => {
      const { pool, query } = mockPool();
      await expect(
        settleOcr(pool, handle, bad as OcrObservedResult),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("treats stale/foreign CAS false as no release and never retries", async () => {
    const { pool, query } = mockPool(false);
    expect(await settleOcr(pool, handle, invoked)).toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });

  it("leaves exposure in the database when settlement cannot be confirmed", async () => {
    const query = vi.fn().mockRejectedValue(new Error("db down secret"));
    await expect(
      settleOcr({ query } as unknown as PostgresPool, handle, invoked),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects unsafe revision before one DB statement", async () => {
    const { pool, query } = mockPool();
    await expect(
      settleOcr(
        pool,
        { ...handle, revision: Number.MAX_SAFE_INTEGER + 1 },
        invoked,
      ),
    ).rejects.toThrow();
    await expect(
      settleOcr(pool, { ...handle, revision: "0" }, invoked),
    ).rejects.toThrow();
    await expect(
      settleOcr(pool, { ...handle, accountAlias: "BAD:ALIAS" }, invoked),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
