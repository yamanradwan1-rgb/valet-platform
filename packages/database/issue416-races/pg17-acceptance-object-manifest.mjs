import { createHash } from "node:crypto";

// Grounded in W30's independently attested PostgreSQL 17.11, 140/140 migrated
// disposable fixture; evidence SHA256 bcdd74c3af035bdf888550b618d691565eeb98e9f6c804663b6762cb4760e36b.
// These pins are intentionally exact: changed index predicates/uniqueness,
// dropped constraints or replaced trigger timing MUST fail before acceptance.
export const REQUIRED_OBJECT_PINS = Object.freeze({
  indexes: {
    count: 50,
    digest: "d5439baaf2a76c5d97677389aa88af93c083be604594abf60b66565b20353505",
  },
  constraints: {
    count: 142,
    digest: "fdd86786ee7a5cf80261ad1aa325703081bded0ca013a5b6594eb64b7372bc12",
  },
  triggers: {
    count: 32,
    digest: "8be5a7ea139364853b54a405829bbead560b7ce9c4e8bd0b99d6364bb855f852",
  },
});

export const INDEX_FIELDS = Object.freeze([
  "schema_name",
  "index_name",
  "index_relkind",
  "index_owner",
  "parent_schema",
  "parent_table",
  "table_owner",
  "index_definition",
  "indisunique",
  "indisprimary",
  "indisvalid",
  "indisready",
  "indislive",
  "indisexclusion",
  "indnullsnotdistinct",
  "predicate",
]);
export const CONSTRAINT_FIELDS = Object.freeze([
  "schema_name",
  "parent_table",
  "constraint_name",
  "contype",
  "constraint_definition",
  "convalidated",
  "condeferrable",
  "condeferred",
  "connoinherit",
]);
export const TRIGGER_FIELDS = Object.freeze([
  "schema_name",
  "table_name",
  "trigger_name",
  "tgenabled",
  "tgtype",
  "trigger_function",
  "trigger_definition",
]);

export function objectCatalogDigest(rows, fields) {
  if (
    !Array.isArray(rows) ||
    !Array.isArray(fields) ||
    !fields.length ||
    !rows.every(
      (row) => row && fields.every((name) => Object.hasOwn(row, name)),
    )
  ) {
    throw new Error("W30_PG17_PRIVATE_OBJECT_FIELDS_INCOMPLETE");
  }
  const sorted = rows.map((row) => fields.map((name) => row[name]));
  sorted.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
  );
  return createHash("sha256")
    .update(JSON.stringify(sorted), "utf8")
    .digest("hex");
}

export function assertPinnedObjectCatalog(indexes, constraints, triggers) {
  for (const [kind, rows, fields] of [
    ["indexes", indexes, INDEX_FIELDS],
    ["constraints", constraints, CONSTRAINT_FIELDS],
    ["triggers", triggers, TRIGGER_FIELDS],
  ]) {
    const expected = REQUIRED_OBJECT_PINS[kind];
    if (
      !Array.isArray(rows) ||
      rows.length !== expected.count ||
      objectCatalogDigest(rows, fields) !== expected.digest
    ) {
      throw new Error(
        `W30_PG17_PRIVATE_${kind.toUpperCase()}_MANIFEST_UNPROVEN`,
      );
    }
  }
  return true;
}

export const PRIVATE_INDEX_SQL = `
SELECT n.nspname AS schema_name, c.relname AS index_name,
 c.relkind AS index_relkind, pg_get_userbyid(c.relowner) AS index_owner,
 tn.nspname AS parent_schema, t.relname AS parent_table,
 pg_get_userbyid(t.relowner) AS table_owner,
 pg_get_indexdef(c.oid) AS index_definition,
 x.indisunique, x.indisprimary, x.indisvalid, x.indisready,
 x.indislive, x.indisexclusion, x.indnullsnotdistinct,
 pg_get_expr(x.indpred,x.indrelid) AS predicate
FROM pg_index x
JOIN pg_class c ON c.oid=x.indexrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_class t ON t.oid=x.indrelid
JOIN pg_namespace tn ON tn.oid=t.relnamespace
WHERE left(n.nspname,11)='auth_proof_'`;

export const PRIVATE_CONSTRAINT_SQL = `
SELECT n.nspname AS schema_name,
 n.nspname || '.' || t.relname AS parent_table,
 c.conname AS constraint_name, c.contype,
 pg_get_constraintdef(c.oid,true) AS constraint_definition,
 c.convalidated, c.condeferrable, c.condeferred, c.connoinherit
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE left(n.nspname,11)='auth_proof_'`;
