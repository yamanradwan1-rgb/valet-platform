import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  managementWriterFunctions,
  runtimeStaffManagementFunctions,
} from "./staff-management-runtime-privileges.mjs";
import { protectedStaffOnboardingFunctions } from "./staff-onboarding-runtime-privileges.mjs";

const old = readFileSync(new URL(
  "../prisma/migrations/20261115190000_option_c_management_writer/migration.sql",
  import.meta.url,
), "utf8");
const repair = readFileSync(new URL(
  "../prisma/migrations/20261115235900_option_c_s03_raw_bearer_upgrade/migration.sql",
  import.meta.url,
), "utf8");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const migrated = [
  "public.staff_management_authorize_writer(uuid,uuid,text,uuid,uuid)",
  "public.staff_management_touch_writer_activity(uuid,uuid,text)",
  ...managementWriterFunctions,
];

test("historical migration is immutable; repair is a separate atomic step", () => {
  assert.equal(sha256(old),
    "d6d7e344b3015de55b719b6b84ffaadcbd6a93e451c97d39a3636247fd076796");
  assert.equal(repair.split(old).length, 2, "seven original definitions copied once");
  assert.match(repair, /^-- Option C S03 forward-only repair/);
  assert.match(repair, /\nBEGIN;\n/);
  assert.match(repair, /\nCOMMIT;\s*$/);
  assert.doesNotMatch(repair, /\bCASCADE\b/);
});

test("drops exactly seven affected signatures with RESTRICT before replacing", () => {
  const drops = [...repair.matchAll(/^DROP FUNCTION (public\.[^;]+) RESTRICT;$/gm)]
    .map((match) => match[1].replaceAll("public.membership_", "membership_"));
  assert.deepEqual(new Set(drops), new Set(migrated));
  assert.equal(drops.length, 7);
  assert(repair.indexOf("DROP FUNCTION") < repair.indexOf("CREATE FUNCTION"));
  assert.match(repair, /SQLSTATE 42P13/);
});

test("all seven new functions expose a raw bearer, not the old hash ABI", () => {
  assert.equal([...repair.matchAll(/^CREATE FUNCTION public\.staff_management_(?:authorize_writer|touch_writer_activity|authorized_\w+)\(/gm)].length, 7);
  assert.equal([...repair.matchAll(/p_access_token text/g)].length, 7);
  assert.doesNotMatch(repair, /p_access_hash/);
  assert.match(repair, /pg_catalog\.sha256\(pg_catalog\.convert_to\(p_access_token, 'UTF8'\)\)/);
  assert.match(repair, /session\.revoked_at IS NULL/);
  assert.match(repair, /factor\.state = 'ACTIVE'/);
  assert.match(repair, /session\.mfa_authenticated_at \+ INTERVAL '5 minutes'/);
});

test("ACL repair revokes old SQL and PUBLIC, retaining exact new writer entrypoints", () => {
  for (const signature of [
    ...migrated, ...runtimeStaffManagementFunctions,
    ...protectedStaffOnboardingFunctions,
  ]) {
    assert(repair.includes(`'${signature}'`), signature);
  }
  assert.match(repair, /REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
  assert.match(repair, /REVOKE ALL ON FUNCTION %s FROM %I/);
  assert.match(repair, /WHERE rolname = 'vaylet_management_writer'/);
  assert.match(repair, /GRANT EXECUTE ON FUNCTION %s TO %I/);
  assert.match(repair, /GRANT EXECUTE ON FUNCTION public\.staff_onboarding_activate\(text,text,text\)\s+TO vaylet_staff_auth_writer/);
  assert.doesNotMatch(repair, /GRANT EXECUTE ON FUNCTION .*TO (?:PUBLIC|vaylet_w59_runtime)/);
});
