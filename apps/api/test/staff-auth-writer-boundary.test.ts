import { describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import { assertStaffAuthWriterCredentials } from "../src/common/database/staff-auth-writer-database.module";
import { staffAuthWriterTransaction } from "../src/modules/auth/staff-auth-writer-transaction";

const ordinary = "postgresql://vaylet_runtime:ordinary-secret@127.0.0.1:51557/valet_w57s01";
const protectedUrl = "postgresql://vaylet_staff_auth_writer:writer-secret@127.0.0.1:51557/valet_w57s01";

describe("S01 Staff Auth writer origin and capacity", () => {
  const valid = {
    DATABASE_URL: ordinary,
    STAFF_AUTH_WRITER_DATABASE_URL: protectedUrl,
    NODE_ENV: "test",
  } as NodeJS.ProcessEnv;

  it("requires a distinct fixed principal, secret, and target with no fallback", () => {
    expect(assertStaffAuthWriterCredentials(valid)).toBe(protectedUrl);
    const invalid = [
      { STAFF_AUTH_WRITER_DATABASE_URL: undefined },
      { STAFF_AUTH_WRITER_DATABASE_URL: ordinary },
      { STAFF_AUTH_WRITER_DATABASE_URL: protectedUrl.replace("writer-secret", "ordinary-secret") },
      { STAFF_AUTH_WRITER_DATABASE_URL: protectedUrl.replace("vaylet_staff_auth_writer", "vaylet_runtime") },
      { STAFF_AUTH_WRITER_DATABASE_URL: protectedUrl.replace("51557", "51558") },
      { STAFF_AUTH_WRITER_DATABASE_URL: protectedUrl.replace("valet_w57s01", "other_db") },
      { STAFF_AUTH_WRITER_DATABASE_URL: protectedUrl.replace("writer-secret", "ordinary%2Dsecret") },
      { STAFF_AUTH_WRITER_DATABASE_URL: protectedUrl + "?sslmode=disable" },
    ];
    for (const scenario of invalid) {
      expect(() => assertStaffAuthWriterCredentials({ ...valid, ...scenario }))
        .toThrow();
    }
  });

  it("requires independent migration credentials whenever configured", () => {
    expect(() => assertStaffAuthWriterCredentials({
      ...valid,
      MIGRATION_DATABASE_URL: protectedUrl,
    })).toThrow();
    expect(assertStaffAuthWriterCredentials({
      ...valid,
      MIGRATION_DATABASE_URL: "postgresql://migration:third-secret@127.0.0.1:51557/valet_w57s01",
    })).toBe(protectedUrl);
  });
});

function simulatedPool(failure: "commit" | "write" | null) {
  const query = vi.fn(async (sql: string) => {
    if (sql === "COMMIT" && failure === "commit") throw new Error("lost COMMIT acknowledgement");
    if (sql === "SELECT write" && failure === "write") throw new Error("write denied");
    return { rowCount: 1, rows: [] };
  });
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as PostgresPool;
  return { pool, query, release };
}

describe("S01 ambiguous-commit recovery", () => {
  it("releases the original value only after successful exact committed readback", async () => {
    const { pool, query, release } = simulatedPool("commit");
    const reconciler = vi.fn(async (value: string) => value === "original-token");
    await expect(staffAuthWriterTransaction(pool,
      async (transaction) => {
        await transaction.query("SELECT write");
        return "original-token";
      },
      reconciler,
    )).resolves.toBe("original-token");
    expect(reconciler).toHaveBeenCalledOnce();
    expect(query.mock.calls.filter(([sql]) => sql === "SELECT write")).toHaveLength(1);
    expect(release).toHaveBeenCalledWith(true);
  });

  it("does not release an unproven token after an unknown COMMIT", async () => {
    const { pool } = simulatedPool("commit");
    await expect(staffAuthWriterTransaction(pool,
      async () => "candidate-token",
      async () => false,
    )).rejects.toThrow("lost COMMIT acknowledgement");
  });

  it("never reconciles a failed write or ordinary rollback as if committed", async () => {
    const { pool, query } = simulatedPool("write");
    const reconcile = vi.fn(async () => true);
    await expect(staffAuthWriterTransaction(pool,
      async (transaction) => {
        await transaction.query("SELECT write");
        return "uncommitted";
      },
      reconcile,
    )).rejects.toThrow("write denied");
    expect(reconcile).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  });
});
