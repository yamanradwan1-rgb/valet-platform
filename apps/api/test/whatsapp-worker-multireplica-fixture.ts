import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";

export interface WaPgClaim {
  delivery_id: string;
  lease_token: string;
  lease_expires_at: Date;
}

export interface WaPgPermit {
  attempt_id: string;
  callback_handle: string;
  phone_normalized: string;
}

export interface WaPgSeed {
  org: string;
  location: string;
  member: string;
  binding: string;
  policy: string;
  session: string;
  permission: string;
  digest: string;
  intent: string;
  delivery: string;
}

const root = resolve(process.env.W4_SQL_SOURCE_ROOT ?? join(process.cwd(), "../.."));
const migrations = join(root, "packages/database/prisma/migrations");
const baseUrl = process.env.TEST_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const parsed = new URL(baseUrl);
export const waPgAvailable = ["localhost", "127.0.0.1"].includes(parsed.hostname)
  && existsSync(join(migrations, "20261015008900_outbound_callback_and_suppression_fences"));

/** Real, independent PostgreSQL connections represent separate worker replicas. */
export class WaPgMultiReplicaFixture {
  private readonly database = `outbound_w4_replicas_${randomUUID().replaceAll("-", "")}`;
  private bootstrap?: Client;
  readonly replicas: Client[] = [];
  private created = false;

  async open(): Promise<void> {
    this.bootstrap = new Client({ connectionString: baseUrl });
    await this.bootstrap.connect();
    await this.bootstrap.query(`CREATE DATABASE "${this.database}"`);
    this.created = true;
    const url = new URL(baseUrl);
    url.pathname = `/${this.database}`;
    for (let replica = 0; replica < 3; replica++) {
      const client = new Client({ connectionString: url.toString() });
      await client.connect();
      this.replicas.push(client);
    }
    const names = (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const name of names) {
      const sql = await readFile(join(migrations, name, "migration.sql"), "utf8");
      await this.replicas[2]!.query(sql);
    }
    await this.replicas[2]!.query(
      "UPDATE outbound_messaging_control SET send_enabled=true WHERE environment='test'");
  }

  async close(): Promise<void> {
    for (const client of this.replicas) await client.end().catch(() => {});
    if (this.bootstrap) {
      if (this.created) {
        await this.bootstrap.query(`DROP DATABASE "${this.database}" WITH (FORCE)`);
      }
      await this.bootstrap.end();
    }
  }

  async seed(): Promise<WaPgSeed> {
    const db = this.replicas[2]!;
    const org = randomUUID(), user = randomUUID(), member = randomUUID();
    const location = randomUUID(), bindingKey = randomUUID();
    await db.query(`INSERT INTO organizations(id,name,status,timezone,updated_at)
      VALUES($1,'W4 Synthetic','ACTIVE','Asia/Amman',clock_timestamp())`, [org]);
    await db.query(`INSERT INTO users(id,email,password_hash,status,updated_at)
      VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`, [user, `${user}@example.invalid`]);
    await db.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,
      status,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [member, org, user]);
    await db.query(`INSERT INTO locations(id,organization_id,name,code,address_text,
      timezone,currency,updated_at)
      VALUES($1,$2,'W4 Replica',$3,'Synthetic','Asia/Amman','JOD',clock_timestamp())`,
    [location, org, `WA-MR-${location.slice(0, 8)}`]);
    const { rows: bindings } = await db.query<{ id: string }>(`
      INSERT INTO outbound_provider_bindings(organization_id,environment,waba_id,
        phone_number_id,config_alias,enabled,provider_verified_at,provider_evidence_reference)
      VALUES($1,'test',$2,$3,'sandbox',true,clock_timestamp(),'verified-test-account')
      RETURNING id`, [org, `waba-${bindingKey}`, `phone-${bindingKey}`]);
    const binding = bindings[0]!.id;
    await db.query("INSERT INTO outbound_message_budgets(provider_binding_id) VALUES($1)",
      [binding]);
    const { rows: policies } = await db.query<{ id: string }>(`
      INSERT INTO outbound_messaging_policies(organization_id,purpose,enabled,language,
        provider_binding_id,template_catalog_version)
      VALUES($1,'INITIAL_GUEST_ACCESS',true,'en',$2,'test-template-v1') RETURNING id`,
    [org, binding]);
    const policy = policies[0]!.id;
    const item = await this.addDelivery({ org, member, location, binding, policy });
    return { org, member, location, binding, policy, ...item };
  }

  /** Additional job under the same provider budget; unique session and opt-in. */
  async addDelivery(scope: Pick<WaPgSeed, "org" | "member" | "location" | "binding" | "policy">):
    Promise<Pick<WaPgSeed, "session" | "permission" | "digest" | "intent" | "delivery">> {
    const db = this.replicas[2]!;
    const { org, member, location, binding, policy } = scope;
    const customer = randomUUID(), vehicle = randomUUID(), session = randomUUID();
    const digest = `hmac:v1:${Buffer.from(randomUUID().replaceAll("-", "")).toString("base64url")}`;
    await db.query(`INSERT INTO customers(id,organization_id,phone_normalized,updated_at)
      VALUES($1,$2,$3,clock_timestamp())`,
    [customer, org, `+1555${Math.floor(Math.random() * 8999999 + 1000000)}`]);
    await db.query(`INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
      VALUES($1,$2,'W4 Synthetic',clock_timestamp())`, [vehicle, org]);
    await db.query(`INSERT INTO valet_sessions(id,organization_id,location_id,vehicle_id,
      customer_id,customer_access_token_hash,customer_access_expires_at,
      customer_access_generation,state,checked_in_by_membership_id,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day',1,
        'CHECKING_IN',$7,clock_timestamp())`,
    [session, org, location, vehicle, customer, `sha256:v1:${"a".repeat(64)}`, member]);
    const { rows: permissions } = await db.query<{ id: string }>(`
      SELECT outbound_permission_change($1,$2,'synthetic-optin-proof',
        clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '1 hour',
        0,'GRANT') AS id`, [org, digest]);
    const permission = permissions[0]!.id;
    const { rows: intents } = await db.query<{ id: string; expires_at: Date }>(`
      INSERT INTO outbound_message_intents(organization_id,location_id,valet_session_id,
        customer_id,credential_generation,recipient_digest,permission_id,permission_revision,
        policy_id,policy_revision,company_policy_revision,provider_binding_id,binding_revision,
        template_catalog_version,language,expires_at)
      VALUES($1,$2,$3,$4,1,$5,$6,1,$7,1,1,$8,1,'test-template-v1','en',
        clock_timestamp()+interval '20 minutes') RETURNING id,expires_at`,
    [org, location, session, customer, digest, permission, policy, binding]);
    const item = intents[0]!;
    const { rows: deliveries } = await db.query<{ id: string }>(`
      INSERT INTO outbound_message_deliveries(organization_id,intent_id,next_attempt_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`, [org, item.id]);
    const delivery = deliveries[0]!.id;
    const aad = Buffer.from(JSON.stringify({
      version: 1, organizationId: org, locationId: location,
      sessionId: session, customerId: customer, intentId: item.id,
      credentialGeneration: 1, recipientDigest: digest,
      expiresAt: new Date(item.expires_at).toISOString(),
    }));
    await db.query(`INSERT INTO outbound_message_envelopes(
      organization_id,intent_id,ciphertext,aad_label,key_version,purge_at)
      VALUES($1,$2,$3,$4,'synthetic-w4-key',$5)`,
    [org, item.id, Buffer.alloc(384, 17), aad, item.expires_at]);
    return { session, permission, digest, intent: item.id, delivery };
  }

  async claim(index: 0 | 1, limit = 1): Promise<WaPgClaim[]> {
    const { rows } = await this.replicas[index]!.query<WaPgClaim>(
      "SELECT * FROM outbound_claim_due($1)", [limit]);
    return rows;
  }

  async permit(index: 0 | 1, seed: Pick<WaPgSeed, "digest" | "delivery">, claim: WaPgClaim):
    Promise<WaPgPermit> {
    const { rows } = await this.replicas[index]!.query<WaPgPermit>(
      "SELECT * FROM outbound_dispatch_permit($1,$2,$3)",
      [seed.delivery, claim.lease_token, seed.digest]);
    return rows[0]!;
  }
}
