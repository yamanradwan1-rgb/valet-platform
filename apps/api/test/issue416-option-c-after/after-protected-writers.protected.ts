import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  staffDirectoryPath,
  staffRolePath,
} from "../issue416-option-c-t5/probe-fixture";
import { runLegacyRuntimeProvisioner } from "./after-provisioner-runner";
import { OptionCAfterProtectedFixture } from "./after-protected-fixture";

const fixture = new OptionCAfterProtectedFixture();
beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 120_000);

async function deniedRuntimePrivilege(
  table: string,
  column: string,
  privilege: string,
) {
  const result = await fixture.runtimeSql(
    `SELECT has_column_privilege(current_user,$1,$2,$3) AS allowed`,
    [table, column, privilege],
  );
  expect(result.allowed).toBe(true);
  if (!result.allowed)
    throw new Error("W37 protected permission query failed.");
  expect(result.result?.allowed, `${table}.${column}:${privilege}`).toBe(false);
}

async function assertRuntimeS01Fence() {
  for (const [table, column, privilege] of [
    ["staff_auth_sessions", "id", "INSERT"],
    ["staff_auth_sessions", "revoked_at", "UPDATE"],
    ["staff_auth_sessions", "mfa_authenticated_at", "UPDATE"],
    ["staff_refresh_credentials", "token_hash", "INSERT"],
    ["staff_refresh_credentials", "consumed_at", "UPDATE"],
  ] as const) {
    await deniedRuntimePrivilege(table, column, privilege);
  }
  const table = await fixture.runtimeSql(
    `SELECT has_table_privilege(current_user,
       'staff_refresh_credentials','INSERT') AS allowed`,
  );
  if (!table.allowed)
    throw new Error("W37 refresh table privilege query failed.");
  expect(table.result?.allowed).toBe(false);
}

describe("Option C protected writer integration / strict writer principals", () => {
  it("attests three writer identities and rejects legacy runtime provisioning twice", async () => {
    await fixture.assertIndependentWriterConnections();
    await assertRuntimeS01Fence();
    for (let pass = 1; pass <= 2; pass++) {
      const result = await runLegacyRuntimeProvisioner(fixture);
      expect(result.code).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Option C PROTECTED",
      );
      await fixture.assertIndependentWriterConnections();
      await assertRuntimeS01Fence();
      console.info(`W66 protected legacy provision rejection pass=${pass}`);
    }
  }, 90_000);

  it("management writer cannot directly read a stored Staff access verifier", async () => {
    const admin = await fixture.onboardingAdmin();
    const query = await fixture.managementWriterSql(
      `SELECT current_access_token_hash FROM staff_auth_sessions WHERE id=$1`,
      [admin.auth.sessionId],
    );
    expect(query.allowed).toBe(false);
    if (!query.allowed) expect(query.sqlstate).toBe("42501");
  });

  it("a copied verifier is not a raw-bearer proof for protected Management mutation", async () => {
    const admin = await fixture.onboardingAdmin();
    const target = await fixture.employee(admin.membership.organizationId);
    const source = await fixture.query<{ current_access_token_hash: string }>(
      `SELECT current_access_token_hash FROM staff_auth_sessions WHERE id=$1`,
      [admin.auth.sessionId],
    );
    const copiedHash = source.rows[0]?.current_access_token_hash;
    if (!copiedHash) throw new Error("Synthetic Staff verifier missing.");

    const copied = await fixture.managementWriterSql(
      `SELECT * FROM public.staff_management_authorized_set_role(
        $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,$7::integer,$8::membership_role)`,
      [
        admin.auth.sessionId,
        admin.user.id,
        copiedHash,
        admin.membership.membershipId,
        admin.membership.organizationId,
        target.membershipId,
        1,
        "VALET_SUPERVISOR",
      ],
    );
    expect(copied.allowed).toBe(false);
    const targetState = await fixture.query<{ role: string; version: number }>(
      `SELECT role::text,version FROM organization_memberships WHERE id=$1`,
      [target.membershipId],
    );
    expect(targetState.rows[0]).toEqual({ role: "VALET_EMPLOYEE", version: 1 });

    // A real HTTP bearer and TOTP, not the SQL-readable verifier, must retain
    // normal management authority through the protected writer pool.
    const real = await fixture.managementPost(
      staffRolePath(admin.membership.organizationId, target.membershipId),
      admin.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    );
    expect(real.status).toBe(201);
    expect(real.body).toMatchObject({ role: "VALET_SUPERVISOR", version: 2 });
  });

  it("old bearer/hash cannot be replayed after refresh or logout", async () => {
    const admin = await fixture.onboardingAdmin();
    const oldHash = await fixture.query<{ current_access_token_hash: string }>(
      `SELECT current_access_token_hash FROM staff_auth_sessions WHERE id=$1`,
      [admin.auth.sessionId],
    );
    const refresh = await fixture.refresh(admin.auth.refreshToken);
    expect(refresh.status).toBe(200);
    const oldAccess = await fixture.managementGet(
      staffDirectoryPath(admin.membership.organizationId),
      admin.auth.accessToken,
    );
    expect(oldAccess.status).toBe(401);
    const beforeLogout = await fixture.managementGet(
      staffDirectoryPath(admin.membership.organizationId),
      String(refresh.body?.accessToken),
    );
    expect(beforeLogout.status).toBe(200);
    const query = await fixture.managementWriterSql(
      `SELECT * FROM public.staff_management_authorize_writer(
        $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid)`,
      [
        admin.auth.sessionId,
        admin.user.id,
        oldHash.rows[0]!.current_access_token_hash,
        admin.membership.membershipId,
        admin.membership.organizationId,
      ],
    );
    expect(query.allowed).toBe(false);
    expect(
      (await fixture.logout(String(refresh.body?.refreshToken))).status,
    ).toBe(204);
    const closed = await fixture.managementGet(
      staffDirectoryPath(admin.membership.organizationId),
      String(refresh.body?.accessToken),
    );
    expect(closed.status).toBe(401);
  });
});
