import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

import {
  pinnedOptionCManagementBodies,
  verifyOptionCManagementBodies,
} from "./option-c-protected-cutover-management-bodies.mjs";

const sql = readFileSync(
  new URL(
    "../prisma/migrations/20261115190000_option_c_management_writer/migration.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const lockOrderedAuthorizationSql = readFileSync(
  new URL(
    "../prisma/migrations/20261116000310_option_c_management_user_security_lock_order/migration.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const runtimeBearerSql = readFileSync(
  new URL(
    "../prisma/migrations/20261116000300_option_c_management_raw_bearer_authority/migration.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const orderedRuntimeSql = readFileSync(
  new URL(
    "../prisma/migrations/20261116000320_option_c_runtime_bearer_lock_order/migration.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");
const mfaStepUpAuthorizationSql = readFileSync(
  new URL(
    "../prisma/migrations/20261118000100_option_c_management_mfa_step_up_contract/migration.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");

test("S03 installed-function SHA pins match the reviewed raw-token SQL source", () => {
  assert.equal(pinnedOptionCManagementBodies.length, 10);
  const runtimeBearers = new Set([
    "shift_presence_set_policy",
    "staff_shift_force_end",
    "shift_presence_lock_management_entitlement",
  ]);
  const upgradedRuntimeLocks = new Set([
    "shift_presence_set_policy",
    "staff_shift_force_end",
  ]);
  for (const [signature, digest] of pinnedOptionCManagementBodies) {
    const name = signature.slice("public.".length, signature.indexOf("("));
    const lockOrderedNames = new Set([
      "staff_management_authorized_onboarding_create",
      "staff_management_authorized_onboarding_resend",
    ]);
    const reviewedSource = runtimeBearers.has(name)
      ? upgradedRuntimeLocks.has(name)
        ? orderedRuntimeSql
        : runtimeBearerSql
      : name === "staff_management_authorize_writer"
        ? mfaStepUpAuthorizationSql
        : lockOrderedNames.has(name)
          ? lockOrderedAuthorizationSql
          : sql;
    const create =
      runtimeBearers.has(name) ||
      lockOrderedNames.has(name) ||
      name === "staff_management_authorize_writer"
        ? `CREATE OR REPLACE FUNCTION public.${name}(`
        : `CREATE FUNCTION public.${name}(`;
    const start = reviewedSource.indexOf(create);
    assert.ok(start >= 0, name);
    const quote =
      name === "shift_presence_lock_management_entitlement"
        ? "$presence_entitlement$"
        : "$$";
    const opening = reviewedSource.indexOf(`AS ${quote}`, start);
    const bodyStart = opening + 3 + quote.length;
    const bodyEnd = reviewedSource.indexOf(`${quote};`, bodyStart);
    assert.ok(opening >= start && bodyStart > opening && bodyEnd > bodyStart);
    const body = reviewedSource.slice(bodyStart, bodyEnd);
    if (runtimeBearers.has(name)) {
      assert.match(body, /pg_catalog\.sha256\(pg_catalog\.convert_to\(/);
      assert.match(body, /current_access_token_hash/);
      if (upgradedRuntimeLocks.has(name)) {
        const advisory = body.indexOf("staff-user-security:");
        const row = body.indexOf("FOR UPDATE;", advisory);
        const session = body.indexOf("FOR UPDATE OF session;", advisory);
        assert.ok(advisory >= 0 && row > advisory);
        assert.ok(
          name === "shift_presence_set_policy"
            ? body.indexOf("FROM public.staff_auth_sessions s", advisory) > row
            : session > row,
        );
        assert.doesNotMatch(body, /FOR UPDATE OF (s,u|session,u)/);
      }
    } else {
      assert.match(body, /p_access_token/);
      assert.doesNotMatch(body, /p_access_hash/);
    }
    assert.equal(createHash("sha256").update(body).digest("hex"), digest, name);
  }
  const advisory = mfaStepUpAuthorizationSql.indexOf("staff-user-security:");
  const userRow = mfaStepUpAuthorizationSql.indexOf(
    "FROM public.users AS actor",
    advisory,
  );
  const sessionRow = mfaStepUpAuthorizationSql.indexOf(
    "FROM public.staff_auth_sessions AS session",
    userRow,
  );
  assert(advisory >= 0 && advisory < userRow && userRow < sessionRow);
  const membershipRow = mfaStepUpAuthorizationSql.indexOf(
    "FROM public.organization_memberships AS membership",
    sessionRow,
  );
  const organizationLock = mfaStepUpAuthorizationSql.indexOf(
    "staff-management-org:",
    sessionRow,
  );
  const mfaRow = mfaStepUpAuthorizationSql.indexOf(
    "FROM public.user_mfa_totp_factors AS factor",
    membershipRow,
  );
  assert(
    sessionRow < organizationLock &&
      organizationLock < membershipRow &&
      membershipRow < mfaRow,
  );
  assert.match(mfaStepUpAuthorizationSql, /MESSAGE = 'MFA_STEP_UP_REQUIRED'/);
  for (const name of [
    "staff_management_authorized_onboarding_create",
    "staff_management_authorized_onboarding_resend",
  ]) {
    const start = lockOrderedAuthorizationSql.indexOf(
      `CREATE OR REPLACE FUNCTION public.${name}(`,
    );
    const end = lockOrderedAuthorizationSql.indexOf("$$;", start);
    const body = lockOrderedAuthorizationSql.slice(start, end);
    assert(body.indexOf("staff_onboarding_lock_identity") >= 0);
    assert(
      body.indexOf("staff_onboarding_lock_identity") <
        body.indexOf("staff_management_authorize_writer"),
      name,
    );
  }
});

test("S03 cutover rejects old installed SQL even when migration was marked applied", async () => {
  const good = new Map(pinnedOptionCManagementBodies);
  const client = {
    async query(statement, [signature]) {
      assert.match(statement, /pg_catalog\.sha256/);
      assert.match(statement, /pg_catalog\.replace\(function\.prosrc/);
      return { rowCount: 1, rows: [{ body_sha256: good.get(signature) }] };
    },
  };
  await verifyOptionCManagementBodies(client);
  const first = pinnedOptionCManagementBodies[0][0];
  good.set(first, "0".repeat(64));
  await assert.rejects(
    verifyOptionCManagementBodies(client),
    /installed function differs/,
  );
  good.set(first, pinnedOptionCManagementBodies[0][1]);
  const presencePolicy = pinnedOptionCManagementBodies[1][0];
  good.set(presencePolicy, "0".repeat(64));
  await assert.rejects(
    verifyOptionCManagementBodies(client),
    /installed function differs.*staff_shift_force_end/,
  );
});

test("both LEGACY promotion and PROTECTED rerun verify exact S03 SQL bodies", () => {
  for (const filename of [
    "option-c-protected-cutover-readiness.mjs",
    "option-c-protected-cutover-acl-verification.mjs",
  ]) {
    const source = readFileSync(new URL(filename, import.meta.url), "utf8");
    assert.match(source, /await verifyOptionCManagementBodies\(client\)/);
  }
});
