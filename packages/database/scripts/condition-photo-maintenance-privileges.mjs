import {
  listPhotoFunctions,
  photoFunctionIds,
  photoMaintenanceFunctions,
  photoPrivateTables,
  photoRuntimeFunctions,
} from "./condition-photo-privilege-policy.mjs";

export async function provisionConditionPhotoMaintenancePrivileges(
  client,
  executeFormatted,
  role,
) {
  const catalog = await listPhotoFunctions(client);
  await photoFunctionIds(client, [...photoRuntimeFunctions, ...photoMaintenanceFunctions]);
  for (const table of [...photoPrivateTables, "public.vehicle_photos"]) {
    await executeFormatted(client, "REVOKE ALL ON TABLE %s FROM %I", [table, role]);
    const result = await client.query(
      `SELECT string_agg(format('%I',attname), ',') AS columns
         FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0
           AND NOT attisdropped`,
      [table],
    );
    const columns = result.rows[0]?.columns;
    if (!columns) throw new Error("Condition-photo maintenance table is missing.");
    await executeFormatted(
      client,
      "REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE %s FROM %I",
      [columns, columns, columns, columns, table, role],
    );
  }
  for (const fn of catalog) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM PUBLIC", [fn.signature]);
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [fn.signature, role]);
  }
  for (const fn of photoMaintenanceFunctions) {
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [fn, role]);
  }
}

export async function verifyConditionPhotoMaintenancePrivileges(client, role) {
  for (const table of [...photoPrivateTables, "public.vehicle_photos"]) {
    const result = await client.query(
      `SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                AS table_allowed,
              has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES')
                AS column_allowed`,
      [role, table],
    );
    if (result.rows[0]?.table_allowed !== false || result.rows[0]?.column_allowed !== false) {
      throw new Error("Condition-photo maintenance table privileges are unsafe.");
    }
  }
  const allowedIds = await photoFunctionIds(client, photoMaintenanceFunctions);
  await photoFunctionIds(client, photoRuntimeFunctions);
  const catalog = await listPhotoFunctions(client);
  for (const fn of catalog) {
    const result = await client.query(
      "SELECT has_function_privilege($1,$2::oid,'EXECUTE') AS allowed",
      [role, fn.oid],
    );
    if (
      result.rows[0]?.allowed !== allowedIds.has(fn.oid) ||
      fn.public_denied !== true ||
      fn.grant_option_denied !== true ||
      (allowedIds.has(fn.oid) &&
        (fn.security_definer !== true || !fn.search_path_safe || fn.owner === role))
    ) {
      throw new Error("Condition-photo maintenance function privileges are unsafe.");
    }
  }
}
