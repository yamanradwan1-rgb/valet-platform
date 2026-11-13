import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const FAILED_113 = "20261113011300_issue416_vap1_private_foundation";
export const SUCCEEDED_112 = "20261113011200_issue416_reserved_security_audit";
const sourcePath = new URL(`../prisma/migrations/${FAILED_113}/migration.sql`, import.meta.url);
// Exact live W9 fixture fingerprints captured via parent+child-attested READ ONLY
// catalog inspection. These are synthetic fixture IDs, NOT interchangeable
// with another environment or a production migration history.
export const W9_MIGRATIONS = Object.freeze({
  prior112: Object.freeze({
    id: "71081ef4-0946-4c65-90de-b14169c08007",
    checksum: "4a5071b4f8d2fc6d2e5679a63f82353aee3876e17c9908b05da62d4504ca7df8",
  }),
  historical113: Object.freeze({
    id: "2b7ff130-f66b-4aed-9b02-7190b4365980",
    checksum: "d938b237b846b7429bcaae980b6c1519a941852bdd57e719aa1ab3682fafddc9",
  }),
  latest113: Object.freeze({
    id: "7b89a31b-782f-4c1c-9748-e7fd784428fb",
    checksum: "746ce2403987eaadddebb816adea24c92b4ba9720a8da4ed007b890e0a1f8d36",
  }),
});
// Reviewed Prime source after moving BOTH schema REVOKE and default-privilege
// ALTER under SET ROLE vap1_proof_owner. Normalize line endings only.
export const W9_REPAIRED_113_SHA256 =
  "4978f3388b650211a6d588af0c67dcd46a0e31cc2bbecda2589338b44aafffba";

export function assertPinnedSource113(source) {
  const sha = createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
  if (sha !== W9_REPAIRED_113_SHA256) {
    throw new Error("Issue416 W9 recovery requires exact reviewed migration113 source SHA256.");
  }
  assertFixedSource113(source);
}

export function assertFixedSource113(source) {
  // The failed source had a REVOKE on a NOLOGIN-owned schema before SET ROLE.
  // The repaired file must make the owner active before the schema REVOKE.
  const create = source.indexOf("CREATE SCHEMA auth_proof_private AUTHORIZATION vap1_proof_owner;");
  const setRole = source.indexOf("SET ROLE vap1_proof_owner;");
  const revoke = source.indexOf("REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;");
  const defaults = source.indexOf("ALTER DEFAULT PRIVILEGES FOR ROLE vap1_proof_owner");
  const reset = source.indexOf("RESET ROLE;");
  if (create < 0 || setRole <= create || revoke <= setRole ||
      defaults <= setRole || reset <= revoke || reset <= defaults ||
      source.indexOf("REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;", revoke + 1) >= 0 ||
      source.indexOf("ALTER DEFAULT PRIVILEGES FOR ROLE vap1_proof_owner", defaults + 1) >= 0) {
    throw new Error("Issue416 migration113 source lacks BOTH reviewed owner-role guards.");
  }
}

export async function assertFixedMigration113OnDisk() {
  let source;
  try {
    source = await readFile(sourcePath, "utf8");
  } catch {
    throw new Error("Issue416 migration113 source is unavailable in this checkout.");
  }
  assertPinnedSource113(source);
}

export function assertFailed113Snapshot(rows, privateCatalog) {
  if (!Array.isArray(rows) || rows.length < 3 ||
      rows.some((row) => typeof row.id !== "string" || typeof row.checksum !== "string")) {
    throw new Error("Issue416 recovery lacks a valid historical Prisma migration snapshot.");
  }
  const matches = (name) => rows.filter((row) => row.migration_name === name);
  const previous = matches(SUCCEEDED_112);
  const attempts = matches(FAILED_113);
  const prior = attempts.find((row) => row.id === W9_MIGRATIONS.historical113.id);
  const latest = attempts.find((row) => row.id === W9_MIGRATIONS.latest113.id);
  const base = previous[0];
  if (previous.length !== 1 || attempts.length !== 2 || !prior || !latest ||
      base.id !== W9_MIGRATIONS.prior112.id ||
      base.checksum !== W9_MIGRATIONS.prior112.checksum ||
      base.finished_at == null || base.rolled_back_at != null ||
      base.applied_steps_count !== 1 ||
      prior.checksum !== W9_MIGRATIONS.historical113.checksum ||
      prior.finished_at != null || prior.rolled_back_at == null ||
      prior.applied_steps_count !== 0 ||
      !String(prior.logs).includes("42501") ||
      !String(prior.logs).includes("permission denied for schema auth_proof_private") ||
      latest.checksum !== W9_MIGRATIONS.latest113.checksum ||
      latest.finished_at != null || latest.rolled_back_at != null ||
      latest.applied_steps_count !== 0 ||
      (latest.logs != null && latest.logs !== "") ||
      !(Date.parse(base.started_at) < Date.parse(prior.started_at) &&
        Date.parse(prior.started_at) < Date.parse(latest.started_at)) ||
      rows.some((row) => row !== latest && row.finished_at == null &&
        row.rolled_back_at == null) ||
      rows.some((row) => row.migration_name > FAILED_113)) {
    throw new Error("Issue416 recovery refuses unexpected Prisma history or failure signature.");
  }
  if (!privateCatalog || privateCatalog.schema_count !== 0 ||
      privateCatalog.relation_count !== 0 || privateCatalog.proof_role_count !== 0) {
    throw new Error("Issue416 recovery refuses existing private schema, relations or proof owner.");
  }
  return latest.id;
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
        (old.id === W9_MIGRATIONS.latest113.id
          ? (old.rolled_back_at != null || row.rolled_back_at == null)
          : old.rolled_back_at !== row.rolled_back_at)) {
      throw new Error("Issue416 recovery changed an unexpected Prisma migration field.");
    }
  }
}
