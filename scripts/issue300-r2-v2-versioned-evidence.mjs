// Narrow immutable filenames for the disposable V2 proof lane.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";
import { constants, closeSync, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, realpathSync, statSync,
  writeFileSync } from "node:fs";
import { basename, dirname, join, parse, resolve, sep } from "node:path";

const sha = /^[a-f0-9]{40}$/;
const lease = /^issue300-r2-[a-z0-9-]{8,96}$/;
const ownedName = "issue300-r2-w7-acceptance-v2-owned";
const stems = Object.freeze({
  prepared: "R2_PREPARED_SOURCE",
  manifest: "R2_OWNED_RESOURCE_MANIFEST",
});
const fingerprint = (data) => createHash("sha256").update(data).digest("hex");
const norm = (path) => process.platform === "win32"
  ? path.toLowerCase() : path;

export function v2EvidenceName(kind, candidateSha, leaseId) {
  assert(Object.hasOwn(stems, kind), "V2_EVIDENCE_KIND_DENIED");
  assert.match(candidateSha ?? "", sha, "V2_EVIDENCE_CANDIDATE_DENIED");
  assert.match(leaseId ?? "", lease, "V2_EVIDENCE_LEASE_DENIED");
  return `${stems[kind]}.v1.${candidateSha}.${leaseId}.json`;
}

function noAliases(path, directory) {
  const full = resolve(path);
  const root = parse(full).root;
  let current = root;
  for (const section of full.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, section);
    const state = lstatSync(current);
    assert(!state.isSymbolicLink(), "V2_EVIDENCE_ALIAS_DENIED");
    if (norm(realpathSync.native(current)) !== norm(current)) {
      const target = statSync(current);
      assert(process.platform === "win32" &&
        /~[0-9]+(?:\\|$)/i.test(current) &&
        target.dev === state.dev && target.ino === state.ino,
      "V2_EVIDENCE_REPARSE_DENIED");
    }
  }
  const info = lstatSync(full);
  assert(directory ? info.isDirectory() : info.isFile(),
    "V2_EVIDENCE_FILE_TYPE_DENIED");
  return info;
}

export function v2OwnedFolder(folder, create = false) {
  const path = resolve(folder);
  assert.equal(basename(path), ownedName, "V2_EVIDENCE_FOLDER_DENIED");
  assert.equal(basename(dirname(path)), "tmp", "V2_EVIDENCE_PARENT_DENIED");
  // Check the existing parent before mkdir; a junction must not redirect writes.
  noAliases(dirname(path), true);
  if (create && !existsSync(path)) mkdirSync(path, { mode: 0o700 });
  noAliases(path, true);
  return path;
}

export function readV2Evidence(folder, kind, candidateSha, leaseId) {
  const directory = v2OwnedFolder(folder);
  const name = v2EvidenceName(kind, candidateSha, leaseId);
  const path = join(directory, name);
  const before = noAliases(path, false);
  assert(before.nlink === 1 && before.size > 0 && before.size <= 20_480,
    "V2_EVIDENCE_SIZE_LINK_DENIED");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    assert(opened.isFile() && opened.dev === before.dev &&
      opened.ino === before.ino && opened.size === before.size,
    "V2_EVIDENCE_SWAP_DENIED");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const leaf = noAliases(path, false);
    assert(bytes.length === before.size && after.size === before.size &&
      leaf.dev === opened.dev && leaf.ino === opened.ino &&
      leaf.size === opened.size, "V2_EVIDENCE_CHANGED_DURING_READ");
    return { name, path, bytes, sha256: fingerprint(bytes) };
  } finally { closeSync(fd); }
}

export function publishV2Evidence(folder, kind, record) {
  const name = v2EvidenceName(kind, record?.candidateSha, record?.leaseId);
  const directory = v2OwnedFolder(folder, true);
  const bytes = Buffer.from(JSON.stringify(record));
  assert(bytes.length > 0 && bytes.length <= 20_480, "V2_RECORD_OVERSIZE");
  const path = join(directory, name);
  if (existsSync(path)) {
    const previous = readV2Evidence(directory, kind,
      record.candidateSha, record.leaseId).bytes;
    assert(previous.equals(bytes), "V2_IMMUTABLE_RECORD_MISMATCH_NEVER_OVERWRITE");
    return { path, name, sha256: fingerprint(bytes), reused: true };
  }
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  return { path, name, sha256: fingerprint(bytes), reused: false };
}
