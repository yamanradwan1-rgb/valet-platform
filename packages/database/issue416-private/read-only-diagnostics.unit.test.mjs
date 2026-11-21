import { describe, expect, it } from "vitest";

import { DIAGNOSTIC_QUERIES, sanitizeDiagnosticLogs } from "./read-only-diagnostics.mjs";

describe("Issue416 read-only migration diagnostics", () => {
  it("only exposes SELECT catalog queries", () => {
    expect(Object.keys(DIAGNOSTIC_QUERIES)).toEqual([
      "migrations", "namespaces", "relations", "roles", "memberships",
      "defaultAcls",
    ]);
    for (const sql of Object.values(DIAGNOSTIC_QUERIES)) {
      expect(sql.trimStart()).toMatch(/^SELECT\b/i);
      const withoutQuotedPrivilegeNames = sql.replace(/'(?:''|[^'])*'/g, "'literal'");
      expect(withoutQuotedPrivilegeNames).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL)\b/i);
      expect(sql).not.toMatch(/;/);
    }
  });

  it("includes global and schema-scoped default ACLs without filtering absent owner", () => {
    const sql = DIAGNOSTIC_QUERIES.defaultAcls;
    expect(sql).toMatch(/FROM pg_catalog\.pg_default_acl AS d/);
    expect(sql).toMatch(/LEFT JOIN pg_catalog\.pg_namespace AS n/);
    expect(sql).toMatch(/d\.defaclacl::text AS default_acl/);
    expect(sql).not.toMatch(/\bWHERE\b/i);
    expect(sql).not.toMatch(/\$[1-9]/);
  });

  it("redacts synthetic credentials and reports SQLSTATE without truncating it", () => {
    const log = "SQLSTATE 42501: permission denied for schema auth_proof_private " +
      "postgresql://role:test-password@127.0.0.1:55416/db " +
      "PGPASSWORD=fixturePassword";
    const result = sanitizeDiagnosticLogs(log);
    expect(result).toContain("42501");
    expect(result).toContain("permission denied for schema auth_proof_private");
    expect(result).not.toContain("test-password");
    expect(result).not.toContain("fixturePassword");
  });

  it("limits logs and safely handles missing log data", () => {
    expect(sanitizeDiagnosticLogs(null)).toBe("");
    expect(sanitizeDiagnosticLogs("X".repeat(8000))).toHaveLength(6000);
  });
});
