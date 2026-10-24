import pg from "pg";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp") {
  throw new Error("Provide only the isolated Issue310 private runtime directory.");
}
const values = Object.fromEntries(readFileSync(resolve(root, "compose.env"), "utf8")
  .trim().split(/\r?\n/).map((line) => {
    const pos = line.indexOf("=");
    if (pos < 1) throw new Error("Invalid Issue310 private runtime format.");
    return [line.slice(0, pos), line.slice(pos + 1)];
  }));
const url = new URL("postgresql://wa310_migrate@127.0.0.1:56310/vaylet_wa310");
url.password = values.WA310_MIGRATION_PASSWORD ?? "";
if (!/^[A-Za-z0-9_-]{32,}$/.test(url.password)) {
  throw new Error("Isolated migration principal credential is missing.");
}

const organizationId = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
const locationId = "ac34adc7-1d76-42cb-af29-fef22feaa909";
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query("BEGIN");
  const identity = (await client.query(
    "SELECT current_database() AS db,current_user AS principal",
  )).rows[0];
  if (identity?.db !== "vaylet_wa310" || identity?.principal !== "wa310_migrate") {
    throw new Error("The migration connection is outside the approved isolated database.");
  }
  const scope = (await client.query(`SELECT
    (SELECT count(*)::int FROM organizations) AS organizations,
    (SELECT count(*)::int FROM locations) AS locations,
    EXISTS(SELECT 1 FROM organizations WHERE id=$1 AND status='ACTIVE') AS organization,
    EXISTS(SELECT 1 FROM locations WHERE id=$2 AND organization_id=$1
      AND status='ACTIVE') AS location`, [organizationId, locationId])).rows[0];
  if (scope?.organizations !== 1 || scope?.locations !== 1 ||
      !scope.organization || !scope.location) {
    throw new Error("The one-tenant Issue310 scope is not independently attested.");
  }
  const controls = await client.query(
    "SELECT environment FROM outbound_messaging_control WHERE issue_enabled=false AND send_enabled=false",
  );
  if (controls.rowCount !== 2) throw new Error("Issue310 send controls are not all OFF.");
  const existing = await client.query(
    `SELECT plan_code,status,dashboard_access_enabled,report_exports_enabled,
      basic_branding_enabled FROM organization_subscriptions
     WHERE organization_id=$1 FOR UPDATE`, [organizationId],
  );
  if (existing.rowCount === 0) {
    await client.query(`INSERT INTO organization_subscriptions
      (organization_id,plan_code,status,dashboard_access_enabled,
       report_exports_enabled,basic_branding_enabled)
      VALUES($1,'WA310_LOCAL_SANDBOX','ACTIVE',TRUE,FALSE,FALSE)`, [organizationId]);
    console.log("Isolated Issue310 dashboard entitlement: PROVISIONED");
  } else {
    const prior = existing.rows[0];
    if (prior.plan_code !== "WA310_LOCAL_SANDBOX" ||
        prior.status !== "ACTIVE" || prior.dashboard_access_enabled !== true ||
        prior.report_exports_enabled !== false || prior.basic_branding_enabled !== false) {
      throw new Error("Existing Issue310 subscription differs; refusing to replace it.");
    }
    console.log("Isolated Issue310 dashboard entitlement: ALREADY_CORRECT");
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
