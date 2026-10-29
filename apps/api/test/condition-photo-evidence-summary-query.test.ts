import { describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { readConditionPhotoEvidenceSummary } from
  "../src/modules/vehicle-photos/condition-photo-evidence-summary-query";
import type { ConditionPhotoReadScope } from
  "../src/modules/vehicle-photos/condition-photo-status-query";

const scope: ConditionPhotoReadScope = {
  organizationId: "44444444-4444-4444-8444-444444444444",
  locationId: "55555555-5555-4555-8555-555555555555",
  valetSessionId: "11111111-1111-4111-8111-111111111111",
  actorMembershipId: "66666666-6666-4666-8666-666666666666",
};
const stamp = "2026-10-29T00:00:00.000Z";
const records = Array.from({ length: 4 }, (_, index) => ({
  operationId: `22222222-2222-4222-8222-22222222222${3 - index}`,
  vehiclePhotoId: `33333333-3333-4333-8333-33333333333${3 - index}`,
  verifiedAt: stamp,
  status: "VERIFIED" as const,
}));

function database(total: number, latest: readonly {
  operationId: string; vehiclePhotoId: string;
  verifiedAt: string; status: string;
}[] = records) {
  const query = vi.fn(async () => ({
    rows: [{ verified_total: total, latest_verified: latest }],
  }));
  return { query, transaction: { query } as unknown as PostgresTransaction };
}

describe("Issue #336 verified condition photo metadata query", () => {
  it.each([0, 1, 4, 5, 6, 9, 10])(
    "counts %i actor-authorized historical records with at most four visible",
    async (total) => {
      const visible = total === 0 ? [] : records.slice(0, Math.min(total, 4));
      const db = database(total, visible);
      const result = await readConditionPhotoEvidenceSummary(db.transaction, scope);
      expect(result).toEqual({ valetSessionId: scope.valetSessionId,
        verifiedTotal: total, latestVerified: visible });
      expect(db.query).toHaveBeenCalledTimes(1);
    },
  );

  it("enforces exact actor, organization, location and Check-In session in one read", async () => {
    const db = database(6);
    await readConditionPhotoEvidenceSummary(db.transaction, scope);
    const [sql, argumentsList] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(argumentsList).toEqual([
      scope.organizationId, scope.locationId, scope.valetSessionId,
      scope.actorMembershipId,
    ]);
    expect(sql).toContain("o.actor_membership_id = $4");
    expect(sql).toContain("v.captured_by_membership_id = o.actor_membership_id");
    expect(sql).toContain("o.status = 'VERIFIED'");
    expect(sql).toContain("LIMIT 4");
    expect(sql).toContain("count(*)::int");
    expect(sql).toContain("ORDER BY verified_at DESC, client_operation_id DESC");
    expect(sql).toContain('HH24:MI:SS.US"Z"');
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(sql).not.toMatch(/object_key|signed_url|image_bytes/i);
  });

  it("rejects ambiguous, duplicate, or malformed evidence facts", async () => {
    const duplicate = database(5, [records[0]!, records[0]!]);
    await expect(readConditionPhotoEvidenceSummary(duplicate.transaction, scope))
      .rejects.toThrow();
    const inconsistent = database(1, records.slice(0, 2));
    await expect(readConditionPhotoEvidenceSummary(inconsistent.transaction, scope))
      .rejects.toThrow();
    const missingProof = database(1, [{ ...records[0]!, status: "PENDING" as const }]);
    await expect(readConditionPhotoEvidenceSummary(missingProof.transaction, scope))
      .rejects.toThrow();
  });

  it("retains microsecond ordering when records differ within a millisecond", async () => {
    const newest = { ...records[3]!, operationId: records[3]!.operationId,
      verifiedAt: "2026-10-29T00:00:00.000901Z" };
    const older = { ...records[0]!, operationId: records[0]!.operationId,
      verifiedAt: "2026-10-29T00:00:00.000100Z" };
    const db = database(2, [newest, older]);
    const result = await readConditionPhotoEvidenceSummary(db.transaction, scope);
    expect(result.latestVerified).toEqual([newest, older]);
  });
});
