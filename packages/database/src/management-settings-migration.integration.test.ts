import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migration = "20260916003800_mgt_be_05_company_settings_branding";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const databaseName = `valet_mgt_be05_migration_${randomUUID().replaceAll("-", "")}`;
const ids = {
  audit: randomUUID(),
  location: randomUUID(),
  membership: randomUUID(),
  organization: randomUUID(),
  user: randomUUID(),
};
let client: Client;

function scopedUrl(): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function apply(name: string): Promise<void> {
  const sql = await readFile(new URL(`${name}/migration.sql`, migrationRoot), "utf8");
  await client.query(sql);
}

async function expectPgError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL error ${code}.`);
  } catch (error) {
    expect((error as PgError).code).toBe(code);
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  client = new Client({ connectionString: scopedUrl() });
  await client.connect();
  for (const name of expectedMigrationDirectories.slice(0, migrationIndex)) await apply(name);

  await client.query(
    `INSERT INTO organizations(
       id,name,status,timezone,check_in_photos_required,handoff_standard_method_policy,
       tracking_enabled,raw_gps_retention_days,valet_service_fee,payment_service_payer,
       payment_methods_policy,tips_enabled,validation_enabled,release_requires_payment,
       brand_primary_color,updated_at)
     VALUES($1,'Existing Company','ACTIVE','Asia/Amman',true,'PICKUP_CODE',true,45,
            12.345,'VENUE','CASH_OR_DIGITAL',true,true,true,'#ABCDEF',
            '2026-09-16T12:00:00.000Z')`,
    [ids.organization],
  );
  await client.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,status,
       check_in_photos_required_override,handoff_standard_method_policy_override,
       tracking_enabled_override,raw_gps_retention_days_override,valet_service_fee_override,
       payment_service_payer_override,payment_methods_policy_override,tips_enabled_override,
       validation_enabled_override,release_requires_payment_override,
       brand_display_name_override,brand_primary_color_override,updated_at)
     VALUES($1,$2,'Existing Location',$3,'Address','Asia/Amman','JOD','ACTIVE',false,
            'DYNAMIC_QR',false,17,2.500,'CUSTOMER','DIGITAL_ONLY',false,false,false,
            'Existing Venue','#112233','2026-09-16T12:00:01.000Z')`,
    [ids.location, ids.organization, `MGT05-${ids.location}`],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'test-hash','ACTIVE',transaction_timestamp())`,
    [ids.user, `${ids.user}@mgt-be05-migration.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships(
       id,organization_id,user_id,role,status,version,updated_at)
     VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',7,transaction_timestamp())`,
    [ids.membership, ids.organization, ids.user],
  );
  await client.query(
    `INSERT INTO audit_events(
       id,organization_id,location_id,actor_membership_id,event_type,
       entity_type,entity_id,metadata_json,occurred_at)
     VALUES($1,$2,$3,$4,'PRESERVATION_CANARY','Location',$3,
            '{"before":"migration-38"}'::jsonb,transaction_timestamp())`,
    [ids.audit, ids.organization, ids.location, ids.membership],
  );
  await apply(migration);
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("MGT-BE-05 migration 38 Company settings and branding", () => {
  it("upgrades migration 37 state without rewriting existing typed truth", async () => {
    expect(expectedMigrationDirectories[migrationIndex]).toBe(migration);
    expect(migrationIndex).toBe(37);
    const state = await client.query<Record<string, unknown>>(
      `SELECT organization.name,organization.check_in_photos_required,
              organization.handoff_standard_method_policy::text,
              organization.tracking_enabled,organization.raw_gps_retention_days,
              organization.valet_service_fee::text,organization.payment_service_payer::text,
              organization.payment_methods_policy::text,organization.tips_enabled,
              organization.validation_enabled,organization.release_requires_payment,
              organization.brand_primary_color,organization.language_default::text,
              organization.ocr_assist_enabled,organization.parking_spot_required,
              organization.employee_retrieval_requested_notification_enabled,
              organization.guest_vehicle_ready_notification_enabled,
              location.check_in_photos_required_override,
              location.handoff_standard_method_policy_override::text,
              location.tracking_enabled_override,
              location.raw_gps_retention_days_override,
              location.valet_service_fee_override::text,
              location.payment_service_payer_override::text,
              location.payment_methods_policy_override::text,
              location.tips_enabled_override,location.validation_enabled_override,
              location.release_requires_payment_override,location.brand_display_name_override,
              location.brand_primary_color_override,membership.role::text,
              membership.status::text,membership.version
       FROM organizations AS organization
       JOIN locations AS location ON location.id=$2
       JOIN organization_memberships AS membership ON membership.id=$3
       WHERE organization.id=$1`,
      [ids.organization, ids.location, ids.membership],
    );
    expect(state.rows[0]).toMatchObject({
      name: "Existing Company", check_in_photos_required: true,
      handoff_standard_method_policy: "PICKUP_CODE", tracking_enabled: true,
      raw_gps_retention_days: 45, valet_service_fee: "12.345",
      payment_service_payer: "VENUE", payment_methods_policy: "CASH_OR_DIGITAL",
      tips_enabled: true, validation_enabled: true, release_requires_payment: true,
      brand_primary_color: "#ABCDEF", language_default: "EN", ocr_assist_enabled: true,
      parking_spot_required: true, employee_retrieval_requested_notification_enabled: true,
      guest_vehicle_ready_notification_enabled: true,
      check_in_photos_required_override: false,
      handoff_standard_method_policy_override: "DYNAMIC_QR",
      tracking_enabled_override: false,
      raw_gps_retention_days_override: 17, valet_service_fee_override: "2.500",
      payment_service_payer_override: "CUSTOMER",
      payment_methods_policy_override: "DIGITAL_ONLY", tips_enabled_override: false,
      validation_enabled_override: false, release_requires_payment_override: false,
      brand_display_name_override: "Existing Venue", brand_primary_color_override: "#112233",
      role: "ORG_ADMIN", status: "ACTIVE", version: 7,
    });
  });

  it("adds nullable Location overrides and fabricates no hours or history", async () => {
    const state = await client.query<Record<string, unknown>>(
      `SELECT language_default_override,ocr_assist_enabled_override,
              parking_spot_required_override,
              employee_retrieval_requested_notification_enabled_override,
              guest_vehicle_ready_notification_enabled_override
       FROM locations WHERE id=$1`,
      [ids.location],
    );
    expect(Object.values(state.rows[0] ?? {})).toEqual([null, null, null, null, null]);
    const counts = await client.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM organization_operating_hours) AS company_hours,
         (SELECT count(*)::text FROM location_operating_hours_overrides) AS location_hours,
         (SELECT count(*)::text FROM audit_events) AS audits,
         (SELECT count(*)::text FROM audit_events WHERE event_type LIKE 'MANAGEMENT_%') AS management_history`,
    );
    expect(counts.rows[0]).toEqual({
      audits: "1", company_hours: "0", location_hours: "0", management_history: "0",
    });
    const canary = await client.query<{ event_type: string; metadata_json: unknown }>(
      `SELECT event_type,metadata_json FROM audit_events WHERE id=$1`, [ids.audit],
    );
    expect(canary.rows[0]).toEqual({
      event_type: "PRESERVATION_CANARY", metadata_json: { before: "migration-38" },
    });
  });

  it("uses typed columns and normalized hours constraints instead of generic JSON", async () => {
    const types = await client.query<{ column_name: string; udt_name: string }>(
      `SELECT column_name,udt_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='organizations'
         AND column_name IN ('language_default','ocr_assist_enabled','parking_spot_required',
           'employee_retrieval_requested_notification_enabled','guest_vehicle_ready_notification_enabled')
       ORDER BY column_name`,
    );
    expect(types.rows).toEqual([
      { column_name: "employee_retrieval_requested_notification_enabled", udt_name: "bool" },
      { column_name: "guest_vehicle_ready_notification_enabled", udt_name: "bool" },
      { column_name: "language_default", udt_name: "management_language" },
      { column_name: "ocr_assist_enabled", udt_name: "bool" },
      { column_name: "parking_spot_required", udt_name: "bool" },
    ]);
    const generic = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name IN ('organizations','locations','organization_operating_hours',
                            'location_operating_hours_overrides')
         AND data_type IN ('json','jsonb')`,
    );
    expect(generic.rows[0]?.n).toBe(0);
    expect((await client.query(`SELECT to_regclass('public.organization_settings') AS t`)).rows[0]?.t).toBeNull();

    const constraints = await client.query<{ conname: string; contype: string }>(
      `SELECT conname,contype FROM pg_constraint
       WHERE conrelid IN ('public.organization_operating_hours'::regclass,
                          'public.location_operating_hours_overrides'::regclass)
       ORDER BY conname`,
    );
    expect(constraints.rows.map((row) => [row.conname, row.contype])).toEqual([
      ["location_operating_hours_overrides_interval_check", "c"],
      ["location_operating_hours_overrides_location_fkey", "f"],
      ["location_operating_hours_overrides_organization_id_fkey", "f"],
      ["location_operating_hours_overrides_pkey", "p"],
      ["organization_operating_hours_interval_check", "c"],
      ["organization_operating_hours_organization_id_fkey", "f"],
      ["organization_operating_hours_pkey", "p"],
    ]);
    await client.query(
      `INSERT INTO organization_operating_hours(organization_id,weekday,is_closed,opens_at,closes_at)
       VALUES($1,'MONDAY',false,'08:00','17:00')`,
      [ids.organization],
    );
    await expectPgError(
      client.query(
        `INSERT INTO organization_operating_hours(organization_id,weekday,is_closed,opens_at,closes_at)
         VALUES($1,'MONDAY',true,NULL,NULL)`,
        [ids.organization],
      ),
      "23505",
    );
    await expectPgError(
      client.query(
        `INSERT INTO organization_operating_hours(organization_id,weekday,is_closed,opens_at,closes_at)
         VALUES($1,'TUESDAY',false,'17:00','08:00')`,
        [ids.organization],
      ),
      "23514",
    );
    await expectPgError(
      client.query(
        `INSERT INTO organization_operating_hours(organization_id,weekday,is_closed,opens_at,closes_at)
         VALUES($1,'WEDNESDAY',true,NULL,NULL)`,
        [randomUUID()],
      ),
      "23503",
    );
  });
});
