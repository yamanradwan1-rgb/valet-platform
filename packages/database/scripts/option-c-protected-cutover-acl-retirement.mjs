import { revokeUnexpectedFunctionExecutors } from "./option-c-protected-cutover-executor-revocation.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";
import { retireStaffSessionLockAcl } from "./option-c-staff-session-lock-acl.mjs";
import {
  optionCFunctionContract,
  tableMutationContract,
} from "./option-c-protected-cutover-acl-contract.mjs";

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  if (result.rowCount === 0)
    throw new Error(`Option C required table ${table} is missing.`);
  return result.rows.map(({ column_name }) => column_name);
}

async function revokeColumn(client, formatted, role, table, privilege, column) {
  const format =
    role === "PUBLIC"
      ? `REVOKE ${privilege} (%I) ON TABLE public.%I FROM PUBLIC`
      : `REVOKE ${privilege} (%I) ON TABLE public.%I FROM %I`;
  const values = role === "PUBLIC" ? [column, table] : [column, table, role];
  await formatted(client, format, values);
}

export async function retireOptionCLegacyAcl(client, formatted, runtimeRole) {
  for (const [table, contract] of Object.entries(tableMutationContract)) {
    const columns = await tableColumns(client, table);
    for (const role of ["PUBLIC", runtimeRole]) {
      const suffix = role === "PUBLIC" ? "PUBLIC" : "%I";
      const values = role === "PUBLIC" ? [table] : [table, role];
      await formatted(
        client,
        `REVOKE INSERT, UPDATE ON TABLE public.%I FROM ${suffix}`,
        values,
      );
      for (const privilege of ["INSERT", "UPDATE"]) {
        const allowed =
          role === runtimeRole ? new Set(contract[privilege]) : new Set();
        for (const column of columns) {
          if (!allowed.has(column)) {
            await revokeColumn(
              client,
              formatted,
              role,
              table,
              privilege,
              column,
            );
          }
        }
      }
    }
  }

  const allProtectedRoles = [
    runtimeRole,
    optionCRoles.staffAuthWriter,
    optionCRoles.mfaWriter,
    optionCRoles.managementWriter,
  ];
  await retireStaffSessionLockAcl(
    client,
    formatted,
    runtimeRole,
    allProtectedRoles,
  );
  const exclusiveFunctions = [
    [optionCFunctionContract.staffAuth[0], optionCRoles.staffAuthWriter],
    [optionCFunctionContract.staffAuth[1], optionCRoles.staffAuthWriter],
    [optionCFunctionContract.staffAuth[2], optionCRoles.staffAuthWriter],
    [optionCFunctionContract.mfa[0], optionCRoles.mfaWriter],
    ...optionCFunctionContract.management.map((name) => [
      name,
      optionCRoles.managementWriter,
    ]),
    [optionCFunctionContract.mfaActivity, runtimeRole],
  ];
  for (const [signature, allowedRole] of exclusiveFunctions) {
    await client.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    await revokeUnexpectedFunctionExecutors(
      client,
      formatted,
      signature,
      allowedRole,
    );
    for (const role of allProtectedRoles) {
      if (role !== allowedRole) {
        await formatted(client, `REVOKE ALL ON FUNCTION ${signature} FROM %I`, [
          role,
        ]);
      }
    }
  }
  for (const signature of optionCFunctionContract.retiredManagement) {
    await client.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    await revokeUnexpectedFunctionExecutors(client, formatted, signature, null);
    for (const role of allProtectedRoles) {
      await formatted(client, `REVOKE ALL ON FUNCTION ${signature} FROM %I`, [
        role,
      ]);
    }
  }
}
