import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { staffShiftHistoryQuerySchema } from "@valet/contracts";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { staffShiftHistorySql } from "../src/modules/management/staff-shift-history-query";
const historicalPlanPath = resolve(
  __dirname,
  "../../../docs/validation/issue240e-query-plans.json",
);
const generatedPlanPath = resolve(
  __dirname,
  "../../../tmp/issue397-shift-history-query-plans.json",
);
const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

it("measures final history SQL at 40,000 ended rows across two tenants", async () => {
  const historicalPlanBytes = readFileSync(historicalPlanPath);
  const own = await fixture.createOrganization(),
    foreign = await fixture.createOrganization();
  const a = await fixture.addLocation(own),
    b = await fixture.addLocation(own),
    c = await fixture.addLocation(foreign);
  await fixture.query(
    `WITH accounts AS (
    INSERT INTO users(id,email,password_hash,updated_at)
    SELECT gen_random_uuid(),'shift-plan-' || n || '-' || $1 || '@example.com','fixture',now()
    FROM generate_series(1,400) n RETURNING id,email
  ) INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
  SELECT gen_random_uuid(),CASE WHEN split_part(email,'-',3)::int <= 200 THEN $1::uuid ELSE $2::uuid END,
  id,'VALET_EMPLOYEE','ACTIVE',now() FROM accounts`,
    [own, foreign],
  );
  await fixture.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at,ended_at)
    SELECT gen_random_uuid(),m.organization_id,CASE WHEN m.organization_id=$1::uuid
      THEN CASE WHEN n%2=0 THEN $2::uuid ELSE $3::uuid END ELSE $4::uuid END,
      m.id,'ENDED','2026-01-01'::timestamptz+n*interval '1 day','2026-01-01'::timestamptz+n*interval '1 day'+interval '8 hours'
    FROM organization_memberships m CROSS JOIN generate_series(1,100) n WHERE m.organization_id IN ($1::uuid,$5::uuid)`,
    [own, a.locationId, b.locationId, c.locationId, foreign],
  );
  await fixture.query(
    "ANALYZE shifts; ANALYZE organization_memberships; ANALYZE locations; ANALYZE users",
  );
  const member = (
    await fixture.query<{ id: string }>(
      "SELECT id::text FROM organization_memberships WHERE organization_id=$1 LIMIT 1",
      [own],
    )
  ).rows[0]!.id;
  const authority = {
    kind: "COMPANY_ADMIN" as const,
    organizationId: own,
    membershipId: member,
    activeLocationIds: null,
    scopeFingerprint: "0".repeat(64),
  };
  const measurements: unknown[] = [];
  for (const [scenario, input] of [
    ["organization", {}],
    ["exact-location", { locationId: a.locationId }],
    ["exact-membership", { membershipId: member }],
    [
      "status-date",
      {
        status: "ENDED",
        from: "2026-03-01T00:00:00Z",
        to: "2026-03-15T00:00:00Z",
      },
    ],
  ] as const) {
    const sql = staffShiftHistorySql(
      authority,
      staffShiftHistoryQuerySchema.parse(input),
      null,
    );
    const result = await fixture.query<{
      "QUERY PLAN": Array<{
        "Execution Time": number;
        Plan: Record<string, unknown>;
      }>;
    }>(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql.text}`, sql.values);
    const plan = result.rows[0]!["QUERY PLAN"][0]!;
    const nodes: unknown[] = [];
    function inspect(node: Record<string, unknown>) {
      nodes.push({
        node: node["Node Type"],
        index: node["Index Name"],
        rows: node["Actual Rows"],
        loops: node["Actual Loops"],
        sharedHitBlocks: node["Shared Hit Blocks"],
        sortMethod: node["Sort Method"],
      });
      for (const child of (node.Plans ?? []) as Record<string, unknown>[])
        inspect(child);
    }
    inspect(plan.Plan);
    measurements.push({ scenario, executionMs: plan["Execution Time"], nodes });
    expect(plan.Plan["Actual Rows"]).toBe(51);
  }
  const migrationRows = await fixture.query<{ applied: number }>(
    `SELECT count(*)::int AS applied FROM public._prisma_migrations
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const migrationsThrough = migrationRows.rows[0]!.applied;
  expect(migrationsThrough).toBeGreaterThan(0);
  expect(generatedPlanPath).not.toBe(historicalPlanPath);
  expect(readFileSync(historicalPlanPath)).toEqual(historicalPlanBytes);
  mkdirSync(dirname(generatedPlanPath), { recursive: true });
  writeFileSync(
    generatedPlanPath,
    JSON.stringify(
      {
        endedRows: 40000,
        tenantRows: 20000,
        membersPerTenant: 200,
        migrationsThrough,
        measurements,
      },
      null,
      2,
    ),
  );
  expect(readFileSync(historicalPlanPath)).toEqual(historicalPlanBytes);
}, 120_000);
