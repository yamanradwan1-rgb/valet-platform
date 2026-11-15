import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readStaffAuthWriterProvisioningConfiguration,
  staffAuthWriterRole,
} from "./staff-auth-writer-provisioning-policy.mjs";
import { writerTableColumns } from "./staff-auth-writer-grants.mjs";

const database = "127.0.0.1:51557/valet_w57s01";
const env = {
  NODE_ENV: "test",
  MIGRATION_DATABASE_URL: `postgresql://migration:migration-secret@${database}`,
  DATABASE_URL: `postgresql://vaylet_runtime:runtime-secret@${database}`,
  STAFF_AUTH_WRITER_DATABASE_URL:
    `postgresql://${staffAuthWriterRole}:writer-secret@${database}`,
};

test("S01 provisioning requires isolated writer principal, secret and target", () => {
  const parsed = readStaffAuthWriterProvisioningConfiguration(env);
  assert.equal(parsed.writerIdentity.role, staffAuthWriterRole);
  for (const override of [
    { STAFF_AUTH_WRITER_DATABASE_URL: undefined },
    { STAFF_AUTH_WRITER_DATABASE_URL: env.DATABASE_URL },
    { STAFF_AUTH_WRITER_DATABASE_URL: env.STAFF_AUTH_WRITER_DATABASE_URL.replace("writer-secret", "runtime-secret") },
    { STAFF_AUTH_WRITER_DATABASE_URL: env.STAFF_AUTH_WRITER_DATABASE_URL.replace(staffAuthWriterRole, "other_user") },
    { STAFF_AUTH_WRITER_DATABASE_URL: env.STAFF_AUTH_WRITER_DATABASE_URL.replace("51557", "51558") },
    { STAFF_AUTH_WRITER_DATABASE_URL: env.STAFF_AUTH_WRITER_DATABASE_URL.replace("valet_w57s01", "other_db") },
  ]) {
    assert.throws(() =>
      readStaffAuthWriterProvisioningConfiguration({ ...env, ...override }));
  }
});

test("S01 writer grants exclude broad table UPDATE, anti-abuse DML, MFA and Management", () => {
  assert.deepEqual(Object.keys(writerTableColumns).sort(), [
    "staff_auth_sessions", "staff_push_registrations", "staff_refresh_credentials", "users",
  ]);
  assert.deepEqual([...writerTableColumns.staff_auth_sessions.UPDATE].sort(), [
    "access_expires_at", "current_access_token_hash", "last_rotated_at", "revoked_at",
  ]);
  assert.deepEqual([...writerTableColumns.staff_refresh_credentials.UPDATE].sort(), [
    "consumed_at", "replaced_by_credential_id",
  ]);
  assert.deepEqual([...writerTableColumns.users.UPDATE].sort(), [
    "last_login_at", "updated_at",
  ]);
});
