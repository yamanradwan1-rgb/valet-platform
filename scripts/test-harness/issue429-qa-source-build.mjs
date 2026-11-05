import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { runIssue429SafeGit } from "./issue429-qa-git.mjs";

import {
  createIssue429SourceSnapshot,
  freezeIssue429Distribution,
  freezeIssue429SnapshotSource,
  releaseIssue429SourceSnapshot,
} from "./issue429-qa-build-snapshot.mjs";

import {
  assertIssue429CleanSource,
  issue429ArtifactDigest,
} from "./issue429-qa-production-target.mjs";

// An external digest is not source/build provenance. Seals can only be issued
// by this module after a fresh, completed build of both runtime workspaces.
const trustedBuilds = new WeakMap();
const outputSpecs = [
  { packageName: "@valet/contracts", parts: ["packages", "contracts"] },
  { packageName: "@valet/api", parts: ["apps", "api"] },
];

function ownedOutputPath(root, parts) {
  const canonicalRoot = realpathSync(root);
  if (canonicalRoot !== resolve(root)) {
    throw new Error(
      "Issue429 source build requires canonical repository root.",
    );
  }
  let parent = canonicalRoot;
  for (const part of parts) {
    parent = resolve(parent, part);
    if (
      !parent.startsWith(canonicalRoot + sep) ||
      !existsSync(parent) ||
      lstatSync(parent).isSymbolicLink() ||
      realpathSync(parent) !== parent
    ) {
      throw new Error(
        "Issue429 source build refuses a redirected workspace path.",
      );
    }
  }
  const dist = resolve(parent, "dist");
  const tracked = runIssue429SafeGit(canonicalRoot, [
    "ls-files",
    "--",
    relative(canonicalRoot, dist).replaceAll("\\", "/"),
  ]).trim();
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
    throw new Error(
      "Issue429 fresh build requires absent, unowned output; refuses existing dist.",
    );
  }
  return dist;
}

function safeBuildEnvironment() {
  const env = {};
  for (const name of [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "WINDIR",
    "ComSpec",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "COREPACK_HOME",
  ]) {
    if (typeof process.env[name] === "string" && process.env[name]) {
      env[name] = process.env[name];
    }
  }
  return {
    ...env,
    CI: "true",
    COREPACK_ENABLE_NETWORK: "0",
    COREPACK_ENABLE_AUTO_PIN: "0",
    npm_config_offline: "true",
  };
}

function runApprovedBuild(packageName, root) {
  // Literal packages and arguments; no install, no Turbo cache and no
  // inherited PG/operator credentials or arbitrary NODE_OPTIONS.
  execFileSync(
    process.platform === "win32" ? "corepack.cmd" : "corepack",
    ["pnpm", "--filter", packageName, "build"],
    {
      cwd: root,
      env: safeBuildEnvironment(),
      timeout: 180_000,
      windowsHide: true,
      stdio: "pipe",
      shell: process.platform === "win32",
    },
  );
}

function runApprovedInstall(root) {
  // Frozen offline workspace resolution is required. The detached checkout
  // cannot borrow node_modules symlinks pointing back to mutable source.
  execFileSync(
    process.platform === "win32" ? "corepack.cmd" : "corepack",
    ["pnpm", "install", "--offline", "--frozen-lockfile"],
    {
      cwd: root,
      env: safeBuildEnvironment(),
      timeout: 180_000,
      windowsHide: true,
      stdio: "pipe",
      shell: process.platform === "win32",
    },
  );
}

export function buildIssue429FreshArtifact(
  buildSha,
  root,
  { runBuild = runApprovedBuild, runInstall = runApprovedInstall } = {},
) {
  // No lease, DDL or production spawn is performed here. Caller first applies
  // the explicit grant and independent Docker/PG17 target fences.
  assertIssue429CleanSource(buildSha, root);
  // The compiler never reads the mutable source worktree. Git constructs a
  // detached, randomly named, privately owned checkout from the pinned commit.
  const snapshotRoot = createIssue429SourceSnapshot(root, buildSha);
  try {
    assertIssue429CleanSource(buildSha, snapshotRoot);
    runInstall(snapshotRoot);
    assertIssue429CleanSource(buildSha, snapshotRoot);
    freezeIssue429SnapshotSource(snapshotRoot);
    const outputs = outputSpecs.map(({ parts }) =>
      ownedOutputPath(snapshotRoot, parts),
    );
    for (const [index, spec] of outputSpecs.entries()) {
      runBuild(spec.packageName, snapshotRoot);
      if (!existsSync(outputs[index])) {
        throw new Error(
          "Issue429 fresh build did not create its owned output.",
        );
      }
      assertIssue429CleanSource(buildSha, snapshotRoot);
      assertIssue429CleanSource(buildSha, root);
    }
    const distributionPath = resolve(outputs[1], "main.js");
    if (
      !existsSync(distributionPath) ||
      !existsSync(resolve(outputs[0], "index.js"))
    ) {
      throw new Error(
        "Issue429 fresh build missing runtime API or contracts entrypoint.",
      );
    }
    // Runtime children will execute directly from the separate snapshot,
    // whose built files are now read-only. The user's preexisting dist is never
    // used, moved, overwritten, erased, or trusted as the production artifact.
    for (const output of outputs) freezeIssue429Distribution(output);
    const artifact = Object.freeze({
      sourceSha: buildSha,
      repoRoot: resolve(root),
      buildRoot: snapshotRoot,
      distributionPath,
      distributionSha256: issue429ArtifactDigest(outputs[1]),
      contractsSha256: issue429ArtifactDigest(outputs[0]),
    });
    trustedBuilds.set(artifact, snapshotRoot);
    return verifyIssue429FreshArtifact(artifact, root);
  } catch (error) {
    // Only the temporary checkout created by this function may be released.
    // If Git cannot prove/remove ownership, leave it for explicit recovery.
    try {
      releaseIssue429SourceSnapshot(root, snapshotRoot);
    } catch {
      throw new Error("Issue429 owned build cleanup could not be attested.");
    }
    throw error;
  }
}

export function verifyIssue429FreshArtifact(artifact, root) {
  if (
    !artifact ||
    !trustedBuilds.has(artifact) ||
    artifact.repoRoot !== resolve(root)
  ) {
    throw new Error(
      "Issue429 QA requires an internally issued fresh build seal.",
    );
  }
  assertIssue429CleanSource(artifact.sourceSha, root);
  assertIssue429CleanSource(artifact.sourceSha, artifact.buildRoot);
  for (const [directory, digest] of [
    [
      resolve(artifact.buildRoot, "apps", "api", "dist"),
      artifact.distributionSha256,
    ],
    [
      resolve(artifact.buildRoot, "packages", "contracts", "dist"),
      artifact.contractsSha256,
    ],
  ]) {
    if (
      !existsSync(directory) ||
      lstatSync(directory).isSymbolicLink() ||
      issue429ArtifactDigest(directory) !== digest
    ) {
      throw new Error(
        "Issue429 freshly built runtime artifact changed after sealing.",
      );
    }
  }
  return artifact;
}

export function releaseIssue429FreshArtifact(artifact, root) {
  if (
    !artifact ||
    !trustedBuilds.has(artifact) ||
    artifact.repoRoot !== resolve(root)
  ) {
    throw new Error("Issue429 QA refuses to clean an unowned build seal.");
  }
  releaseIssue429SourceSnapshot(root, trustedBuilds.get(artifact));
  trustedBuilds.delete(artifact);
}
