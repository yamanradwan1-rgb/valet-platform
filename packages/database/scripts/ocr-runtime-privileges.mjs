import {
  assertOcrFunctionCatalog, ocrAllFunctions, ocrRuntimeFunctions, ocrTables,
} from "./ocr-privilege-policy.mjs";

export async function clearOcrTableGrants(client, formatted, role) {
  for (const table of ocrTables) {
    await formatted(client, "REVOKE ALL ON TABLE %s FROM PUBLIC", [table]);
    await formatted(client, "REVOKE ALL ON TABLE %s FROM %I", [table, role]);
    const { rows } = await client.query(
      `SELECT attname FROM pg_attribute
        WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped`, [table],
    );
    if (rows.length === 0) throw new Error("OCR private table missing.");
    for (const { attname } of rows) {
      await formatted(client,
        "REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE %s FROM %I",
        [attname, attname, attname, attname, table, role]);
    }
  }
}

export async function provisionOcrRuntimePrivileges(client, formatted, role) {
  const catalog = await assertOcrFunctionCatalog(client);
  await clearOcrTableGrants(client, formatted, role);
  for (const fn of catalog) {
    await formatted(client, "REVOKE ALL ON FUNCTION %s FROM PUBLIC", [fn.signature]);
    await formatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [fn.signature, role]);
  }
  for (const fn of ocrRuntimeFunctions) {
    await formatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [fn, role]);
  }
}

export async function verifyOcrPrincipalPrivileges(client, role, allowedFunctions) {
  for (const table of ocrTables) {
    const { rows } = await client.query(`
      SELECT has_table_privilege($1,$2,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_allowed,
             has_any_column_privilege($1,$2,
         'SELECT,INSERT,UPDATE,REFERENCES') AS column_allowed`,
      [role, table]);
    if (rows[0]?.table_allowed !== false || rows[0]?.column_allowed !== false) {
      throw new Error("OCR role has direct table or column access.");
    }
  }
  const { rows } = await client.query(`
    SELECT signature,to_regprocedure(signature)::oid::text AS oid
    FROM unnest($1::text[]) AS signature`, [ocrAllFunctions]);
  if (rows.some((r) => r.oid === null)) {
    throw new Error("OCR function missing from privilege verification.");
  }
  const permitted = new Set(rows.filter((r) => allowedFunctions.includes(r.signature))
    .map((r) => r.oid));
  const catalog = await assertOcrFunctionCatalog(client);
  for (const fn of catalog) {
    const { rows: probe } = await client.query(
      "SELECT has_function_privilege($1,$2::oid,'EXECUTE') AS allowed",
      [role, fn.oid]);
    if (probe[0]?.allowed !== permitted.has(fn.oid) ||
        !fn.public_denied || !fn.grant_option_denied ||
        (permitted.has(fn.oid) &&
         (!fn.security_definer || !fn.search_path_safe || fn.owner === role))) {
      throw new Error("OCR database function ACL/owner differs from approved policy.");
    }
  }
}

export async function verifyOcrRuntimePrivileges(client, role) {
  await verifyOcrPrincipalPrivileges(client, role, ocrRuntimeFunctions);
}
