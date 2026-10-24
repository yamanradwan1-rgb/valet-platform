import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import pg from "pg";

const root = process.env.WA310_PRIVATE_RUNTIME_DIR;
if (!root || basename(resolve(root)) !== "wa310-runtime" ||
    basename(dirname(resolve(root))) !== "tmp" ||
    process.argv[2] !== "--verify-live-meta-ownership") {
  throw new Error("Use only the authenticated Issue310 Meta verification operator mode.");
}

const operator = JSON.parse(readFileSync(resolve(root, "operator-private.json"), "utf8"));
const organizationId = "5072955f-f323-448f-8d7d-bd0d3e6bd0b4";
const locationId = "ac34adc7-1d76-42cb-af29-fef22feaa909";
if (operator.organization !== organizationId || operator.location !== locationId) {
  throw new Error("The private operator inventory does not match Issue310.");
}

// The bearer credential is read and used inside the isolated sender container.
// Docker returns only bounded, non-secret Meta Graph verification facts.
let rawProof;
try {
  rawProof = execFileSync("docker", ["exec", "vaylet-wa310-sender-1", "node",
    "deploy/issue310/meta-sandbox-graph-proof.mjs"], {
    encoding: "utf8", timeout: 35_000, maxBuffer: 8_192,
    windowsHide: true,
  });
} catch {
  throw new Error("Sender-side authenticated Meta Graph ownership proof did not pass.");
}

let proof;
try { proof = JSON.parse(rawProof); } catch {
  throw new Error("The sender did not return a valid scoped Meta proof.");
}
const age = Date.now() - Date.parse(proof?.verifiedAt ?? "");
if (proof?.version !== "wa310-meta-graph-evidence-v1" ||
    proof.wabaId !== "3491682417667249" ||
    proof.phoneNumberId !== "1426684017189271" ||
    proof.catalogVersion !== "meta_guest_access_20261024" ||
    JSON.stringify(proof.templateIds) !==
      JSON.stringify(["2003500221022564", "28615795824783341"]) ||
    !Number.isFinite(age) || age < -10_000 || age > 120_000) {
  throw new Error("The Meta proof does not attest the exact fresh Issue310 sandbox assets.");
}
const fingerprint = createHash("sha256")
  .update(JSON.stringify(proof)).digest("hex").slice(0, 32);
const evidenceReference = `wa310-meta-graph-v26-${fingerprint}`;

const compose = Object.fromEntries(readFileSync(resolve(root, "compose.env"), "utf8")
  .trim().split(/\r?\n/).map((row) => {
    const equal = row.indexOf("=");
    if (equal < 1) throw new Error("Malformed isolated database credential inventory.");
    return [row.slice(0, equal), row.slice(equal + 1)];
  }));
const password = compose.WA310_MIGRATION_PASSWORD;
if (!/^[A-Za-z0-9_-]{32,}$/.test(password ?? "")) {
  throw new Error("The authorized isolated maintenance principal is not available.");
}
const database = new URL("postgresql://wa310_migrate@127.0.0.1:56310/vaylet_wa310");
database.password = password;

const client = new pg.Client({ connectionString: database.toString() });
await client.connect();
try {
  await client.query("BEGIN");
  const identity = (await client.query(
    "SELECT current_database() AS db,current_user AS principal",
  )).rows[0];
  if (identity?.db !== "vaylet_wa310" || identity?.principal !== "wa310_migrate") {
    throw new Error("Provider verification is not running on the isolated maintenance principal.");
  }
  const controls = await client.query(`SELECT environment FROM outbound_messaging_control
    WHERE issue_enabled=false AND send_enabled=false`);
  if (controls.rowCount !== 2) throw new Error("Durable production/test controls must be OFF.");
  const binding = await client.query(`SELECT id::text,revision FROM outbound_provider_bindings
    WHERE organization_id=$1 AND provider='META_CLOUD' AND environment='test'
      AND purpose='INITIAL_GUEST_ACCESS' AND waba_id=$2 AND phone_number_id=$3
      AND config_alias='wa310-meta-sandbox' AND enabled=false
      AND provider_verified_at IS NULL AND provider_evidence_reference IS NULL
    FOR UPDATE`, [organizationId, proof.wabaId, proof.phoneNumberId]);
  if (binding.rowCount !== 1) throw new Error("No matching pending, still-disabled Meta binding.");
  const id = binding.rows[0].id;
  const initiated = await client.query(`SELECT 1 FROM audit_events e
    INNER JOIN organization_memberships m ON m.id=e.actor_membership_id
     AND m.organization_id=e.organization_id
    WHERE e.organization_id=$1 AND e.entity_id=$2 AND e.actor_type='MEMBERSHIP'
      AND e.event_type='WHATSAPP_SANDBOX_BINDING_REQUESTED'
      AND m.role='ORG_ADMIN' AND m.status='ACTIVE'
      AND e.occurred_at > clock_timestamp() - interval '7 days'
    LIMIT 1`, [organizationId, id]);
  if (initiated.rowCount !== 1) {
    throw new Error("The pending binding lacks an authenticated Company Admin request audit.");
  }
  const update = await client.query(`UPDATE outbound_provider_bindings
    SET enabled=true,provider_verified_at=clock_timestamp(),
        provider_evidence_reference=$2,revision=revision+1,updated_at=clock_timestamp()
    WHERE id=$1 AND enabled=false AND provider_verified_at IS NULL
    RETURNING id`, [id, evidenceReference]);
  if (update.rowCount !== 1) throw new Error("Concurrent Meta binding verification was denied.");
  await client.query(`INSERT INTO audit_events
    (id,organization_id,actor_type,controlled_operator_ref,event_type,
     entity_type,entity_id,metadata_json,occurred_at)
    VALUES($1,$2,'CONTROLLED_OPERATOR','WA310_VERIFIED_META_GRAPH_V26',
      'WHATSAPP_SANDBOX_META_VERIFIED','OutboundProviderBinding',$3,$4::jsonb,
      clock_timestamp())`, [randomUUID(),organizationId,id,JSON.stringify({
      provider: "META_CLOUD",environment:"test",verified:true,
      enabled:true,graphVersion:"v26.0",evidenceReference,
    })]);
  await client.query("COMMIT");
  console.log(`Verified one audited sandbox binding: ${id} (Graph proof only).`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
