import {
  listPhotoFunctions,
  managementPhotoLockOwner,
  managementPhotoLockSignature,
  photoFunctionIds,
  photoMaintenanceFunctions,
  photoPrivateTables,
  photoReadTables,
  photoRuntimeFunctions,
} from "./condition-photo-privilege-policy.mjs";
import { provisionManagementPhotoLockOwner } from "./condition-photo-management-lock-owner.mjs";

async function revokeColumns(client, executeFormatted, table, role) {
  const result = await client.query(
    `SELECT string_agg(format('%I', attribute.attname), ',') AS names
       FROM pg_attribute attribute
      WHERE attribute.attrelid = $1::regclass
        AND attribute.attnum > 0 AND NOT attribute.attisdropped`,
    [table],
  );
  const columns = result.rows[0]?.names;
  if (!columns) throw new Error("Condition-photo table has no columns.");
  const grantTarget = role === "PUBLIC" ? "PUBLIC" : "%I";
  const argumentsForFormat = [columns, columns, columns, columns, table];
  if (role !== "PUBLIC") argumentsForFormat.push(role);
  await executeFormatted(
    client,
    `REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE %s FROM ${grantTarget}`,
    argumentsForFormat,
  );
}

export async function provisionConditionPhotoRuntimePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await provisionManagementPhotoLockOwner(client, executeFormatted, runtimeRole);
  const catalogFunctions = await listPhotoFunctions(client);
  const required = await photoFunctionIds(client, [
    ...photoRuntimeFunctions,
    ...photoMaintenanceFunctions,
  ]);
  const lockIds = await photoFunctionIds(client, [managementPhotoLockSignature]);
  const lock = catalogFunctions.find((item) => lockIds.has(item.oid));
  if (!lock || lock.owner !== managementPhotoLockOwner ||
      lock.security_definer !== true || lock.search_path_safe !== true ||
      lock.public_denied !== true || lock.grant_option_denied !== true) {
    throw new Error("Management photo evidence-lock owner is not provisioned safely.");
  }
  if (!catalogFunctions.some((functionRow) => required.has(functionRow.oid))) {
    throw new Error("Condition-photo functions have not been migrated.");
  }
  for (const table of photoPrivateTables) {
    await executeFormatted(client, "REVOKE ALL ON TABLE %s FROM PUBLIC", [table]);
    await executeFormatted(client, "REVOKE ALL ON TABLE %s FROM %I", [table, runtimeRole]);
    await revokeColumns(client, executeFormatted, table, "PUBLIC");
    await revokeColumns(client, executeFormatted, table, runtimeRole);
  }
  for (const table of photoReadTables) {
    await executeFormatted(client, "GRANT SELECT ON TABLE %s TO %I", [table, runtimeRole]);
  }
  await client.query("REVOKE ALL ON TABLE public.vehicle_photos FROM PUBLIC");
  await revokeColumns(client, executeFormatted, "public.vehicle_photos", "PUBLIC");
  for (const functionRow of catalogFunctions) {
    await executeFormatted(
      client,
      "REVOKE ALL ON FUNCTION %s FROM PUBLIC",
      [functionRow.signature],
    );
    await executeFormatted(
      client,
      "REVOKE ALL ON FUNCTION %s FROM %I",
      [functionRow.signature, runtimeRole],
    );
  }
  for (const signature of photoRuntimeFunctions) {
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      signature,
      runtimeRole,
    ]);
  }
}

export async function verifyConditionPhotoRuntimePrivileges(client, runtimeRole) {
  const readTables = new Set(photoReadTables);
  for (const table of photoPrivateTables) {
    const result = await client.query(
      `SELECT has_table_privilege($1,$2,'SELECT') AS can_read,
              has_any_column_privilege($1,$2,'SELECT') AS can_read_column,
              has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                AS can_write,
              has_any_column_privilege($1,$2,'INSERT,UPDATE,REFERENCES') AS can_write_column,
              NOT EXISTS (
                SELECT 1 FROM pg_class relation
                CROSS JOIN LATERAL aclexplode(
                  COALESCE(relation.relacl,acldefault('r',relation.relowner))
                ) acl
                WHERE relation.oid=$2::regclass AND acl.grantee=0
              ) AS public_table_denied,
              NOT EXISTS (
                SELECT 1 FROM pg_attribute attribute
                CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
                WHERE attribute.attrelid=$2::regclass AND acl.grantee=0
              ) AS public_column_denied`,
      [runtimeRole, table],
    );
    const row = result.rows[0];
    if (
      row?.can_read !== readTables.has(table) ||
      row.can_read_column !== readTables.has(table) ||
      row.can_write !== false ||
      row.can_write_column !== false ||
      row.public_table_denied !== true ||
      row.public_column_denied !== true
    ) {
      throw new Error("Condition-photo table privileges are unsafe.");
    }
  }
  const legacy = await client.query(
    `SELECT has_table_privilege($1,'public.vehicle_photos','SELECT') AS can_select,
            has_table_privilege($1,'public.vehicle_photos','INSERT') AS can_insert,
            has_table_privilege($1,'public.vehicle_photos','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_mutate,
            has_any_column_privilege($1,'public.vehicle_photos','UPDATE,REFERENCES') AS can_mutate_column,
            NOT EXISTS (
              SELECT 1 FROM pg_class relation
              CROSS JOIN LATERAL aclexplode(
                COALESCE(relation.relacl,acldefault('r',relation.relowner))
              ) acl WHERE relation.oid='public.vehicle_photos'::regclass
                AND acl.grantee=0
            ) AS public_denied,
            NOT EXISTS (
              SELECT 1 FROM pg_attribute attribute
              CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
              WHERE attribute.attrelid='public.vehicle_photos'::regclass
                AND acl.grantee=0
            ) AS public_columns_denied`,
    [runtimeRole],
  );
  if (
    legacy.rows[0]?.can_select !== true ||
    legacy.rows[0]?.can_insert !== true ||
    legacy.rows[0]?.can_mutate !== false ||
    legacy.rows[0]?.can_mutate_column !== false ||
    legacy.rows[0]?.public_denied !== true ||
    legacy.rows[0]?.public_columns_denied !== true
  ) {
    throw new Error("Legacy vehicle photo privileges are unsafe.");
  }
  const runtimeFunctions = await photoFunctionIds(client, photoRuntimeFunctions);
  const maintenanceFunctions = await photoFunctionIds(client, photoMaintenanceFunctions);
  const lockIds = await photoFunctionIds(client, [managementPhotoLockSignature]);
  const catalogFunctions = await listPhotoFunctions(client);
  if (catalogFunctions.length < runtimeFunctions.size + maintenanceFunctions.size) {
    throw new Error("Condition-photo functions are missing.");
  }
  for (const fn of catalogFunctions) {
    const allowed = runtimeFunctions.has(fn.oid);
    const result = await client.query(
      "SELECT has_function_privilege($1,$2::oid,'EXECUTE') AS allowed",
      [runtimeRole, fn.oid],
    );
    if (
      result.rows[0]?.allowed !== allowed ||
      fn.public_denied !== true ||
      fn.grant_option_denied !== true ||
      (lockIds.has(fn.oid) &&
        fn.owner !== managementPhotoLockOwner) ||
      (allowed || maintenanceFunctions.has(fn.oid)) &&
        (fn.security_definer !== true ||
          fn.search_path_safe !== true ||
          fn.owner === runtimeRole)
    ) {
      throw new Error("Condition-photo function privileges are unsafe.");
    }
  }
}
