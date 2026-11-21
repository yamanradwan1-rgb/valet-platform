import { runtimeStaffSessionReadColumns } from "./staff-auth-writer-grants.mjs";

export async function verifyStaffAuthRuntimeReadGrants(client, runtimeRole) {
  for (const [table, allowedColumns] of Object.entries(
    runtimeStaffSessionReadColumns,
  )) {
    const tableGrant = await client.query(
      "SELECT pg_catalog.has_table_privilege($1,$2,'SELECT') AS allowed",
      [runtimeRole, `public.${table}`],
    );
    if (tableGrant.rows[0]?.allowed !== false) {
      throw new Error(`Runtime must not have table-level SELECT on ${table}.`);
    }
    const columns = await client.query(
      `SELECT attribute.attname AS column_name
         FROM pg_catalog.pg_attribute attribute
         JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='public' AND relation.relname=$1
          AND attribute.attnum>0 AND NOT attribute.attisdropped`,
      [table],
    );
    const found = new Set(columns.rows.map((row) => row.column_name));
    if (allowedColumns.some((column) => !found.has(column))) {
      throw new Error(
        `Runtime read contract references missing ${table} column.`,
      );
    }
    for (const column of found) {
      const result = await client.query(
        "SELECT pg_catalog.has_column_privilege($1,$2,$3,'SELECT') AS allowed",
        [runtimeRole, `public.${table}`, column],
      );
      if (result.rows[0]?.allowed !== allowedColumns.includes(column)) {
        throw new Error(
          `Runtime SELECT contract violated: ${table}.${column}.`,
        );
      }
    }
  }
}
