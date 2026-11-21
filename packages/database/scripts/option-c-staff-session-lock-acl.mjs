import { revokeUnexpectedFunctionExecutors } from "./option-c-protected-cutover-executor-revocation.mjs";
import { assertFunctionAcl } from "./option-c-staff-session-lock-verification.mjs";
import {
  runtimeSessionSelectColumns,
  staffSessionLockFunction,
  staffSessionLockOwner,
} from "./option-c-staff-session-lock-contract.mjs";

export {
  runtimeSessionSelectColumns,
  staffSessionLockFunction,
  staffSessionLockOwner,
  staffSessionLockOwnerColumns,
} from "./option-c-staff-session-lock-contract.mjs";
export { verifyStaffSessionLockAcl } from "./option-c-staff-session-lock-verification.mjs";

export async function provisionLegacyStaffSessionLock(client, formatted, runtimeRole) {
  await assertFunctionAcl(client, runtimeRole, [], { requireRuntimeExecute: false });
  await client.query(`SET LOCAL ROLE ${staffSessionLockOwner}`);
  await formatted(
    client,
    `GRANT EXECUTE ON FUNCTION ${staffSessionLockFunction} TO %I`,
    [runtimeRole],
  );
  // The caller rolls back the transaction if either statement fails.
  await client.query("RESET ROLE");
  await assertFunctionAcl(client, runtimeRole, [runtimeRole]);
}

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  if (result.rowCount === 0)
    throw new Error(`Staff session lock table ${table} is missing.`);
  return result.rows.map(({ column_name }) => column_name);
}

export async function retireStaffSessionLockAcl(
  client,
  formatted,
  runtimeRole,
  protectedRoles,
) {
  const columns = await tableColumns(client, "staff_auth_sessions");
  await client.query(
    "REVOKE SELECT ON TABLE public.staff_auth_sessions FROM PUBLIC",
  );
  await formatted(
    client,
    "REVOKE SELECT ON TABLE public.staff_auth_sessions FROM %I",
    [runtimeRole],
  );
  for (const column of columns) {
    await client.query(
      `REVOKE SELECT (${column}) ON TABLE public.staff_auth_sessions FROM PUBLIC`,
    );
    await formatted(
      client,
      "REVOKE SELECT (%I) ON TABLE public.staff_auth_sessions FROM %I",
      [column, runtimeRole],
    );
  }
  for (const column of runtimeSessionSelectColumns) {
    await formatted(
      client,
      "GRANT SELECT (%I) ON TABLE public.staff_auth_sessions TO %I",
      [column, runtimeRole],
    );
  }

  // The session-lock function is deliberately owned by an isolated NOLOGIN
  // role. The migration principal has an exact SET-only edge to that owner so
  // ACL changes are performed with owner authority without transferring
  // ownership or broadening the migrator's direct function privileges.
  await client.query(`SET LOCAL ROLE ${staffSessionLockOwner}`);
  let primaryError;
  try {
    await client.query(
      `REVOKE ALL ON FUNCTION ${staffSessionLockFunction} FROM PUBLIC`,
    );
    await revokeUnexpectedFunctionExecutors(
      client,
      formatted,
      staffSessionLockFunction,
      runtimeRole,
    );
    for (const role of protectedRoles) {
      if (role !== runtimeRole) {
        await formatted(
          client,
          `REVOKE ALL ON FUNCTION ${staffSessionLockFunction} FROM %I`,
          [role],
        );
      }
    }
    await formatted(
      client,
      `GRANT EXECUTE ON FUNCTION ${staffSessionLockFunction} TO %I`,
      [runtimeRole],
    );
  } catch (error) {
    primaryError = error;
  }
  try {
    await client.query("RESET ROLE");
  } catch (resetError) {
    if (!primaryError) throw resetError;
  }
  if (primaryError) throw primaryError;
}
