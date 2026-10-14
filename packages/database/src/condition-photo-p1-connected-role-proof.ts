import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { expect } from "vitest";

import {
  photoMaintenanceFunctions,
  photoReadTables,
  photoRuntimeFunctions,
} from "../scripts/condition-photo-privilege-policy.mjs";
import type { ConnectedPhotoScope } from "./condition-photo-p1-connected-role-seed.js";

async function asRole(url: string, action: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try { await action(client); }
  finally { await client.end(); }
}

async function denied(client: Client, statement: string, values: unknown[] = []): Promise<void> {
  await expect(client.query(statement, values)).rejects.toMatchObject({ code: "42501" });
}

const randomId = () => randomUUID();

export async function proveConnectedRuntimeRole(url: string): Promise<void> {
  await asRole(url, async (client) => {
    for (const table of ["public.vehicle_photos", ...photoReadTables]) {
      await client.query(`SELECT 1 FROM ${table} LIMIT 0`);
    }
    // Zero inserted rows, but PostgreSQL checks the actual restricted INSERT role.
    await client.query("INSERT INTO public.vehicle_photos(id) SELECT NULL::uuid WHERE false");
    await expect(client.query(
      "SELECT public.condition_photo_record_failure($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'NOT_ALLOWED')",
      [randomId(), randomId(), randomId(), randomId(), randomId()],
    )).rejects.toMatchObject({ code: "22023" });
    for (const [table, column] of [
      ["public.vehicle_photo_verifications", "vehicle_photo_id"],
      ["public.condition_photo_upload_admission", "user_id"],
      ["public.condition_photo_upload_attempts", "id"],
    ]) {
      await denied(client, `INSERT INTO ${table}(${column}) SELECT NULL::uuid WHERE false`);
    }
    await denied(client, "UPDATE public.vehicle_photo_verifications SET vehicle_photo_id=vehicle_photo_id WHERE false");
    await denied(client, "DELETE FROM public.vehicle_photo_verifications WHERE false");
    await denied(client, "TRUNCATE TABLE public.vehicle_photo_verifications");
    await denied(client, "UPDATE public.condition_photo_upload_attempts SET status=status WHERE false");
    await denied(client, "UPDATE public.condition_photo_upload_admission SET user_id=user_id WHERE false");
    await denied(client, "SELECT public.condition_photo_expire_operation($1::uuid)", [randomId()]);
    await denied(client, "SELECT public.condition_photo_lock_admission($1::uuid)", [randomId()]);
  });
}

export async function proveConnectedMaintenanceRole(url: string): Promise<void> {
  await asRole(url, async (client) => {
    expect((await client.query<{ value: boolean }>(
      "SELECT public.condition_photo_expire_operation($1::uuid) AS value", [randomId()],
    )).rows[0]?.value).toBe(false);
    expect((await client.query<{ value: boolean }>(
      "SELECT public.condition_photo_abandon_attempt($1::uuid) AS value", [randomId()],
    )).rows[0]?.value).toBe(false);
    for (const table of ["public.vehicle_photo_verifications", "public.vehicle_photos"])
      await denied(client, `SELECT 1 FROM ${table} LIMIT 0`);
    await denied(client, "INSERT INTO public.vehicle_photo_verifications(vehicle_photo_id) SELECT NULL::uuid WHERE false");
    await denied(client, "UPDATE public.vehicle_photo_verifications SET vehicle_photo_id=vehicle_photo_id WHERE false");
    await denied(client, "DELETE FROM public.vehicle_photo_verifications WHERE false");
    await denied(client, "TRUNCATE TABLE public.vehicle_photo_verifications");
    await denied(client, "SELECT public.condition_photo_reserve_upload($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bytea,1,1,'test')",
      [randomId(), randomId(), randomId(), randomId(), Buffer.alloc(32)]);
    await denied(client, `SELECT ${photoRuntimeFunctions[4]?.split("(")[0]}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,NULL::text,$6::bytea,1,1,1)`,
      [randomId(), randomId(), randomId(), randomId(), randomId(), Buffer.alloc(32)]);
  });
}

export async function proveConnectedPublicRole(url: string): Promise<void> {
  await asRole(url, async (client) => {
    for (const table of photoReadTables) await denied(client, `SELECT 1 FROM ${table} LIMIT 0`);
    for (const signature of [...photoRuntimeFunctions, ...photoMaintenanceFunctions]) {
      const name = signature.slice(0, signature.indexOf("("));
      const args = signature.slice(signature.indexOf("(") + 1, -1)
        .split(",").map((type) => `NULL::${type}`).join(",");
      await denied(client, `SELECT ${name}(${args})`);
    }
    await denied(client, "SELECT public.condition_photo_lock_admission(NULL::uuid)");
  });
}

export async function proveConnectedRuntimeEvidenceFlow(
  url: string,
  scope: ConnectedPhotoScope,
): Promise<string> {
  let verifiedPhoto = "";
  await asRole(url, async (client) => {
    const operation = await client.query<{
      operation_id: string; attempt_id: string; lease_owner: string;
    }>(
      `SELECT * FROM public.condition_photo_reserve_upload(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bytea,256,1,'issue215_test')`,
      [scope.userId, scope.memberId, scope.sessionId, randomUUID(), Buffer.alloc(32, 0xaa)],
    );
    const record = operation.rows[0];
    expect(record).toBeDefined();
    if (!record) throw new Error("Restricted runtime reservation yielded no attempt.");
    const canonical = Buffer.alloc(32, 0xbb);
    const params = [
      scope.userId, scope.memberId, record.operation_id, record.attempt_id,
      record.lease_owner, canonical,
    ];
    const stored = await client.query<{ changed: boolean }>(
      `SELECT public.condition_photo_mark_stored(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
         NULL::text,$6::bytea,256,10,10) AS changed`,
      params,
    );
    expect(stored.rows[0]?.changed).toBe(true);
    const selected = await client.query<{ photo_id: string }>(
      `SELECT public.condition_photo_finalize_upload(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
         NULL::text,$6::bytea,256,10,10)::text AS photo_id`,
      params,
    );
    verifiedPhoto = selected.rows[0]?.photo_id ?? "";
    expect(verifiedPhoto).toMatch(/^[0-9a-f-]{36}$/);
    const unavailable = await client.query<{ changed: boolean }>(
      `SELECT public.condition_photo_set_availability(
         $1::uuid,$2::uuid,$3::uuid,'UNAVAILABLE'::condition_photo_availability_state,
         'OBJECT_MISSING') AS changed`,
      [scope.userId, scope.memberId, verifiedPhoto],
    );
    expect(unavailable.rows[0]?.changed).toBe(true);
    await denied(client,
      `INSERT INTO public.audit_events
       (id,organization_id,location_id,valet_session_id,actor_membership_id,
        actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
              'MEMBERSHIP','CHECK_IN_CONDITION_PHOTO_VERIFIED','ValetSession',
              $4::uuid,'{}'::jsonb,clock_timestamp())`,
      [randomUUID(), scope.orgId, scope.locationId, scope.sessionId, scope.memberId],
    );
  });
  return verifiedPhoto;
}
