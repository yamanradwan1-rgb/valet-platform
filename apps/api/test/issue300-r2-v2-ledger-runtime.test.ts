import { describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  v2LedgerCatalogSql,
  v2LedgerReadSql,
  verifyU05V2LedgerRuntime,
} from "../src/modules/management/audit-investigation/audit-investigation-u05-ledger-runtime";

const proof = {
  migrationLedgerSha256: "a".repeat(64),
  ledgerHelperFunctionSha256: "b".repeat(64),
};
const asTx = (query: ReturnType<typeof vi.fn>) =>
  ({ query }) as unknown as PostgresTransaction;

describe("R2 request-scoped live ledger proof", () => {
  it("checks owner, body SHA, ACL and search_path in a separate SQL statement", () => {
    expect(v2LedgerCatalogSql).toContain("pg_get_functiondef");
    expect(v2LedgerCatalogSql).toContain("pg_catalog.aclexplode");
    expect(v2LedgerCatalogSql).toContain("prosecdef = true");
    expect(v2LedgerCatalogSql).toContain("lang.lanname = 'sql'");
    expect(v2LedgerCatalogSql).toContain("p.provolatile = 's'");
    expect(v2LedgerCatalogSql).toContain("search_path=pg_catalog, pg_temp");
    expect(v2LedgerCatalogSql).toContain("owner.rolname = 'issue300_r2_w7_owner_v2'");
    expect(v2LedgerCatalogSql).toContain("current_database() = 'issue300_r2_w7_acceptance_v2'");
    expect(v2LedgerCatalogSql).toContain("NOT pg_catalog.has_table_privilege");
    expect(v2LedgerCatalogSql).not.toContain("SELECT public.issue300_r2_v2_migration_ledger_sha256()");
    expect(v2LedgerReadSql).toContain("SELECT public.issue300_r2_v2_migration_ledger_sha256()");
  });

  it("accepts only matching live 96-row ledger after independent catalog PASS", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string, args?: unknown[]) => {
      calls.push(sql === v2LedgerCatalogSql ? "catalog" : "invoke");
      if (sql === v2LedgerCatalogSql) {
        expect(args).toEqual([proof.ledgerHelperFunctionSha256]);
        return { rowCount: 1, rows: [{ valid: true }] };
      }
      expect(sql).toBe(v2LedgerReadSql);
      expect(calls).toEqual(["catalog", "invoke"]);
      return { rowCount: 1, rows: [{ digest: proof.migrationLedgerSha256 }] };
    });
    expect(await verifyU05V2LedgerRuntime(asTx(query), proof)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ rowCount: 0, rows: [] }, "missing function"],
    [{ rowCount: 1, rows: [{ valid: false }] }, "tampered body/owner/ACL"],
    [{ rowCount: 1, rows: [{ valid: null }] }, "indeterminate ACL"],
    [{ rowCount: 2, rows: [{ valid: true }, { valid: true }] }, "ambiguous catalog"],
  ])("rejects %s (%s) before function execution", async (catalog, _reason) => {
    expect(_reason.length).toBeGreaterThan(0);
    const query = vi.fn().mockResolvedValue(catalog);
    expect(await verifyU05V2LedgerRuntime(asTx(query), proof)).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(v2LedgerCatalogSql);
  });

  it.each([null, "c".repeat(64), "", "not-a-sha"])(
    "rejects changed/missing live digest %s",
    async (live) => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ valid: true }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ digest: live }] });
      expect(await verifyU05V2LedgerRuntime(asTx(query), proof)).toBe(false);
      expect(query).toHaveBeenCalledTimes(2);
    },
  );

  it("fails closed on SQL error, timeout, and missing signed fingerprint", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("query canceled"));
    expect(await verifyU05V2LedgerRuntime(asTx(rejected), proof)).toBe(false);
    const catalogOk = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ valid: true }] })
      .mockRejectedValueOnce(new Error("permission denied"));
    expect(await verifyU05V2LedgerRuntime(asTx(catalogOk), proof)).toBe(false);
    const noHash = vi.fn();
    expect(await verifyU05V2LedgerRuntime(asTx(noHash), {
      ...proof, ledgerHelperFunctionSha256: "",
    })).toBe(false);
    expect(noHash).not.toHaveBeenCalled();
  });
});
