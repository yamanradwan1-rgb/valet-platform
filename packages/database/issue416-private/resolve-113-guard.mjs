import { readFile } from "node:fs/promises";

export const FAILED_113 = "20261113011300_issue416_vap1_private_foundation";
export const SUCCEEDED_112 = "20261113011200_issue416_reserved_security_audit";
const sourcePath = new URL(`../prisma/migrations/${FAILED_113}/migration.sql`, import.meta.url);

export function assertFixedSource113(source) {
  // The failed source had a REVOKE on a NOLOGIN-owned schema before SET ROLE.
  // The repaired file must make the owner active before the schema REVOKE.
  const create = source.indexOf("CREATE SCHEMA auth_proof_private AUTHORIZATION vap1_proof_owner;");
  const setRole = source.indexOf("SET ROLE vap1_proof_owner;");
  const revoke = source.indexOf("REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;");
  const reset = source.indexOf("RESET ROLE;");
  if (create < 0 || setRole <= create || revoke <= setRole || reset <= revoke ||
      source.indexOf("REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;", revoke + 1) >= 0) {
    throw new Error("Issue416 migration113 source still lacks the reviewed owner-role REVOKE ordering.");
  }
}

export async function assertFixedMigration113OnDisk() {
  let source;
  try {
    source = await readFile(sourcePath, "utf8");
  } catch {
    throw new Error("Issue416 migration113 source is unavailable in this checkout.");
  }
  assertFixedSource113(source);
}

export function assertFailed113Snapshot(rows, privateCatalog) {
  if (!Array.isArray(rows) || rows.length < 2 ||
      rows.some((row) => typeof row.id !== "string")) {
    throw new Error("Issue416 recovery lacks a valid historical Prisma migration snapshot.");
  }
  const matches = (name) => rows.filter((row) => row.migration_name === name);
  const previous = matches(SUCCEEDED_112);
  const failed = matches(FAILED_113);
  if (previous.length !== 1 || previous[0].finished_at == null ||
      previous[0].rolled_back_at != null ||
      failed.length !== 1 || failed[0].finished_at != null ||
      failed[0].rolled_back_at != null || failed[0].applied_steps_count !== 0 ||
      !String(failed[0].logs).includes("42501") ||
      !String(failed[0].logs).includes("permission denied for schema auth_proof_private") ||
      rows.some((row) => row !== failed[0] &&
        row.finished_at == null && row.rolled_back_at == null) ||
      rows.some((row) => row.migration_name > FAILED_113)) {
    throw new Error("Issue416 recovery refuses unexpected Prisma history or failure signature.");
  }
  if (!privateCatalog || privateCatalog.schema_count !== 0 ||
      privateCatalog.relation_count !== 0 || privateCatalog.proof_role_count !== 0) {
    throw new Error("Issue416 recovery refuses existing private schema, relations or proof owner.");
  }
  return failed[0].id;
}

export function assertResolve113OnlyChangedTarget(before, after) {
  if (!Array.isArray(after) || before.length !== after.length) {
    throw new Error("Issue416 recovery altered the migration history row count.");
  }
  for (let i = 0; i < before.length; i += 1) {
    const old = before[i];
    const row = after[i];
    if (old.id !== row.id || old.migration_name !== row.migration_name ||
        old.checksum !== row.checksum || old.started_at !== row.started_at ||
        old.finished_at !== row.finished_at || old.logs !== row.logs ||
        old.applied_steps_count !== row.applied_steps_count ||
        (old.migration_name === FAILED_113
          ? row.rolled_back_at == null
          : old.rolled_back_at !== row.rolled_back_at)) {
      throw new Error("Issue416 recovery changed an unexpected Prisma migration field.");
    }
  }
}
