import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import pg from "pg";

const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp") {
  throw new Error("Issue310 protected runtime identity is required.");
}

const entries = (filename) => Object.fromEntries(readFileSync(resolve(root, filename), "utf8")
  .trim().split(/\r?\n/).map((line) => {
    const index = line.indexOf("=");
    if (index < 1) throw new Error("Malformed private Issue310 configuration.");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
const compose = entries("compose.env");
const api = entries("api.env");
const sender = entries("sender.env");
const operator = JSON.parse(readFileSync(resolve(root, "operator-private.json"), "utf8"));
const organizationId = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
const locationId = "ac34adc7-1d76-42cb-af29-fef22feaa909";
const recipient = sender.OUTBOUND_META_TEST_RECIPIENT_E164;
if (operator.organization !== organizationId || operator.location !== locationId ||
    !operator.customer || !operator.employee ||
    !/^\+9627\d{8}$/.test(recipient ?? "") ||
    recipient !== api.OUTBOUND_META_TEST_RECIPIENT_E164 ||
    !/^[-_A-Za-z0-9]{32,}$/.test(compose.WA310_MIGRATION_PASSWORD ?? "")) {
  throw new Error("Exact staff/customer/recipient or migration scope is unavailable.");
}

const url = new URL("postgresql://wa310_migrate@127.0.0.1:56310/vaylet_wa310");
url.password = compose.WA310_MIGRATION_PASSWORD;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
try {
  await db.query("BEGIN READ ONLY");
  const identity = (await db.query("SELECT current_database() AS db,current_user AS role")).rows[0];
  if (identity.db !== "vaylet_wa310" || identity.role !== "wa310_migrate") {
    throw new Error("The requested database is outside the new isolated sandbox.");
  }
  const scope = (await db.query(`SELECT
    (SELECT count(*)::int FROM organizations) AS orgs,
    (SELECT count(*)::int FROM locations) AS locations,
    (SELECT count(*)::int FROM customers WHERE organization_id=$1 AND phone_normalized=$3) AS matching_customers,
    EXISTS(SELECT 1 FROM locations WHERE id=$2 AND organization_id=$1
      AND status='ACTIVE' AND accepting_intake) AS location,
    EXISTS(SELECT 1 FROM organization_memberships m JOIN users u ON u.id=m.user_id
      JOIN membership_location_access a ON a.membership_id=m.id AND a.organization_id=m.organization_id
      WHERE m.id=$4 AND m.organization_id=$1 AND m.role='VALET_EMPLOYEE'
        AND m.status='ACTIVE' AND u.status='ACTIVE' AND a.location_id=$2) AS employee,
    (SELECT count(*)::int FROM outbound_message_intents WHERE organization_id=$1) AS intents,
    (SELECT count(*)::int FROM outbound_message_deliveries WHERE organization_id=$1) AS deliveries,
    (SELECT count(*)::int FROM outbound_messaging_control
      WHERE issue_enabled=false AND send_enabled=false) AS off_controls,
    EXISTS(SELECT 1 FROM outbound_provider_bindings
      WHERE organization_id=$1 AND provider='META_CLOUD' AND environment='test'
        AND purpose='INITIAL_GUEST_ACCESS' AND enabled=true AND provider_verified_at IS NOT NULL
        AND waba_id='3491682417667249' AND phone_number_id='1426684017189271') AS verified_binding`,
  [organizationId, locationId, recipient, operator.employeeMembership])).rows[0];
  const checks = {
    singleOrganization: scope.orgs === 1,
    singleLocation: scope.locations === 1,
    unambiguousAuthorizedCustomer: scope.matching_customers <= 1,
    acceptingLocation: scope.location,
    authorizedEmployee: scope.employee,
    noExistingIntent: scope.intents === 0,
    noExistingDelivery: scope.deliveries === 0,
    bothControlsOff: scope.off_controls === 2,
    verifiedBinding: scope.verified_binding,
  };
  const missing = Object.entries(checks).filter(([, pass]) => pass !== true)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`One-send readiness failed: ${missing.join(", ")}.`);
  }
  await db.query("ROLLBACK");
} finally {
  await db.end();
}

const login = await fetch("http://127.0.0.1:33110/v1/staff/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "http://127.0.0.1:33113" },
  body: JSON.stringify(operator.employee),
  signal: AbortSignal.timeout(10_000),
});
if (!login.ok) throw new Error(`Authorized Issue310 employee login failed HTTP ${login.status}.`);
const authenticated = await login.json();
if (!/^vsa1\.[A-Za-z0-9_-]{43}$/.test(authenticated.accessToken ?? "")) {
  throw new Error("Employee login did not return a valid scoped session.");
}
console.log("PASS: exact isolated tenant/location, unambiguous consented recipient, zero prior intents.");
console.log("PASS: active authorized employee, genuine employee login, verified test-only binding.");
console.log("PASS: both durable environments OFF; one-send preflight is read-only.");
