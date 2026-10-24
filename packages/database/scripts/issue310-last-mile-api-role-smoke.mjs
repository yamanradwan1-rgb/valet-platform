import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import pg from "pg";

const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp") {
  throw new Error("Use only the existing Issue310 private runtime inventory.");
}
const entry = (name) => Object.fromEntries(
  readFileSync(resolve(root, name), "utf8").trim().split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf("=");
      if (i < 1) throw new Error("Invalid isolated runtime inventory.");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const url = entry("api.env").DATABASE_URL;
const parsed = url && new URL(url);
if (!parsed || parsed.hostname !== "postgres" || parsed.port !== "5432" ||
    parsed.pathname !== "/vaylet_wa310" || parsed.username !== "wa310_api") {
  throw new Error("Dedicated Issue310 API database identity is not attested.");
}
const operator = JSON.parse(readFileSync(resolve(root, "operator-private.json"), "utf8"));
parsed.hostname = "127.0.0.1";
parsed.port = "56310";
const connection = new pg.Client({ connectionString: parsed.toString() });
const scalar = async (sql, args = []) => (await connection.query(sql, args)).rows[0];

await connection.connect();
try {
  await connection.query("BEGIN");
  try {
    const identity = await scalar(`SELECT current_database() AS db,current_user AS principal,
      (SELECT count(*)::int FROM organizations) AS orgs,
      (SELECT count(*)::int FROM locations) AS locations,
      (SELECT count(*)::int FROM outbound_provider_bindings) AS bindings,
      (SELECT count(*)::int FROM outbound_messaging_permissions) AS grants`);
    if (identity.db !== "vaylet_wa310" || identity.principal !== "wa310_api" ||
        identity.orgs !== 1 || identity.locations !== 1) {
      throw new Error("Issue310 API role/tenant scope mismatch.");
    }
    const enabled = await scalar(`SELECT count(*)::int AS enabled FROM outbound_messaging_control
      WHERE issue_enabled OR send_enabled`);
    if (enabled.enabled !== 0) throw new Error("Test/production outbound controls are not OFF.");
    const acl = await scalar(`SELECT
      has_function_privilege(current_user,
        'public.outbound_permission_change(uuid,text,text,timestamptz,timestamptz,integer,text)',
        'EXECUTE') AS consent,
      has_column_privilege(current_user,'public.outbound_provider_bindings',
        'provider_verified_at','INSERT') AS forge_insert,
      has_column_privilege(current_user,'public.outbound_provider_bindings',
        'provider_verified_at','UPDATE') AS forge_update,
      has_column_privilege(current_user,'public.outbound_provider_bindings',
        'organization_id','INSERT') AS pending_insert,
      has_table_privilege(current_user,'public.outbound_permission_events',
        'SELECT') AS event_select`);
    if (!acl.consent || !acl.pending_insert || acl.forge_insert ||
        acl.forge_update || acl.event_select) {
      throw new Error("API consent/onboarding SQL grants violate least privilege.");
    }

    const bindingId = randomUUID();
    const binding = await scalar(`INSERT INTO outbound_provider_bindings
      (id,organization_id,purpose,provider,environment,waba_id,phone_number_id,config_alias)
      VALUES ($1,$2,'INITIAL_GUEST_ACCESS','META_CLOUD','test',$3,$4,'wa310-meta-sandbox')
      RETURNING enabled,provider_verified_at AS verified,provider_evidence_reference AS evidence`,
    [bindingId,operator.organization,"3491682417667249","1426684017189271"]);
    if (binding.enabled !== false || binding.verified !== null || binding.evidence !== null) {
      throw new Error("Pending sandbox binding gained verification authority.");
    }

    const digest = `hmac:v1:${randomBytes(32).toString("base64url")}`;
    const evidence = "wa310-opt-in-disposable-rollback-only";
    const call = `SELECT outbound_permission_change($1::uuid,$2::text,$3::text,
      CASE WHEN $5::text='GRANT' THEN clock_timestamp()-interval '1 second'
        ELSE NULL::timestamptz END,
      CASE WHEN $5::text='GRANT' THEN clock_timestamp()+interval '7 days'
        ELSE NULL::timestamptz END,$4::integer,$5::text)::text AS id`;
    const first = await scalar(call,[operator.organization,digest,evidence,0,"GRANT"]);
    const granted = await scalar(`SELECT revision,withdrawn_at AS withdrawn FROM
      outbound_messaging_permissions WHERE id=$1::uuid`,[first.id]);
    if (granted.revision !== 1 || granted.withdrawn !== null) {
      throw new Error("First consent revision does not match SQL contract.");
    }
    const second = await scalar(call,[operator.organization,digest,evidence,1,"WITHDRAW"]);
    const withdrawn = await scalar(`SELECT revision,withdrawn_at AS withdrawn FROM
      outbound_messaging_permissions WHERE id=$1::uuid`,[second.id]);
    if (first.id !== second.id || withdrawn.revision !== 2 ||
        !withdrawn.withdrawn) {
      throw new Error("Withdrawal did not apply the next revision.");
    }
    await connection.query("SAVEPOINT stale_revision");
    let staleDenied = false;
    try { await scalar(call,[operator.organization,digest,evidence,1,"WITHDRAW"]); }
    catch (error) { staleDenied = error.code === "40001"; }
    await connection.query("ROLLBACK TO SAVEPOINT stale_revision");
    if (!staleDenied) throw new Error("Stale consent revision was not rejected.");
    console.log("PASS: Issue310 API-only pending binding, no forged verification privileges.");
    console.log("PASS: synthetic SQL GRANT/WITHDRAW, revisions, stale replay denied; event SELECT denied.");
    console.log("All writes are inside one rollback-only transaction; no consent is recorded.");
  } finally { await connection.query("ROLLBACK"); }
} finally { await connection.end(); }
