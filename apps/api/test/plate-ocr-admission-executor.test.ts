import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeOcrAdmission } from "../src/modules/check-in-api/plate-ocr-admission/plate-ocr-admission-authorization";
import { PlateOcrAdmissionExecutor } from "../src/modules/check-in-api/plate-ocr-admission/plate-ocr-admission-executor";

vi.mock(
  "../src/modules/check-in-api/plate-ocr-admission/plate-ocr-admission-authorization",
  () => ({ authorizeOcrAdmission: vi.fn() }),
);

const ids = {
  session: "11111111-1111-4111-8111-111111111111",
  user: "22222222-2222-4222-8222-222222222222",
  org: "33333333-3333-4333-8333-333333333333",
  member: "44444444-4444-4444-8444-444444444444",
  location: "55555555-5555-4555-8555-555555555555",
  attempt: "66666666-6666-4666-8666-666666666666",
  period: "77777777-7777-4777-8777-777777777777",
  nonce: "88888888-8888-4888-8888-888888888888",
};

const context: StaffSessionContext = {
  staffAuthSessionId: ids.session,
  userId: ids.user,
  accessTokenHash: "test-token-hash",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const admittedRow = {
  decision: "ADMITTED",
  attempt_id: ids.attempt,
  organization_id: ids.org,
  membership_id: ids.member,
  location_id: ids.location,
  period_id: ids.period,
  account_alias: "test-account",
  owner_nonce: ids.nonce,
  revision: "1",
  admitted_at: new Date(),
  execution_deadline: new Date(Date.now() + 4_000),
  remaining_authorized_ms: 4_000,
};

function fakeDatabase(
  options: {
    row?: Record<string, unknown>;
    commitFails?: boolean;
    ocrError?: Error;
  } = {},
) {
  const statements: string[] = [];
  const release = vi.fn();
  const transaction = {
    release,
    query: vi.fn(async (query: string) => {
      statements.push(query);
      if (query === "COMMIT" && options.commitFails) {
        throw new Error("COMMIT outcome unknown");
      }
      if (query.includes("public.ocr_admit(")) {
        if (options.ocrError) throw options.ocrError;
        return { rows: [options.row ?? admittedRow] };
      }
      return { rows: [] };
    }),
  };
  const connect = vi.fn(async () => transaction);
  const pool = { connect } as unknown as PostgresPool;
  return { pool, connect, transaction, statements, release };
}

describe("OCR admission A known-commit boundary", () => {
  beforeEach(() => {
    vi.mocked(authorizeOcrAdmission).mockReset();
    vi.mocked(authorizeOcrAdmission).mockResolvedValue({
      organizationId: ids.org,
      membershipId: ids.member,
      locationId: ids.location,
    });
  });

  it("creates a private one-use capability only after known COMMIT", async () => {
    const db = fakeDatabase();
    const result = await new PlateOcrAdmissionExecutor(db.pool).admit(
      context,
      ids.location,
      4_000,
    );
    expect(result.status).toBe("ADMITTED");
    if (result.status !== "ADMITTED") return;
    expect(result.attempt).toMatchObject({
      attemptId: ids.attempt,
      organizationId: ids.org,
      ownerNonce: ids.nonce,
      revision: "1",
    });
    expect(JSON.stringify(result.attempt)).not.toContain(ids.nonce);
    expect(db.statements.at(-1)).toBe("COMMIT");
    expect(
      db.statements.filter((statement) => statement.includes("ocr_admit(")),
    ).toHaveLength(1);
    expect(result.permit.consumeIfFresh()).toBe(true);
    expect(result.permit.consumeIfFresh()).toBe(false);
  });

  it("never issues a permit after ambiguous COMMIT", async () => {
    const db = fakeDatabase({ commitFails: true });
    const result = await new PlateOcrAdmissionExecutor(db.pool).admit(
      context,
      ids.location,
      4_000,
    );
    expect(result).toEqual({
      status: "UNAVAILABLE",
      reason: "DATABASE_UNAVAILABLE",
    });
    expect(db.statements).toContain("ROLLBACK");
    expect(db.release).toHaveBeenCalledWith(true);
  });

  it("does not emit a permit on an explicit quota denial", async () => {
    const db = fakeDatabase({ row: { decision: "QUOTA" } });
    const result = await new PlateOcrAdmissionExecutor(db.pool).admit(
      context,
      ids.location,
      4_000,
    );
    expect(result).toEqual({ status: "UNAVAILABLE", reason: "QUOTA" });
    expect(db.statements.at(-1)).toBe("COMMIT");
  });

  it("rolls back if the DB returns a forged or malformed admission scope", async () => {
    const db = fakeDatabase({
      row: { ...admittedRow, organization_id: ids.user },
    });
    const result = await new PlateOcrAdmissionExecutor(db.pool).admit(
      context,
      ids.location,
      4_000,
    );
    expect(result.status).toBe("UNAVAILABLE");
    expect(db.statements).not.toContain("COMMIT");
    expect(db.statements.at(-1)).toBe("ROLLBACK");
  });

  it("distinguishes OCR NOWAIT from unrelated PostgreSQL lock timeouts", async () => {
    const lockBusy = Object.assign(
      new Error(
        'could not obtain lock on row in relation "ocr_platform_control"',
      ),
      { code: "55P03" },
    );
    const timeout = Object.assign(
      new Error("canceling statement due to lock timeout"),
      { code: "55P03" },
    );
    const busyDb = fakeDatabase({ ocrError: lockBusy });
    const timedDb = fakeDatabase({ ocrError: timeout });
    expect(
      await new PlateOcrAdmissionExecutor(busyDb.pool).admit(
        context,
        ids.location,
        4_000,
      ),
    ).toEqual({ status: "UNAVAILABLE", reason: "LOCK_BUSY" });
    expect(
      await new PlateOcrAdmissionExecutor(timedDb.pool).admit(
        context,
        ids.location,
        4_000,
      ),
    ).toEqual({ status: "UNAVAILABLE", reason: "DATABASE_UNAVAILABLE" });
    expect(busyDb.statements.at(-1)).toBe("ROLLBACK");
    expect(timedDb.statements.at(-1)).toBe("ROLLBACK");
  });

  it("keeps a committed no-fetch permit to allow guarded settlement", async () => {
    const db = fakeDatabase({
      row: { ...admittedRow, remaining_authorized_ms: 0 },
    });
    const result = await new PlateOcrAdmissionExecutor(db.pool).admit(
      context,
      ids.location,
      4_000,
    );
    expect(result.status).toBe("ADMITTED");
    if (result.status !== "ADMITTED") return;
    expect(result.permit.consumeIfFresh()).toBe(false);
    expect(result.attempt.attemptId).toBe(ids.attempt);
  });

  it("does not touch PostgreSQL when the runtime timeout is invalid", async () => {
    const db = fakeDatabase();
    expect(
      await new PlateOcrAdmissionExecutor(db.pool).admit(
        context,
        ids.location,
        0,
      ),
    ).toEqual({ status: "UNAVAILABLE", reason: "DATABASE_UNAVAILABLE" });
    expect(db.connect).not.toHaveBeenCalled();
  });
});
