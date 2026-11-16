// One catalog-wide effective ACL inventory. PostgreSQL table-level privilege
// checks do NOT expose column-only grants (e.g. UPDATE(organizations.name)).
// This verifier must reject those unexpected grants even on new public tables.
export async function verifyManagementWriterMutationInventory(client, role) {
  const unexpected = await client.query(
    `SELECT relation.relname AS relation_name,attribute.attname AS column_name
       FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
       LEFT JOIN pg_catalog.pg_attribute attribute
         ON attribute.attrelid=relation.oid AND attribute.attnum>0
        AND NOT attribute.attisdropped
       WHERE namespace.nspname='public' AND relation.relkind IN ('r','p','v','f')
         AND (
           pg_catalog.has_table_privilege($1,relation.oid,'INSERT')
             IS DISTINCT FROM (relation.relname='audit_events')
           OR pg_catalog.has_table_privilege($1,relation.oid,'UPDATE')
           OR pg_catalog.has_table_privilege($1,relation.oid,'DELETE')
           OR pg_catalog.has_table_privilege($1,relation.oid,'TRUNCATE')
           OR pg_catalog.has_table_privilege($1,relation.oid,'REFERENCES')
           OR pg_catalog.has_table_privilege($1,relation.oid,'TRIGGER')
           OR (attribute.attnum IS NOT NULL AND (
             pg_catalog.has_column_privilege($1,relation.oid,attribute.attnum,'INSERT')
               IS DISTINCT FROM (relation.relname='audit_events')
             OR pg_catalog.has_column_privilege($1,relation.oid,attribute.attnum,'UPDATE') IS TRUE
             OR pg_catalog.has_column_privilege($1,relation.oid,attribute.attnum,'REFERENCES')
           ))
         ) LIMIT 1`,
    [role],
  );
  if (unexpected.rowCount !== 0) {
    throw new Error(
      "Management writer has unexpected table or column mutation authority.",
    );
  }
  const sequences = await client.query(
    `SELECT relation.relname
       FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
       WHERE namespace.nspname='public' AND relation.relkind='S' AND (
         pg_catalog.has_sequence_privilege($1,relation.oid,'SELECT') OR
         pg_catalog.has_sequence_privilege($1,relation.oid,'USAGE') OR
         pg_catalog.has_sequence_privilege($1,relation.oid,'UPDATE')
       ) LIMIT 1`,
    [role],
  );
  if (sequences.rowCount !== 0) {
    throw new Error(
      "Management writer has unexpected public sequence authority.",
    );
  }
}
