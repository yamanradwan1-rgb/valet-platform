import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** W4 may point at W1's isolated migration tree until Prime integrates it. */
const repo = resolve(process.env.W4_SQL_SOURCE_ROOT ?? join(process.cwd(), "../.."));
const migrationRoot = join(repo, "packages/database/prisma/migrations");
const ready = existsSync(join(migrationRoot, "20261015008800_outbound_webhook_recovery_functions"));

const base = process.env.TEST_DATABASE_URL ?? "postgresql://valet:valet@127.0.0.1:5432/valet";
const target = new URL(base);
const database = `outbound_w4_${randomUUID().replaceAll("-", "")}`;
const hostnameAllowed = ["localhost", "127.0.0.1"].includes(target.hostname);
target.pathname = `/${database}`;

describe.runIf(ready && hostnameAllowed)("WhatsApp signed callback-first recovery on real PostgreSQL", () => {
  let bootstrap: Client;
  let db: Client;
  let created = false;

  beforeAll(async () => {
    bootstrap = new Client({ connectionString: base });
    await bootstrap.connect();
    await bootstrap.query(`CREATE DATABASE "${database}"`);
    created = true;
    db = new Client({ connectionString: target.toString() });
    await db.connect();
    const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const migration of migrations) {
      // Test-only RED reproduction against the pre-fix 088 migration chain.
      if (process.env.W4_SQL_OMIT_FIX_089 === "true" &&
        migration.startsWith("20261015008900_")) continue;
      const sql = await readFile(join(migrationRoot, migration, "migration.sql"), "utf8");
      await db.query(sql);
    }
  }, 120_000);

  afterAll(async () => {
    if (db) await db.end();
    if (bootstrap) {
      if (created) await bootstrap.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      await bootstrap.end();
    }
  }, 30_000);

  it("never retries a dispatch after a verified DELIVERED callback, even if HTTP says nonacceptance", async () => {
    const org = randomUUID();
    const user = randomUUID();
    const member = randomUUID();
    const customer = randomUUID();
    const location = randomUUID();
    const vehicle = randomUUID();
    const visit = randomUUID();
    const digest = `hmac:v1:${"A".repeat(48)}`;
    await db.query(`INSERT INTO organizations(id,name,status,timezone,updated_at)
      VALUES($1,'W4 Callback','ACTIVE','Asia/Amman',clock_timestamp())`, [org]);
    await db.query(`INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [user, `${user}@example.invalid`]);
    await db.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,
      status,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [member, org, user]);
    await db.query(`INSERT INTO locations(id,organization_id,name,code,address_text,
      timezone,currency,updated_at)
      VALUES($1,$2,'Callback First',$3,'Synthetic','Asia/Amman','JOD',clock_timestamp())`,
    [location, org, `WA-CB-${location.slice(0, 6)}`]);
    await db.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
      VALUES($1,$2,'Synthetic Callback',clock_timestamp())`, [vehicle, org]);
    await db.query(`INSERT INTO customers(id,organization_id,phone_normalized,updated_at)
      VALUES($1,$2,'+15555550199',clock_timestamp())`, [customer, org]);
    await db.query(`INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
      customer_id,customer_access_token_hash,customer_access_expires_at,
      customer_access_generation,state,checked_in_by_membership_id,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
      'CHECKING_IN',$7,clock_timestamp())`,
    [visit, org, location, vehicle, customer, `sha256:v1:${"c".repeat(64)}`, member]);
    const { rows: bindings } = await db.query<{ id: string }>(`
      INSERT INTO outbound_provider_bindings(organization_id,environment,waba_id,
      phone_number_id,config_alias,enabled,provider_verified_at,provider_evidence_reference)
      VALUES($1,'test','waba-synthetic','number-synthetic','sandbox',true,
        clock_timestamp(),'verified-test-account') RETURNING id`, [org]);
    const binding = bindings[0]!.id;
    await db.query("INSERT INTO outbound_message_budgets(provider_binding_id) VALUES($1)",
      [binding]);
    const { rows: policies } = await db.query<{ id: string }>(`
      INSERT INTO outbound_messaging_policies(organization_id,purpose,enabled,language,
        provider_binding_id,template_catalog_version)
      VALUES($1,'INITIAL_GUEST_ACCESS',true,'en',$2,'test-template-v1') RETURNING id`,
    [org, binding]);
    const policy = policies[0]!.id;
    const { rows: permissions } = await db.query<{ id: string }>(`
      SELECT outbound_permission_change($1,$2,'synthetic-optin-proof',
        clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '1 hour',
        0,'GRANT') AS id`, [org, digest]);
    const permission = permissions[0]!.id;
    await db.query("UPDATE outbound_messaging_control SET send_enabled=true WHERE environment='test'");

    const { rows: intents } = await db.query<{ id: string; expires_at: Date }>(`
      INSERT INTO outbound_message_intents(organization_id,location_id,valet_session_id,
      customer_id,credential_generation,recipient_digest,permission_id,permission_revision,
      policy_id,policy_revision,company_policy_revision,provider_binding_id,binding_revision,
      template_catalog_version,language,expires_at)
      VALUES($1,$2,$3,$4,1,$5,$6,1,$7,1,1,$8,1,'test-template-v1','en',
        clock_timestamp()+interval '20 minutes') RETURNING id,expires_at`,
    [org, location, visit, customer, digest, permission, policy, binding]);
    const intent = intents[0]!;
    const { rows: deliveries } = await db.query<{ id: string }>(`
      INSERT INTO outbound_message_deliveries(organization_id,intent_id,next_attempt_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`, [org, intent.id]);
    const delivery = deliveries[0]!.id;
    const aad = Buffer.from(JSON.stringify({
      version: 1, organizationId: org, locationId: location,
      sessionId: visit, customerId: customer, intentId: intent.id,
      credentialGeneration: 1, recipientDigest: digest,
      expiresAt: new Date(intent.expires_at).toISOString(),
    }));
    await db.query(`INSERT INTO outbound_message_envelopes(
      organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
      VALUES($1,$2,$3,$4,'synthetic-w4-key',$5)`,
    [org, intent.id, Buffer.alloc(384, 9), aad, intent.expires_at]);

    const { rows: claims } = await db.query<{ delivery_id: string; lease_token: string }>(
      "SELECT * FROM outbound_claim_due(10)");
    const claim = claims.find((row) => row.delivery_id === delivery);
    expect(claim).toBeDefined();
    const { rows: permits } = await db.query<{
      attempt_id: string; callback_handle: string;
    }>("SELECT * FROM outbound_dispatch_permit($1,$2,$3)",
    [delivery, claim!.lease_token, digest]);
    const permit = permits[0]!;
    expect(permit).toBeDefined();

    const callback = await db.query<{ ok: boolean }>(`
      SELECT outbound_record_provider_event($1,$2,$3,$4,'DELIVERED',
        clock_timestamp(),$5,NULL) AS ok`,
    [binding, permit.callback_handle, "wamid.callback-first-w4", digest, "b".repeat(64)]);
    expect(callback.rows[0]?.ok).toBe(true);
    await db.query("SELECT outbound_finish_attempt($1,$2,$3,'DEFINITIVE_FAILURE',NULL,'RATE_LIMIT')",
      [delivery, claim!.lease_token, permit.attempt_id]);

    const { rows: states } = await db.query<{
      state: string; delivered_at: Date | null; envelope_count: string;
    }>(`SELECT state,delivered_at,
      (SELECT count(*)::text FROM outbound_message_envelopes WHERE intent_id=$2) AS envelope_count
      FROM outbound_message_deliveries WHERE id=$1`, [delivery, intent.id]);
    expect(states[0]?.delivered_at).toBeInstanceOf(Date);
    expect(states[0]?.state).not.toBe("RETRY_WAIT");
    expect(states[0]?.envelope_count).toBe("0");
    const { rows: repeat } = await db.query<{ delivery_id: string }>(
      "SELECT * FROM outbound_claim_due(10)");
    expect(repeat.some((row) => row.delivery_id === delivery)).toBe(false);
  }, 120_000);
});
