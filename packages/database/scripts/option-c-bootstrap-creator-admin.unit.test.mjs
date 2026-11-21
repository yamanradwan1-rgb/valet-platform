import assert from "node:assert/strict";
import { test } from "node:test";

import { trustedCreatorAdmin } from "./option-c-bootstrap-creator-admin.mjs";

const trusted = {
  parent: "vaylet_mfa_writer",
  migrationRole: "cos_migrator",
  databaseOwner: "cos_migrator",
};
const grant = {
  parent: trusted.parent,
  member: trusted.migrationRole,
  grantor: "postgres",
  grantor_superuser: true,
  inherit_option: false,
  set_option: false,
  admin_option: true,
};

test("PostgreSQL 17 bootstrap ADMIN edge has no direct SET/INHERIT but remains trusted admin authority", () => {
  assert.equal(trustedCreatorAdmin(grant, trusted), true);
  assert.equal(
    trustedCreatorAdmin({ ...grant, grantor_superuser: false }, trusted),
    false,
  );
  assert.equal(
    trustedCreatorAdmin(
      { ...grant, grantor: trusted.databaseOwner, grantor_superuser: false },
      trusted,
    ),
    true,
  );
});

test("bootstrap grant rejects untrusted members, grantors and privileges", () => {
  for (const change of [
    { parent: "staff_auth_sessions" },
    { member: "ordinary_runtime" },
    { grantor: "rogue", grantor_superuser: false },
    { inherit_option: true },
    { set_option: true },
    { admin_option: false },
  ]) {
    assert.equal(trustedCreatorAdmin({ ...grant, ...change }, trusted), false);
  }
});
