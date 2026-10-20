import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../src/modules/management/audit-investigation/security/audit-investigation-authorization";
import { requireU05StableIndirectCohort, U05IndirectCohortNotStable }
  from "../src/modules/management/audit-investigation/audit-investigation-u05-indirect-guard";

const scope: AuditInvestigationLocationAuthorization = {
  organizationId: "21000000-0000-4000-8000-000000000001",
  locationId: "21000000-0000-4000-8000-000000000002",
  membershipId: "21000000-0000-4000-8000-000000000003",
  role: "LOCATION_MANAGER",
};
const snapshot = { cutoff: "2026-10-20T02:00:00.000000Z", database: "100:101:" };

describe("ordinary production-safe historical cohort pagination boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows a verified safe cohort without an Owner test lease", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const query = vi.fn(async (sql: string, args: readonly unknown[]) => {
      // Ordinary Task/Incident/Vehicle Audit already linked to a real Session
      // is NOT an unsafe late-parent cohort. Only NULL-direct links are vetoed.
      expect(sql).toContain("a.valet_session_id IS NULL");
      expect(sql).toContain("a.entity_type IN ('Task','TASK','Incident','INCIDENT'");
      expect(args.slice(0, 2)).toEqual([scope.organizationId, scope.locationId]);
      return { rowCount: 1, rows: [{ unsafe: false }] };
    });
    const tx = { query } as unknown as PostgresTransaction;
    await expect(requireU05StableIndirectCohort(tx, scope, snapshot)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("retains fail-closed refusal of NULL-direct unverified parent cohorts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const tx = { query: async () => ({ rowCount: 1, rows: [{ unsafe: true }] }) } as unknown as PostgresTransaction;
    await expect(requireU05StableIndirectCohort(tx, scope, snapshot))
      .rejects.toBeInstanceOf(U05IndirectCohortNotStable);
  });

  it("never promotes an unavailable query to safe", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const tx = { query: async () => ({ rowCount: 0, rows: [] }) } as unknown as PostgresTransaction;
    await expect(requireU05StableIndirectCohort(tx, scope, snapshot))
      .rejects.toBeInstanceOf(U05IndirectCohortNotStable);
  });
});
