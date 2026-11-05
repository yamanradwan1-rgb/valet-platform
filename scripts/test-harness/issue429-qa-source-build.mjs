import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

import {
  assertIssue429CleanSource,
  issue429ArtifactDigest,
} from "./issue429-qa-production-target.mjs";

// An external digest is not source/build provenance. Seals can only be issued
// by this module after a fresh, completed build of both runtime workspaces.
const trustedBuilds = new WeakSet();
const outputSpecs = [
  { packageName: "@valet/contracts", parts: ["packages", "contracts"] },
  { packageName: "@valet/api", parts: ["apps", "api"] },
];

function ownedOutputPath(root, parts) {
  const canonicalRoot = realpathSync(root);
  if (canonicalRoot !== resolve(root)) {
    throw new Error("Issue429 source build requires canonical repository root.");
  }
  let parent = canonicalRoot;
  for (const part of parts) {
    parent = resolve(parent, part);
    if (!parent.startsWith(canonicalRoot + sep) ||
        !existsSync(parent) || lstatSync(parent).isSymbolicLink() ||
        realpathSync(parent) !== parent) {
      throw new Error("Issue429 source build refuses a redirected workspace path.");
    }
  }
  const dist = resolve(parent, "dist");
  const tracked = execFileSync("git",
    ["ls-files", "--", relative(canonicalRoot, dist).replaceAll("\\", "/")], {
      cwd: canonicalRoot, encoding: "utf8", timeout: 4_000, windowsHide: true,
    }).trim();
  // existsSync is false for a dangling symlink; lstat rejects that too.
  let occupied = false;
  try {
    lstatSync(dist);
    occupied = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (tracked || occupied) {
    // Do not delete, overwrite or relocate another build's artifacts.
    throw new Error("Issue429 fresh build requires absent, unowned output; refuses existing dist.");
  }
  return dist;
}

function safeBuildEnvironment() {
  const env = {};
  for (const name of [
    "PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "ComSpec",
    "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    "COREPACK_HOME",
  ]) {
    if (typeof process.env[name] === "string" && process.env[name]) {
      env[name] = process.env[name];
    }
  }
  return {
    ...env, CI: "true", COREPACK_ENABLE_NETWORK: "0",
    COREPACK_ENABLE_AUTO_PIN: "0", npm_config_offline: "true",
  };
}

function runApprovedBuild(packageName, root) {
  // Literal packages and arguments; no install, no Turbo cache and no
  // inherited PG/operator credentials or arbitrary NODE_OPTIONS.
  execFileSync(process.platform === "win32" ? "corepack.cmd" : "corepack",
    ["pnpm", "--filter", packageName, "build"], {
      cwd: root, env: safeBuildEnvironment(), timeout: 180_000,
      windowsHide: true, stdio: "pipe", shell: process.platform === "win32",
    });
}

export function buildIssue429FreshArtifact(buildSha, root, runBuild = runApprovedBuild) {
  // No lease, DDL or production spawn is performed here. Caller first applies
  // the explicit grant and independent Docker/PG17 target fences.
  assertIssue429CleanSource(buildSha, root);
  const outputs = outputSpecs.map(({ parts }) => ownedOutputPath(root, parts));
  for (const [index, spec] of outputSpecs.entries()) {
    runBuild(spec.packageName, root);
    if (!existsSync(outputs[index])) {
      throw new Error("Issue429 fresh build did not create its owned output.");
    }
    assertIssue429CleanSource(buildSha, root);
  }
  const distributionPath = resolve(outputs[1], "main.js");
  if (!existsSync(distributionPath) ||
      !existsSync(resolve(outputs[0], "index.js"))) {
    throw new Error("Issue429 fresh build missing runtime API or contracts entrypoint.");
  }
  const artifact = Object.freeze({
    sourceSha: buildSha,
    repoRoot: resolve(root),
    distributionPath,
    distributionSha256: issue429ArtifactDigest(outputs[1]),
    contractsSha256: issue429ArtifactDigest(outputs[0]),
  });
  trustedBuilds.add(artifact);
  return verifyIssue429FreshArtifact(artifact, root);
}

export function verifyIssue429FreshArtifact(artifact, root) {
  if (!artifact || !trustedBuilds.has(artifact) ||
      artifact.repoRoot !== resolve(root)) {
    throw new Error("Issue429 QA requires an internally issued fresh build seal.");
  }
  assertIssue429CleanSource(artifact.sourceSha, root);
  for (const [directory, digest] of [
    [resolve(root, "apps", "api", "dist"), artifact.distributionSha256],
    [resolve(root, "packages", "contracts", "dist"), artifact.contractsSha256],
  ]) {
    if (!existsSync(directory) || lstatSync(directory).isSymbolicLink() ||
        issue429ArtifactDigest(directory) !== digest) {
      throw new Error("Issue429 freshly built runtime artifact changed after sealing.");
    }
  }
  return artifact;
}
