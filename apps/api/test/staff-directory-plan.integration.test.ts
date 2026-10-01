import { afterAll, beforeAll, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staffDirectoryQuerySchema } from "@valet/contracts";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { staffDirectorySql } from "../src/modules/management/staff-directory-query";
const fixture = new ManagementControlPlaneTestFixture();
let foreignOrganizationId: string;
beforeAll(async () => {
  await fixture.start();
  foreignOrganizationId = await fixture.createOrganization();
}, 120_000);
afterAll(() => fixture.stop(), 60_000);
it("measures actual SQL plans on 3000 tenant staff and 3000 outside staff", async () => {
  const planOrg = await fixture.createOrganization();
  await fixture.query(
    `WITH accounts AS (
      INSERT INTO users(id,email,password_hash,updated_at)
      SELECT gen_random_uuid(), 'plan-' || n || '-' || $1 || '@example.com', 'fixture', now()
      FROM generate_series(1,6000) n RETURNING id,email
    ) INSERT INTO organization_memberships(id,organization_id,user_id,role,status,first_name,last_name,updated_at)
      SELECT gen_random_uuid(),CASE WHEN split_part(email,'-',2)::int <= 3000 THEN $1::uuid ELSE $2::uuid END,
        id,'VALET_EMPLOYEE','ACTIVE','Plan','Sample',now() FROM accounts`,
    [planOrg, foreignOrganizationId],
  );
  const ownLocation = (await fixture.addLocation(planOrg)).locationId;
  const foreignLocation = (await fixture.addLocation(foreignOrganizationId))
    .locationId;
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id) SELECT organization_id,id,CASE WHEN organization_id=$1::uuid THEN $2::uuid ELSE $3::uuid END FROM organization_memberships WHERE organization_id IN ($1::uuid,$4::uuid)`,
    [planOrg, ownLocation, foreignLocation, foreignOrganizationId],
  );
  await fixture.query(
    "ANALYZE organization_memberships; ANALYZE users; ANALYZE membership_location_access",
  );
  const measurements: unknown[] = [];
  for (const input of [
    {},
    { search: "absent-plan-fixture" },
    {
      search: "Sample",
      role: "VALET_EMPLOYEE",
      status: "ACTIVE",
      locationId: ownLocation,
    },
  ]) {
    const sql = staffDirectorySql(
      planOrg,
      staffDirectoryQuerySchema.parse(input),
      null,
    );
    const result = await fixture.query<{
      "QUERY PLAN": Array<{
        "Execution Time": number;
        Plan: Record<string, unknown>;
      }>;
    }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql.text}`, sql.values);
    const plan = result.rows[0]!["QUERY PLAN"][0]!;
    const nodes: unknown[] = [];
    function inspect(node: Record<string, unknown>) {
      nodes.push({
        node: node["Node Type"],
        index: node["Index Name"],
        rows: node["Actual Rows"],
        loops: node["Actual Loops"],
      });
      for (const child of (node.Plans ?? []) as Record<string, unknown>[])
        inspect(child);
    }
    inspect(plan.Plan);
    measurements.push({
      scenario:
        "search" in input ? (input.role ? "combined" : "sparse") : "baseline",
      executionMs: plan["Execution Time"],
      nodes,
    });
    expect(plan["Execution Time"]).toBeGreaterThanOrEqual(0);
  }
  writeFileSync(
    join(tmpdir(), "vaylet-t05a-plans.json"),
    JSON.stringify(measurements, null, 2),
  );
});
