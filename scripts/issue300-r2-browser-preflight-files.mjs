// Task-only immutable browser preflight: newest exact SHA/lease/epoch, never env paths.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { verify } from "node:crypto";
import process from "node:process";
import { constants, closeSync, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, join, parse, resolve, sep } from "node:path";

const sha40 = /^[a-f0-9]{40}$/;
const leasePattern = /^issue300-r2-w7-[a-z0-9-]{8,96}$/;
const ownedName = "issue300-r2-v2-prime-owned";
const stem = "W7_V2_INDEPENDENT_LIVE_PREFLIGHT.v1";
const norm = (path) => process.platform === "win32" ? path.toLowerCase() : path;

export function preflightName(candidateSha, leaseId, epoch) {
  assert.match(candidateSha ?? "", sha40, "PREFLIGHT_SHA_DENIED");
  assert.match(leaseId ?? "", leasePattern, "PREFLIGHT_LEASE_DENIED");
  assert(Number.isSafeInteger(epoch) && epoch >= 1_600_000_000_000 &&
    epoch <= 9_999_999_999_999, "PREFLIGHT_EPOCH_DENIED");
  return `${stem}.${candidateSha}.${leaseId}.${epoch}.json`;
}

function inspectPath(path, directory) {
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  for (const component of absolute.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, component);
    const state = lstatSync(cursor);
    assert(!state.isSymbolicLink(), "PREFLIGHT_SYMLINK_OR_JUNCTION_DENIED");
    if (norm(realpathSync.native(cursor)) !== norm(cursor)) {
      const target = statSync(cursor);
      assert(process.platform === "win32" &&
        /~[0-9]+(?:\\|$)/i.test(cursor) &&
        target.dev === state.dev && target.ino === state.ino,
      "PREFLIGHT_REPARSE_DENIED");
    }
  }
  const stat = lstatSync(absolute);
  assert(directory ? stat.isDirectory() : stat.isFile(),
    "PREFLIGHT_UNEXPECTED_FILE_TYPE");
  return stat;
}

function taskDirectory(folder) {
  const path = resolve(folder);
  assert.equal(basename(path), ownedName, "PREFLIGHT_FOREIGN_FOLDER");
  inspectPath(path, true);
  return path;
}

function readExactFile(folder, name, max) {
  const path = join(folder, name);
  const before = inspectPath(path, false);
  assert(before.nlink === 1 && before.size > 0 && before.size <= max,
    "PREFLIGHT_UNSAFE_FILE");
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    assert(opened.isFile() && opened.nlink === 1 &&
      opened.dev === before.dev && opened.ino === before.ino &&
      opened.size === before.size, "PREFLIGHT_OPEN_SWAP");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const leaf = inspectPath(path, false);
    assert(bytes.length === before.size && after.size === opened.size &&
      after.dev === opened.dev && after.ino === opened.ino &&
      leaf.dev === opened.dev && leaf.ino === opened.ino &&
      leaf.size === opened.size && leaf.nlink === 1,
    "PREFLIGHT_READ_SWAP");
    return bytes;
  } finally { closeSync(fd); }
}

function newestName(folder, candidateSha) {
  const prefix = `${stem}.${candidateSha}.`;
  const entries = readdirSync(folder);
  assert(entries.length <= 4096, "PREFLIGHT_DIRECTORY_OVERFLOW");
  const matches = entries.filter((entry) => entry.toLowerCase().startsWith(
    prefix.toLowerCase()) && entry.toLowerCase().endsWith(".json"));
  assert(matches.length > 0 && matches.length <= 512,
    "PREFLIGHT_MISSING_OR_EXCESSIVE");
  // Invalid source-like names poison the selection, never silently fall back.
  const candidates = matches.map((name) => {
    const match = /^issue300-r2-w7-[a-z0-9-]{8,96}\.([0-9]{13})$/
      .exec(name.slice(prefix.length, -5));
    const leaseId = name.slice(prefix.length, -5).slice(0, -(14));
    const epoch = Number(match?.[1]);
    assert(match && preflightName(candidateSha, leaseId, epoch) === name,
      "PREFLIGHT_UNEXPECTED_VERSIONED_FILE");
    return { name, epoch, leaseId };
  });
  candidates.sort((a, b) => b.epoch - a.epoch);
  assert(candidates.length < 2 ||
    candidates[0].epoch !== candidates[1].epoch,
  "PREFLIGHT_EPOCH_COLLISION");
  return candidates[0];
}

function assertEpoch(proof, candidateSha, leaseId, epoch, now) {
  assert(proof?.candidateSha === candidateSha && proof.leaseId === leaseId,
    "PREFLIGHT_SOURCE_OR_LEASE_MISMATCH");
  assert(proof.issuedAt === new Date(epoch).toISOString() &&
    proof.expiresAt === new Date(epoch + 60_000).toISOString() &&
    now >= epoch && now < epoch + 60_000,
  "PREFLIGHT_STALE_FUTURE_OR_REPLAY");
}

export function selectSignedPreflight(folder, candidateSha, leaseId, now, publicKey) {
  preflightName(candidateSha, leaseId, now);
  assert(publicKey, "PREFLIGHT_OWNER_KEY_REQUIRED");
  const owned = taskDirectory(folder);
  const selected = newestName(owned, candidateSha);
  assert.equal(selected.leaseId, leaseId,
    "PREFLIGHT_OLD_OR_FOREIGN_LEASE_REPLAY");
  const bytes = readExactFile(owned, selected.name, 8192);
  const signature = readExactFile(owned, `${selected.name}.sig`, 64);
  assert(signature.length === 64 && verify(null, bytes, publicKey, signature),
    "PREFLIGHT_OWNER_SIGNATURE_INVALID");
  const proof = JSON.parse(bytes.toString("utf8"));
  assert(Buffer.from(JSON.stringify(proof)).equals(bytes),
    "PREFLIGHT_NONCANONICAL_BYTES");
  assertEpoch(proof, candidateSha, leaseId, selected.epoch, now);
  assert.equal(newestName(owned, candidateSha).name, selected.name,
    "PREFLIGHT_SELECTION_CHANGED");
  assert(readExactFile(owned, selected.name, 8192).equals(bytes) &&
    readExactFile(owned, `${selected.name}.sig`, 64).equals(signature),
  "PREFLIGHT_SELECTED_BYTES_CHANGED");
  return { path: join(owned, selected.name), epoch: selected.epoch,
    bytes, signature, proof };
}

export function publishSignedPreflight(folder, bytes, signature, publicKey,
  now = Date.now()) {
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 8192 &&
    Buffer.isBuffer(signature) && signature.length === 64 &&
    verify(null, bytes, publicKey, signature),
  "PREFLIGHT_OWNER_SIGNATURE_INVALID");
  const proof = JSON.parse(bytes.toString("utf8"));
  assert(Buffer.from(JSON.stringify(proof)).equals(bytes),
    "PREFLIGHT_NONCANONICAL_BYTES");
  const epoch = Date.parse(proof.issuedAt);
  const name = preflightName(proof.candidateSha, proof.leaseId, epoch);
  assertEpoch(proof, proof.candidateSha, proof.leaseId, epoch, now);
  const owned = taskDirectory(folder);
  // The new epoch must be greater than the last published epoch for this lease.
  const existing = readdirSync(owned).filter((item) =>
    item.toLowerCase().startsWith(`${stem}.${proof.candidateSha}.`.toLowerCase()) &&
    item.toLowerCase().endsWith(".json"));
  if (existing.length) assert(newestName(owned, proof.candidateSha).epoch < epoch,
    "PREFLIGHT_EPOCH_REPLAY");
  // Sidecar first; JSON is the write-once commit marker.
  writeFileSync(join(owned, `${name}.sig`), signature,
    { flag: "wx", mode: 0o600 });
  writeFileSync(join(owned, name), bytes, { flag: "wx", mode: 0o600 });
  const selected = selectSignedPreflight(owned, proof.candidateSha,
    proof.leaseId, now, publicKey);
  assert(selected.bytes.equals(bytes) &&
    selected.signature.equals(signature), "PREFLIGHT_PUBLISH_RACE");
  return selected;
}
