import {
  REQUIRED_PRIVATE_FUNCTION_SIGNATURES,
  REQUIRED_PRIVATE_TABLES,
  assertPrivateAcl,
} from "./pg17-acceptance-catalog.mjs";

export const safeAcl = (table_name) => ({
  schema_name: "auth_proof_private",
  table_name,
  relation_kind: "r",
  table_owner: "vap1_proof_owner",
  select_allowed: false,
  insert_allowed: false,
  update_allowed: false,
  delete_allowed: false,
  truncate_allowed: false,
  column_select_allowed: false,
  column_insert_allowed: false,
  column_update_allowed: false,
  public_table_allowed: false,
  nonowner_table_allowed: false,
  nonowner_column_allowed: false,
  owner_membership: false,
  public_column_allowed: false,
});

export const safeFunction = (signature) => ({
  signature,
  function_kind: "f",
  function_owner: "vap1_proof_owner",
  owner_membership: false,
  runtime_execute: false,
  public_execute: false,
  nonowner_execute: false,
});

export const safeSchema = (schema_name) => ({
  schema_name,
  schema_owner:
    schema_name === "auth_proof_private"
      ? "vap1_proof_owner"
      : "issue416_w38_migrator",
  owner_membership: false,
  runtime_usage: false,
  runtime_create: false,
  public_usage: false,
  public_create: false,
  nonowner_create_allowed: false,
  untrusted_schema_usage: false,
  schema_owner_superuser: false,
  extension_owner_superuser: false,
  is_pgcrypto_extension: schema_name === "auth_proof_crypto",
  extension_owner:
    schema_name === "auth_proof_crypto" ? "issue416_w38_migrator" : null,
});

export const safeAcls = () => REQUIRED_PRIVATE_TABLES.map(safeAcl);
export const safeFunctions = () =>
  REQUIRED_PRIVATE_FUNCTION_SIGNATURES.map(safeFunction);
export const safeSchemas = () => [
  safeSchema("auth_proof_private"),
  safeSchema("auth_proof_crypto"),
];
export const safeDefaults = () => [
  {
    default_owner: "vap1_proof_owner",
    default_schema: "auth_proof_private",
    global_public_execute: false,
    global_nonowner_execute: false,
    schema_public_execute: false,
    schema_nonowner_execute: false,
  },
];
export const safeOwnerRole = () => [
  {
    rolname: "vap1_proof_owner",
    rolcanlogin: false,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
  },
];
export const safeOwnerMembership = () => [
  {
    granted_role: "vap1_proof_owner",
    member_role: "issue416_w38_migrator",
    inherit_option: false,
    set_option: true,
    admin_option: false,
  },
];

export const safeRelationRows = () =>
  Array.from({ length: 50 }, (_, i) => ({
    schema_name: "auth_proof_private",
    relation_name: `fixture_private_index_${i}`,
    relation_kind: "i",
    relation_owner: "vap1_proof_owner",
    parent_schema: "auth_proof_private",
    parent_table: REQUIRED_PRIVATE_TABLES[0],
    parent_owner: "vap1_proof_owner",
  }));

export const assertSafeAcl = (
  rows = safeAcls(),
  functions = safeFunctions(),
  schemas = safeSchemas(),
  defaults = safeDefaults(),
  ownerRole = safeOwnerRole(),
  ownerMembership = safeOwnerMembership(),
  relationRows = safeRelationRows(),
) =>
  assertPrivateAcl(
    rows,
    functions,
    schemas,
    defaults,
    ownerRole,
    ownerMembership,
    "issue416_w38_migrator",
    relationRows,
  );
