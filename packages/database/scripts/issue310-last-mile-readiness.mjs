import pg from "pg";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { issue310LastMileGates } from "./issue310-last-mile-gates.mjs";

const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp") {
  throw new Error("Supply only the existing isolated Issue310 private runtime directory.");
}

const entries = (filename) => Object.fromEntries(
  readFileSync(resolve(root, filename), "utf8").trim().split(/\r?\n/)
    .map((row) => {
      const equal = row.indexOf("=");
      if (equal < 1) throw new Error("Invalid isolated runtime inventory.");
      return [row.slice(0, equal), row.slice(equal + 1).trim()];
    }),
);
const compose = entries("compose.env");
const api = entries("api.env");
const sender = entries("sender.env");
const operator = JSON.parse(readFileSync(resolve(root, "operator-private.json"), "utf8"));
const pw = compose.WA310_MIGRATION_PASSWORD;
if (!pw || !/^[A-Za-z0-9_-]{32,}$/.test(pw)) {
  throw new Error("Issue310 migration identity missing.");
}

const migrationUrl = new URL("postgresql://wa310_migrate@127.0.0.1:56310/vaylet_wa310");
migrationUrl.password = pw;
const client = new pg.Client({ connectionString: migrationUrl.toString() });
const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
const count = async (sql, params = []) => (await one(sql, params)).total;
const off = (value) => value === "false";
const isHttps = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.port === "" &&
      url.pathname === "/" && !url.search && !url.hash &&
      !url.username && !url.password &&
      (value === url.origin || value === `${url.origin}/`);
  } catch { return false; }
};

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const database = await one("SELECT current_database() AS name,current_user AS principal");
    if (database.name !== "vaylet_wa310" || database.principal !== "wa310_migrate") {
      throw new Error("Isolated database identity mismatch.");
    }
    const migrations = await one(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE finished_at IS NOT NULL)::int AS finished,
      count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)::int AS incomplete
      FROM _prisma_migrations`);
    const principals = await client.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,
      rolbypassrls FROM pg_roles WHERE rolname IN
      ('wa310_api','wa310_sender','wa310_webhook','wa310_migrate')`);
    const runtime = principals.rows.filter((row) => row.rolname !== "wa310_migrate");
    const privilege = await one(`SELECT
      has_function_privilege('wa310_sender','public.outbound_confirm_dispatch(uuid,uuid,uuid,text,text)','EXECUTE') AS narrow,
      has_table_privilege('wa310_sender','public.outbound_message_intents','SELECT') AS broad`);
    const controls = await client.query(`SELECT environment,
      issue_enabled AS "issueEnabled",send_enabled AS "sendEnabled"
      FROM outbound_messaging_control ORDER BY environment`);
    const params = [operator.organization, operator.location];
    const counts = await one(`SELECT
      (SELECT count(*)::int FROM organizations) AS organizations,
      (SELECT count(*)::int FROM locations) AS locations,
      EXISTS(SELECT 1 FROM organizations WHERE id=$1) AS exact_org,
      EXISTS(SELECT 1 FROM locations WHERE id=$2 AND organization_id=$1) AS exact_location`,params);
    const bindings = await one(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE enabled AND provider_verified_at IS NOT NULL
        AND environment='test' AND waba_id='3491682417667249'
        AND phone_number_id='1426684017189271')::int AS verified
      FROM outbound_provider_bindings WHERE organization_id=$1`,[operator.organization]);
    const policies = await client.query(`SELECT location_id,enabled,language,
      provider_binding_id,template_catalog_version FROM outbound_messaging_policies
      WHERE organization_id=$1 AND purpose='INITIAL_GUEST_ACCESS'`,[operator.organization]);
    const binding = policies.rows.filter((row) => row.location_id === null)[0];
    const location = policies.rows.filter((row) => row.location_id === operator.location)[0];
    const configuredPhone = sender.OUTBOUND_META_TEST_RECIPIENT_E164;
    const key = Buffer.from(api.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64 ?? "", "base64");
    const keyVersion = api.OUTBOUND_RECIPIENT_HMAC_KEY_VERSION;
    const exactDigest = /^\+[1-9][0-9]{7,14}$/.test(configuredPhone ?? "") &&
      /^v[0-9]+$/.test(keyVersion ?? "") && key.length >= 32 &&
      key.toString("base64") === api.OUTBOUND_RECIPIENT_HMAC_KEY_BASE64
      ? `hmac:${keyVersion}:${createHmac("sha256",key)
        .update(configuredPhone).digest("base64url")}` : null;
    const grants = exactDigest === null ? 0 : await count(`SELECT count(*)::int AS total
      FROM outbound_messaging_permissions p
      JOIN LATERAL (SELECT e.action FROM outbound_permission_events e
        WHERE e.permission_id=p.id ORDER BY e.revision DESC LIMIT 1) last_event ON true
      WHERE p.organization_id=$1 AND p.recipient_digest=$2 AND p.withdrawn_at IS NULL
        AND (p.expires_at IS NULL OR p.expires_at>clock_timestamp())
        AND last_event.action='GRANT'`,[operator.organization,exactDigest]);
    const registry = (() => {
      try {
        const rows = JSON.parse(sender.OUTBOUND_APPROVED_META_TEMPLATES_JSON ?? "[]");
        return ["ar","en"].every((locale) => rows.some((item) =>
          item.organizationId === operator.organization && item.wabaId === "3491682417667249"
          && item.locale === locale && item.catalogVersion === binding?.template_catalog_version));
      } catch { return false; }
    })();
    const facts = {
      database: database.name, migrationTotal: migrations.total,
      migrationFinished: migrations.finished, migrationIncomplete: migrations.incomplete,
      principalsAreDistinct: principals.rowCount === 4 && runtime.length === 3 &&
        runtime.every((row) => !row.rolsuper && !row.rolcreatedb && !row.rolcreaterole
          && !row.rolbypassrls),
      senderHasNarrowExecute: privilege.narrow, senderHasBroadIntentSelect: privilege.broad,
      controls: controls.rows, organizationCount: counts.organizations,
      locationCount: counts.locations, exactOrganization: counts.exact_org,
      exactLocation: counts.exact_location, bindingCount: bindings.total,
      verifiedBindingCount: bindings.verified,
      companyPolicyReady: binding?.enabled === true &&
        binding?.provider_binding_id !== null && Boolean(binding?.template_catalog_version),
      locationPolicyReady: location?.enabled !== false && binding?.enabled === true,
      currentConsentCount: grants, templateRegistryComplete: registry,
      cleanHttpsOrigin: isHttps(sender.GUEST_ACCESS_MESSAGE_ORIGIN),
      localActivationOff: off(api.GUEST_ACCESS_AUTO_ISSUE_ENABLED) &&
        off(sender.OUTBOUND_MESSAGING_SEND_ENABLED) &&
        off(sender.OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED) &&
        sender.META_WHATSAPP_TEST_TOKEN_REVOKED === "true",
    };
    const assessment = issue310LastMileGates(facts);
    console.log("Issue310 readiness (no secrets, recipient digests, or phone values):");
    for (const [gate, result] of Object.entries(assessment.gates)) {
      console.log(`  ${gate}: ${result}`);
    }
    console.log(`Classification: ${assessment.classification}`);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}
await main();
