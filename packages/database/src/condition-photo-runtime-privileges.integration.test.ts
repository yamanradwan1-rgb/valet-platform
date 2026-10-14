import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConditionPhotoP1OwnedTarget } from "./condition-photo-p1-owned-target.js";
import {
  proveConnectedMaintenanceRole,
  proveConnectedPublicRole,
  proveConnectedRuntimeRole,
  proveConnectedRuntimeEvidenceFlow,
} from "./condition-photo-p1-connected-role-proof.js";
import { seedConnectedPhotoScope } from "./condition-photo-p1-connected-role-seed.js";
import {
  photoMaintenanceFunctions,
  photoPrivateTables,
  photoReadTables,
  photoRuntimeFunctions,
} from "../scripts/condition-photo-privilege-policy.mjs";
import { verifyRuntimeTablePrivileges } from "../scripts/verify-runtime-table-privileges.mjs";
import { verifyConditionPhotoMaintenancePrivileges } from "../scripts/condition-photo-maintenance-privileges.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let runtimeRole = "";
let maintenanceRole = "";
let publicRole = "";
const runtimePassword = `runtime-${randomUUID()}`;
const maintenancePassword = `maint-${randomUUID()}`;
const publicPassword = `public-${randomUUID()}`;

let migrationUrl = "";
let client: Client;
let target: ConditionPhotoP1OwnedTarget | undefined;

function roleUrl(role: string, password: string): string {
  const result = new URL(migrationUrl);
  result.username = role;
  result.password = password;
  return result.toString();
}

function runScript(args: string[], extra: Record<string, string> = {}) {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MIGRATION_DATABASE_URL: migrationUrl,
      DATABASE_URL: roleUrl(runtimeRole, runtimePassword),
      ...extra,
    },
    stdio: "pipe",
  });
}

async function rolePrivilege(role: string, object: string, privilege: string) {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT has_table_privilege($1,$2,$3) AS allowed`,
    [role, object, privilege],
  );
  return result.rows[0]?.allowed;
}

async function functionPrivilege(role: string, signature: string) {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`,
    [role, signature],
  );
  return result.rows[0]?.allowed;
}

beforeAll(async () => {
  target = new ConditionPhotoP1OwnedTarget();
  const disposable = await target.createDatabase();
  migrationUrl = disposable.url;
  runScript([prismaCli, "migrate", "deploy"]);
  client = new Client({ connectionString: migrationUrl });
  await client.connect();
  runtimeRole = await target.createRole(runtimePassword);
  maintenanceRole = await target.createRole(maintenancePassword);
  publicRole = await target.createRole(publicPassword);
  for (let i = 0; i < 2; i += 1) {
    runScript(["scripts/provision-runtime-role.mjs"]);
    runScript(["scripts/provision-condition-photo-maintenance-role.mjs"], {
      CONDITION_PHOTO_MAINTENANCE_ROLE: maintenanceRole,
      CONDITION_PHOTO_MAINTENANCE_DATABASE_URL: roleUrl(
        maintenanceRole, maintenancePassword,
      ),
    });
  }
}, 120_000);

afterAll(async () => {
  try { await client?.end(); }
  finally { await target?.close(); }
}, 60_000);

describe("Issue #215 condition-photo restricted PostgreSQL roles", () => {
  it("executes allowed and denied SQL under actual connected runtime, maintenance and PUBLIC-only roles", async () => {
    await proveConnectedRuntimeRole(roleUrl(runtimeRole, runtimePassword));
    await proveConnectedMaintenanceRole(roleUrl(maintenanceRole, maintenancePassword));
    await proveConnectedPublicRole(roleUrl(publicRole, publicPassword));
  }, 30_000);

  it("reserves, persists STORED, finalizes and audits exact evidence via authenticated PostgreSQL runtime role", async () => {
    const scope = await seedConnectedPhotoScope(client);
    const verifiedPhoto = await proveConnectedRuntimeEvidenceFlow(
      roleUrl(runtimeRole, runtimePassword), scope,
    );
    const evidence = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM vehicle_photo_verifications WHERE vehicle_photo_id=$1::uuid`,
      [verifiedPhoto],
    );
    expect(evidence.rows[0]?.count).toBe(1);
  }, 30_000);
  it("retains legacy metadata photo INSERT without granting evidence mutations", async () => {
    expect(await rolePrivilege(runtimeRole, "public.vehicle_photos", "SELECT"))
      .toBe(true);
    expect(await rolePrivilege(runtimeRole, "public.vehicle_photos", "INSERT"))
      .toBe(true);
    for (const table of photoPrivateTables) {
      expect(await rolePrivilege(runtimeRole, table, "SELECT"))
        .toBe(photoReadTables.includes(table));
      expect(await rolePrivilege(runtimeRole, table, "INSERT")).toBe(false);
      expect(await rolePrivilege(runtimeRole, table, "UPDATE")).toBe(false);
      expect(await rolePrivilege(maintenanceRole, table, "SELECT")).toBe(false);
      expect(await rolePrivilege(maintenanceRole, table, "INSERT")).toBe(false);
    }
    expect(await rolePrivilege(maintenanceRole, "public.vehicle_photos", "SELECT"))
      .toBe(false);
    await verifyRuntimeTablePrivileges(client, runtimeRole);
    await verifyConditionPhotoMaintenancePrivileges(client, maintenanceRole);
  });

  it("limits API to photo commands including STORED and maintenance to expiry/abandon", async () => {
    for (const fn of photoRuntimeFunctions) {
      expect(await functionPrivilege(runtimeRole, fn)).toBe(true);
      expect(await functionPrivilege(maintenanceRole, fn)).toBe(false);
    }
    expect(await functionPrivilege(
      runtimeRole,
      "public.condition_photo_mark_stored(uuid,uuid,uuid,uuid,uuid,text,bytea,integer,integer,integer)",
    )).toBe(true);
    expect(await functionPrivilege(
      runtimeRole,
      "public.condition_photo_record_failure(uuid,uuid,uuid,uuid,uuid,text)",
    )).toBe(true);
    for (const fn of photoMaintenanceFunctions) {
      expect(await functionPrivilege(runtimeRole, fn)).toBe(false);
      expect(await functionPrivilege(maintenanceRole, fn)).toBe(true);
    }
    expect(await functionPrivilege(runtimeRole, "public.condition_photo_write_guard()"))
      .toBe(false);
  });

  it("detects unsafe mutation grants without persisting the test grant", async () => {
    await client.query("BEGIN");
    try {
      await client.query(
        `GRANT UPDATE ON TABLE public.vehicle_photo_verifications TO "${runtimeRole}"`,
      );
      await expect(verifyRuntimeTablePrivileges(client, runtimeRole))
        .rejects.toThrow("Condition-photo table privileges are unsafe.");
    } finally {
      await client.query("ROLLBACK");
    }
    await client.query("BEGIN");
    try {
      await client.query(
        `GRANT EXECUTE ON FUNCTION ${photoRuntimeFunctions[0]}
         TO "${maintenanceRole}"`,
      );
      await expect(verifyConditionPhotoMaintenancePrivileges(client, maintenanceRole))
        .rejects.toThrow("Condition-photo maintenance function privileges are unsafe.");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("reconciles stale PUBLIC and column/function grants on repeat provisioning", async () => {
    await client.query(
      `GRANT UPDATE (status) ON TABLE public.condition_photo_upload_operations
       TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT SELECT (object_key) ON TABLE public.condition_photo_upload_attempts
       TO PUBLIC`,
    );
    await client.query(
      `GRANT EXECUTE ON FUNCTION ${photoRuntimeFunctions[2]}
       TO "${maintenanceRole}"`,
    );
    runScript(["scripts/provision-runtime-role.mjs"]);
    runScript(["scripts/provision-condition-photo-maintenance-role.mjs"], {
      CONDITION_PHOTO_MAINTENANCE_ROLE: maintenanceRole,
      CONDITION_PHOTO_MAINTENANCE_DATABASE_URL: roleUrl(
        maintenanceRole, maintenancePassword,
      ),
    });
    await verifyRuntimeTablePrivileges(client, runtimeRole);
    await verifyConditionPhotoMaintenancePrivileges(client, maintenanceRole);
    expect(await functionPrivilege(maintenanceRole, photoRuntimeFunctions[2]!))
      .toBe(false);
    const attempts = await client.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_attribute attribute
         CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
         WHERE attribute.attrelid = 'public.condition_photo_upload_attempts'::regclass
           AND attribute.attname='object_key' AND acl.grantee=0
       ) AS allowed`,
    );
    expect(attempts.rows[0]?.allowed).toBe(false);
  }, 30_000);
});
