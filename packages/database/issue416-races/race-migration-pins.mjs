import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

// Reviewed raw SQL bytes at source baseline e130441a. Prisma stores SHA-256
// migration.sql checksums; a syntactically valid arbitrary 64-hex checksum is
// NOT evidence that the installed migration matches this source.
export const PINNED_MIGRATION_SHA256 = Object.freeze({
  "20261113011200_issue416_reserved_security_audit":
    "4a5071b4f8d2fc6d2e5679a63f82353aee3876e17c9908b05da62d4504ca7df8",
  "20261113011300_issue416_vap1_private_foundation":
    "55faf42491358f9273aff6b99b5c6a13d921c64a7ecc61f030c4703fdb5f8090",
  "20261113011400_issue416_vap1_private_codec":
    "ee1e77d1d7fc06908fee13c69e85aaa95cb15080f7226bc1d384e11b556b2b45",
  "20261113011500_issue416_vap1_private_lifecycle":
    "59ed4cd3e758bea2f6f27b7c3e20c7eca300c8e13b46dda6f4a74abd8e0e75f2",
  "20261113011600_issue416_vap1_audit_gate":
    "793e6ef0a2be4e853e945d6f464f728700e10173af215f11ee8be7ba603c0845",
  "20261113011700_issue416_vap1_key_boundary_guard":
    "9a14e899843236737977f6c271fdc38b31e601cbf678ffa12f840e8d9d322083",
  "20261113012000_issue416_vap1_atomic_reset_quota":
    "3dca00f3e3d5190939b67a6571a8d8f4ada7a3bc900678fac1b6d1e7335902dd",
  "20261113012400_issue416_vap1_atomic_reset_quota_functions":
    "f3769bfbf24c92397ee682102ab7cf67b54e170c4bbbf02fcff6516f966df36d",
  "20261113012500_issue416_redeem_scope_contract":
    "022678685830db8d0f7a8a11ca7bee2da570b282ed518d5240963eaa42dd867e",
  "20261113012600_issue416_private_reset_credentials":
    "768ae27e48709ecd6ae08489a186892cb6420bde86b8cf3e89e2ffecf707f8f0",
  "20261113012700_issue416_reset_credential_receipt_binding":
    "8a1a3ecede877fb14c510999b07165b3ca58557ab701cabb54e96eaa245fbfa0",
  "20261113012800_issue416_reset_private_reservation_abi":
    "1798a9e1e9b98e524e0b699c64a6353830a2c6fbdb0304bb372505ba6e125d72",
  "20261113012900_issue416_a01_limiter_fingerprint":
    "d601ebba6df9542c0c8f17b0bf8afa47dadd257211db4a034af3db1e52c19e0b",
  "20261113013000_issue416_reset_commit_integrity":
    "cfe4b0a6fa6f1e4489ad351ffd10077d7b3229f2acc6d84fad708a9451e5e3c9",
  "20261113013100_issue416_reset_quota_receipt_finalization":
    "c6b4f6df2a8d419ebaad4d0b88b6c0af66757ce8837281964627e6983c774736",
  "20261113013200_issue416_redeem_exact_identity_evidence":
    "eaa3fa0d6255b2c15ac65beb76e5068fdbbc2e15acd0bc92c6bea73ae068baf4",
  "20261113013300_issue416_r03_private_attempt_ledger":
    "23a379264d6e9081195cebda56b391e45fb0560def0c58afcbcac32bc172b6e2",
  "20261113013400_issue416_r03_private_attempt_guards":
    "225918035f87abebcef1b144f9a7ef61b97f021511d266b559df181af2e9df2e",
});

export const REQUIRED_MIGRATIONS = Object.freeze(
  Object.keys(PINNED_MIGRATION_SHA256),
);
export const ORIGINAL_SOURCE_MIGRATIONS = Object.freeze(
  REQUIRED_MIGRATIONS.slice(0, 14),
);
const sourceRoot = fileURLToPath(
  new URL("../prisma/migrations/", import.meta.url),
);

export function assertPinnedMigrationBytes(name, bytes) {
  if (!Object.hasOwn(PINNED_MIGRATION_SHA256, name)) {
    throw new Error("ISSUE416_RACE_SOURCE_MIGRATION_NOT_REVIEWED");
  }
  const current = createHash("sha256").update(bytes).digest("hex");
  if (current !== PINNED_MIGRATION_SHA256[name]) {
    throw new Error("ISSUE416_RACE_SOURCE_MIGRATION_CHECKSUM_CHANGED");
  }
  return true;
}

export function assertReviewedMigrationSet(names) {
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
    throw new Error("ISSUE416_RACE_SOURCE_MIGRATION_SET_CHANGED");
  }
  const actual = [...names].sort();
  const completeOriginal = JSON.stringify(
    [...ORIGINAL_SOURCE_MIGRATIONS].sort(),
  );
  const completePrime = JSON.stringify([...REQUIRED_MIGRATIONS].sort());
  if (![completeOriginal, completePrime].includes(JSON.stringify(actual))) {
    throw new Error("ISSUE416_RACE_SOURCE_MIGRATION_SET_CHANGED");
  }
  return Object.freeze(actual);
}

export function verifyPinnedMigrationSources() {
  const names = assertReviewedMigrationSet(
    readdirSync(sourceRoot).filter((name) => /^\d{14}_issue416_/.test(name)),
  );
  for (const name of names) {
    const bytes = readFileSync(join(sourceRoot, name, "migration.sql"));
    assertPinnedMigrationBytes(name, bytes);
  }
  // A local source identity, not evidence of deployed rows or DB permissions.
  return names;
}
