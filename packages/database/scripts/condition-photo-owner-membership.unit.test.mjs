import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPhotoLockOwnerMembership,
  photoLockMembershipSql,
} from "./condition-photo-owner-membership.mjs";

const owner = "management_photo_lock_owner";
const migrationRole = "issue416_w56_migrator";
const runtimeRole = "issue416_w56_runtime";
const pg17Creator = {
  granted_role: owner,
  member_role: migrationRole,
  member_createrole: true,
  grantor_role: "issue416_w56_owner",
  grantor_superuser: true,
  inherit_option: false,
  set_option: false,
  admin_option: true,
};

test("photo owner permits clean owner bootstrap and exact PG17 creator admin-only grant", () => {
  assert.equal(assertPhotoLockOwnerMembership([], owner, migrationRole, runtimeRole), undefined);
  assert.equal(
    assertPhotoLockOwnerMembership([pg17Creator], owner, migrationRole, runtimeRole),
    undefined,
  );
  assert.match(photoLockMembershipSql, /grantor\.rolsuper AS grantor_superuser/);
  assert.match(photoLockMembershipSql, /OR member\.rolname=\$1/);
});

test("no runtime, inherited, SET-enabled, extra or untrusted PG17 owner memberships", () => {
  for (const rows of [
    [pg17Creator, pg17Creator],
    [{ ...pg17Creator, member_role: runtimeRole }],
    [{ ...pg17Creator, member_role: "unknown_migrator" }],
    [{ ...pg17Creator, granted_role: "unrelated_role" }],
    [{ ...pg17Creator, member_createrole: false }],
    [{ ...pg17Creator, grantor_superuser: false }],
    [{ ...pg17Creator, grantor_role: owner }],
    [{ ...pg17Creator, grantor_role: migrationRole }],
    [{ ...pg17Creator, inherit_option: true }],
    [{ ...pg17Creator, set_option: true }],
    [{ ...pg17Creator, admin_option: false }],
    [null],
  ]) {
    assert.throws(
      () => assertPhotoLockOwnerMembership(rows, owner, migrationRole, runtimeRole),
      /membership is unsafe/,
    );
  }
  assert.throws(
    () => assertPhotoLockOwnerMembership([], owner, owner, runtimeRole),
    /membership is unsafe/,
  );
});
