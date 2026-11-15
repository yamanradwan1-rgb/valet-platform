import assert from "node:assert/strict";
import { test } from "node:test";

import { applyStaffAuthWriterGrants } from "./staff-auth-writer-grants.mjs";
import {
  protectedStaffOnboardingFunctions,
  provisionStaffOnboardingPrivileges,
  runtimeStaffOnboardingFunctions,
} from "./staff-onboarding-runtime-privileges.mjs";

const activation = "public.staff_onboarding_activate(text,text,text)";
const runtimeRole = "vaylet_runtime";
const writerRole = "vaylet_staff_auth_writer";

test("S01 S03 runtime reprovision twice cannot restore activation of a PENDING account", async () => {
  assert.ok(protectedStaffOnboardingFunctions.includes(activation));
  assert.ok(!runtimeStaffOnboardingFunctions.includes(activation));

  const statements = [];
  const client = {
    async query(sql, parameters) {
      statements.push({ sql, parameters, direct: true });
      if (sql.includes("has_function_privilege($1,$3,'EXECUTE')")) {
        assert.deepEqual(parameters, [
          writerRole, runtimeRole,
          "public.s04_staff_activation_success(uuid,text,text,text)",
        ]);
        return { rowCount: 1, rows: [{ writer: true, ordinary_denied: true }] };
      }
      // Only mock catalog rows; the privileges are audited separately on PG17.
      return { rowCount: 0, rows: [] };
    },
  };
  const exec = async (_client, format, parameters) => {
    statements.push({ sql: format, parameters, direct: false });
  };

  await applyStaffAuthWriterGrants(client, exec, writerRole, runtimeRole);
  for (let pass = 0; pass < 2; pass++) {
    await provisionStaffOnboardingPrivileges(client, exec, runtimeRole);
  }

  const activationStatements = statements.filter(({ sql, parameters }) =>
    sql.includes("staff_onboarding_activate") ||
    parameters?.includes(activation));
  const activationGrants = activationStatements.filter(({ sql }) =>
    sql.includes("GRANT EXECUTE"));
  assert.deepEqual(activationGrants.map(({ parameters }) => parameters), [
    [writerRole],
  ]);
  const deniedRuntime = activationStatements.filter(({ sql, parameters }) =>
    sql.includes("REVOKE ALL") && parameters?.includes(runtimeRole));
  assert.equal(deniedRuntime.length, 3);
  const deniedPublic = activationStatements.filter(({ sql }) =>
    sql.includes("REVOKE ALL") && sql.includes("FROM PUBLIC"));
  assert.equal(deniedPublic.length, 3);
});
