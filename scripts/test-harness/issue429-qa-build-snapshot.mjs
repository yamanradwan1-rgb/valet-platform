import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { runIssue429SafeGit } from "./issue429-qa-git.mjs";

const prefix = "source-snapshot-";
const owned = new Map();

function git(cwd, args, timeout = 30_000) {
  return runIssue429SafeGit(cwd, args, timeout).trim();
}

function assertOwnedPath(sourceRoot, snapshotRoot) {
  const canonicalRoot = realpathSync(sourceRoot);
  const parent = resolve(canonicalRoot, "tmp", "issue429-qa");
  if (
    !existsSync(parent) ||
    lstatSync(parent).isSymbolicLink() ||
    realpathSync(parent) !== parent ||
    !snapshotRoot.startsWith(`${parent}${sep}${prefix}`) ||
    resolve(snapshotRoot) !== snapshotRoot ||
    !owned.has(snapshotRoot) ||
    owned.get(snapshotRoot) !== canonicalRoot
  ) {
    throw new Error("Issue429 QA refuses unowned source snapshot cleanup.");
  }
  return canonicalRoot;
}

/** A detached checkout contains Git blobs from pinned HEAD, not live worktree files. */
export function createIssue429SourceSnapshot(sourceRoot, sha) {
  const canonicalRoot = realpathSync(sourceRoot);
  if (canonicalRoot !== resolve(sourceRoot) || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(
      "Issue429 source snapshot requires a canonical pinned Git root.",
    );
  }
  const parent = resolve(canonicalRoot, "tmp", "issue429-qa");
  if (
    existsSync(parent) &&
    (lstatSync(parent).isSymbolicLink() || realpathSync(parent) !== parent)
  ) {
    throw new Error(
      "Issue429 QA snapshot parent must not redirect outside repo.",
    );
  }
  mkdirSync(parent, { recursive: true });
  // This is a new, randomly named, harness-owned path. No existing workspace
  // artifact or user source is cleaned, overwritten, moved or reset.
  const snapshotRoot = mkdtempSync(join(parent, prefix));
  owned.set(snapshotRoot, canonicalRoot);
  try {
    git(canonicalRoot, ["worktree", "add", "--detach", snapshotRoot, sha]);
    if (git(snapshotRoot, ["rev-parse", "HEAD"]) !== sha) {
      throw new Error("Issue429 detached source snapshot HEAD mismatch.");
    }
    return snapshotRoot;
  } catch (error) {
    // The worktree is never reused after a partial creation. Preserve it for
    // explicit investigation if Git cannot attest/remove its registration.
    try {
      releaseIssue429SourceSnapshot(canonicalRoot, snapshotRoot);
    } catch {
      /* The original failure remains authoritative. */
    }
    throw error;
  }
}

/** Prevent normal editor writes to authored tracked source during compilation. */
export function freezeIssue429SnapshotSource(snapshotRoot) {
  const files = git(snapshotRoot, [
    "ls-files",
    "-z",
    "--",
    "apps/api/src",
    "packages/contracts/src",
  ]);
  for (const item of files.split("\0").filter(Boolean)) {
    const file = resolve(snapshotRoot, item);
    if (
      !file.startsWith(snapshotRoot + sep) ||
      lstatSync(file).isSymbolicLink()
    ) {
      throw new Error("Issue429 snapshot contains redirected authored source.");
    }
    const executableBits = statSync(file).mode & 0o111;
    chmodSync(file, 0o444 | executableBits);
  }
}

/** Dist files are private to the detached build and read-only after hashing. */
export function freezeIssue429Distribution(directory) {
  const visit = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
        throw new Error("Issue429 build artifact contains redirected output.");
      }
      if (entry.isDirectory()) visit(path);
      else chmodSync(path, 0o444 | (statSync(path).mode & 0o111));
    }
  };
  visit(directory);
}

export function releaseIssue429SourceSnapshot(sourceRoot, snapshotRoot) {
  const canonicalRoot = assertOwnedPath(sourceRoot, snapshotRoot);
  // Git force-removal is restricted to the fresh, registered worktree created
  // in this process; it cannot delete an existing or different user worktree.
  git(canonicalRoot, ["worktree", "remove", "--force", snapshotRoot], 60_000);
  owned.delete(snapshotRoot);
}
