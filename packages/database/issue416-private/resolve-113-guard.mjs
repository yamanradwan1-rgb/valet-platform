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
// Historical Docker identity is independent of name/labels; only the original
// W9 fixture may have its previously failed Prisma history amended.
export const W9_ORIGINAL_RECOVERY_TARGET = Object.freeze({
  containerId: "188f2f28df10bce811b38568f59e8482daa78f14f31f68cc1563346c7b2a758f",
  imageId: "sha256:ab20e934b27ba3ff927c1b4c9ff8cf6c32f315f743efe68dd3441182a87fb085",
  volume: "vaylet-issue416-w9-pg17-data",
});
// SHA256 of all 114 historical Prisma rows (ordered by start/name/id), from
// separately attested original W9 read-only snapshot, including timestamps
// and logs. A different pre-113 history is never an equivalent test target.
export const W9_ORIGINAL_FULL_HISTORY_SHA256 =
  "3aa0fb1e76a5936f1e31784197c75073852df59a5706e2f8471fb10f0c89662c";

export function assertOriginalW9FullHistory(rows) {
  if (!Array.isArray(rows) || rows.length !== 114 ||
      createHash("sha256").update(JSON.stringify(rows)).digest("hex") !==
        W9_ORIGINAL_FULL_HISTORY_SHA256) {
    throw new Error("Issue416 recovery refuses unpinned complete Prisma history.");
  }
}

export function assertOriginalW9RecoveryTarget(candidate, baseline) {
  const pinned = W9_ORIGINAL_RECOVERY_TARGET;
  if (!candidate || candidate.containerId !== pinned.containerId ||
      candidate.imageId !== pinned.imageId || candidate.volume !== pinned.volume ||
      typeof candidate.serverStarted !== "string" || !candidate.serverStarted) {
    throw new Error("Issue416 recovery refuses non-original Docker identity.");
  }
  if (baseline && (baseline.containerId !== candidate.containerId ||
      baseline.imageId !== candidate.imageId ||
      baseline.volume !== candidate.volume ||
      baseline.serverStarted !== candidate.serverStarted)) {
    throw new Error("Issue416 original recovery target changed across snapshots.");
  }
}

export function assertOriginalW9DefaultAcls(before, after) {
  if (!Array.isArray(before) || before.length !== 0 ||
      (arguments.length >= 2 && (!Array.isArray(after) ||
        JSON.stringify(after) !== JSON.stringify(before)))) {
    throw new Error("Issue416 recovery refuses default-ACL state or drift.");
  }
}

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
