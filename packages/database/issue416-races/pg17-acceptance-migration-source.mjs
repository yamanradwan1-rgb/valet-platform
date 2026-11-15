import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readdirSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";

import {
  assertPinnedMigrationBytes,
  assertReviewedMigrationSet,
  approvedMigrationChecksums,
  REQUIRED_MIGRATIONS,
  verifyPinnedMigrationSources,
} from "./race-migration-pins.mjs";
import { readTrustedMigrationBytes } from "./pg17-acceptance-source-fd.mjs";

const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations/", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function canonicalMigrationLf(bytes) {
  const hasCr = bytes.includes(13);
  const result = [];
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 13) {
      if (bytes[i + 1] !== 10) {
        throw new Error("W30_PG17_MIGRATION_LINE_ENDINGS_UNTRUSTED");
      }
      continue;
    }
    if (hasCr && bytes[i] === 10 && bytes[i - 1] !== 13) {
      throw new Error("W30_PG17_MIGRATION_LINE_ENDINGS_UNTRUSTED");
    }
    result.push(bytes[i]);
  }
  return Buffer.from(result);
}

function crlfBytes(lf) {
  const result = [];
  for (const byte of lf) {
    if (byte === 10) result.push(13);
    result.push(byte);
  }
  return Buffer.from(result);
}

function buildMigrationSourceChecksums() {
  const entries = readdirSync(migrationsPath, { withFileTypes: true }).filter(
    (entry) => /^\d{14}_/.test(entry.name),
  );
  if (entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error("W30_PG17_UNEXPECTED_MIGRATION_DIRECTORY");
  }
  const folders = entries.map((entry) => entry.name).sort();
  const issue416 = folders.filter((name) => /^\d{14}_issue416_/.test(name));
  assertReviewedMigrationSet(issue416);
  if (issue416.length !== REQUIRED_MIGRATIONS.length) {
    throw new Error("W30_PG17_ISSUE416_MIGRATION_SOURCE_INCOMPLETE");
  }
  verifyPinnedMigrationSources();
  const result = new Map();
  for (const name of folders) {
    const path = new URL(
      `../prisma/migrations/${name}/migration.sql`,
      import.meta.url,
    );
    const bytes = readTrustedMigrationBytes(fileURLToPath(path));
    if (REQUIRED_MIGRATIONS.includes(name)) {
      assertPinnedMigrationBytes(name, bytes);
      result.set(name, new Set(approvedMigrationChecksums(name)));
      continue;
    }
    const relative = `packages/database/prisma/migrations/${name}/migration.sql`;
    const committed = execFileSync("git", ["show", `HEAD:${relative}`], {
      cwd: repositoryRoot,
      maxBuffer: 16 * 1024 * 1024,
    });
    const approvedLf = canonicalMigrationLf(committed);
    const currentLf = canonicalMigrationLf(bytes);
    if (!currentLf.equals(approvedLf)) {
      throw new Error("W30_PG17_MIGRATION_SOURCE_NOT_COMMITTED");
    }
    result.set(name, new Set([hash(approvedLf), hash(crlfBytes(approvedLf))]));
  }
  return result;
}

const VERIFIED_MIGRATION_CHECKSUMS = buildMigrationSourceChecksums();

export function migrationSourceChecksums() {
  return new Map(
    [...VERIFIED_MIGRATION_CHECKSUMS].map(([name, hashes]) => [
      name,
      new Set(hashes),
    ]),
  );
}

export function assertCommittedExactLedger(rows) {
  const source = VERIFIED_MIGRATION_CHECKSUMS;
  if (!Array.isArray(rows) || rows.length !== source.size) {
    throw new Error("W30_PG17_MIGRATION_HISTORY_INCOMPLETE");
  }
  const seen = new Set();
  for (const row of rows) {
    if (
      !row ||
      !source.has(row.migration_name) ||
      seen.has(row.migration_name) ||
      !source.get(row.migration_name).has(row.checksum) ||
      row.finished_at == null ||
      row.rolled_back_at != null ||
      row.started_at == null ||
      !Number.isSafeInteger(row.applied_steps_count) ||
      row.applied_steps_count < 1
    ) {
      throw new Error("W30_PG17_MIGRATION_HISTORY_UNTRUSTED");
    }
    seen.add(row.migration_name);
  }
  return seen.size;
}
