#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { loadCatalog } from "./catalog.mjs";
import { inspectProvisioner } from "./source-inspect.mjs";
import { inspectMigrations } from "./sql-contract.mjs";
import { inspectLegacySignatures } from "./legacy-signatures.mjs";
import { validateSignedClosure } from "./signed-evidence.mjs";

const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const argumentsList = process.argv.slice(2);
function option(name) {
  const index = argumentsList.indexOf(name);
  if (index < 0) return undefined;
  if (
    index + 1 === argumentsList.length ||
    argumentsList[index + 1].startsWith("--")
  ) {
    throw new Error("Missing value for " + name);
  }
  return argumentsList[index + 1];
}

export function analyze(repoPath) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoPath,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const catalog = loadCatalog(repoPath);
  const source = inspectProvisioner(repoPath);
  const sql = inspectMigrations(repoPath);
  const legacy = inspectLegacySignatures(repoPath);
  return { commit, catalog, source, sql, legacy };
}

export function evaluate(analysis, evidence, key, pinnedSha256) {
  const problems = [
    // This is an offline source diagnostic: an evidence signature authenticates
    // a declaration, never the truth of a running PostgreSQL ACL or cutover.
    { code: "ACTUAL_PG17_ACL_AND_CUTOVER_NOT_VERIFIED_BY_SOURCE_DIAGNOSTIC" },
    ...analysis.catalog.problems,
    ...analysis.source.problems,
    ...analysis.sql.problems,
    ...analysis.legacy.problems,
    ...analysis.legacy.signatures.map(({ family, signature, declaration }) => ({
      code: "UNRETIRED_LEGACY_PROVISIONER_EXECUTE_DECLARATION",
      family,
      signature,
      declaration,
    })),
    ...analysis.source.securityGrants.map(({ code, location, chain }) => ({
      code,
      location,
      chain,
    })),
  ];
  if (!evidence)
    problems.push({ code: "NO_INDEPENDENT_SIGNED_PG17_CLOSURE_EVIDENCE" });
  else
    problems.push(
      ...validateSignedClosure(evidence, key, pinnedSha256, analysis),
    );
  const blockedWriters = analysis.catalog.rows
    .filter((row) => row.class === "AUTHENTICATED_WRITER")
    .map((row) => row.id);
  return {
    verdict: "BLOCKED",
    commit: analysis.commit,
    inspected: {
      inventoried: analysis.catalog.rows.length,
      expected: 35,
      sourceFiles: analysis.source.files.length,
      sourceGraphDigest: analysis.source.digest,
      catalogDigest: analysis.catalog.digest,
      migrationsDigest: analysis.sql.digest,
      parsedSqlProofFunctions: analysis.sql.definitions.length,
      legacyFunctionSignatures: analysis.legacy.signatures.length,
      legacyFunctionDigest: analysis.legacy.digest,
      securityRegrantFindings: analysis.source.securityGrants.length,
      otherRuntimeGrantObservations:
        analysis.source.grants.length - analysis.source.securityGrants.length,
    },
    protectedWritersPending: blockedWriters,
    rowClassification: analysis.catalog.rows.map(({ id, class: kind }) => ({
      id,
      class: kind,
    })),
    reasons: problems,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const analysis = analyze(repo);
    const evidencePath = option("--evidence");
    const keyPath = option("--trusted-key-file");
    const result = evaluate(
      analysis,
      evidencePath
        ? JSON.parse(readFileSync(resolve(evidencePath), "utf8"))
        : undefined,
      keyPath ? readFileSync(resolve(keyPath)) : undefined,
      option("--trusted-key-sha256"),
    );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.verdict === "BLOCKED") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        verdict: "BLOCKED",
        reason: "UNABLE_TO_COMPLETE_SOURCE_INSPECTION",
        detail: String(error.message),
      }) + "\n",
    );
    process.exitCode = 2;
  }
}
