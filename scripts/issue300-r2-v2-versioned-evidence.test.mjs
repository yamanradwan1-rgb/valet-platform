import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { publishV2Evidence, readV2Evidence, v2EvidenceName } from
  "./issue300-r2-v2-versioned-evidence.mjs";

const shaA = "a".repeat(40), shaB = "b".repeat(40);
const leaseA = "issue300-r2-versioned-lease-aaa";
const leaseB = "issue300-r2-versioned-lease-bbb";
const record = (candidateSha, leaseId, marker) =>
  ({ candidateSha, leaseId, marker });

function folder() {
  const directory = mkdtempSync(join(tmpdir(), "v2-versioned-"));
  const owned = join(directory, "tmp/issue300-r2-w7-acceptance-v2-owned");
  mkdirSync(dirname(owned));
  return { directory, owned };
}

test("closed v1 SHA/lease names refuse foreign, traversal and unversioned names", () => {
  assert.equal(v2EvidenceName("prepared", shaA, leaseA),
    `R2_PREPARED_SOURCE.v1.${shaA}.${leaseA}.json`);
  assert.equal(v2EvidenceName("manifest", shaB, leaseB),
    `R2_OWNED_RESOURCE_MANIFEST.v1.${shaB}.${leaseB}.json`);
  for (const bad of [
    ["manifest", "../path", leaseA],
    ["manifest", shaA, "../lease"],
    ["manifest", shaA, "issue300-r2-a/../../file"],
    ["manifest", shaA, "issue300-r2-" + "x".repeat(120)],
    ["foreign", shaA, leaseA],
  ]) assert.throws(() => v2EvidenceName(...bad));
});

test("different SHA and lease publish distinct immutable files without mutation", () => {
  const { directory, owned } = folder();
  try {
    const one = record(shaA, leaseA, 1);
    const first = publishV2Evidence(owned, "manifest", one);
    assert.equal(first.reused, false);
    assert.equal(publishV2Evidence(owned, "manifest", one).reused, true);
    const second = publishV2Evidence(owned, "manifest",
      record(shaA, leaseB, 2));
    const third = publishV2Evidence(owned, "manifest",
      record(shaB, leaseA, 3));
    assert.notEqual(first.path, second.path);
    assert.notEqual(first.path, third.path);
    assert.equal(readV2Evidence(owned, "manifest", shaA, leaseA).sha256,
      first.sha256);
    assert.equal(JSON.parse(readFileSync(first.path, "utf8")).marker, 1);
    assert.throws(() => publishV2Evidence(owned, "manifest",
      record(shaA, leaseA, 99)),
    /V2_IMMUTABLE_RECORD_MISMATCH_NEVER_OVERWRITE/);
    assert.equal(JSON.parse(readFileSync(first.path, "utf8")).marker, 1);
    assert.throws(() => readV2Evidence(owned, "manifest", shaB, leaseB));
    const prepared = publishV2Evidence(owned, "prepared", one);
    assert.notEqual(prepared.path, first.path);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("missing new lease never falls back to old fixed or old versioned manifest", () => {
  const { directory, owned } = folder();
  try {
    const published = publishV2Evidence(owned, "manifest",
      record(shaA, leaseA, 1));
    writeFileSync(join(owned, "R2_OWNED_RESOURCE_MANIFEST.json"),
      readFileSync(published.path));
    assert.throws(() => readV2Evidence(owned, "manifest", shaA, leaseB));
    assert.throws(() => readV2Evidence(owned, "manifest", shaB, leaseA));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("tampered payload, swapped symlink leaf and redirected owned dir fail closed", () => {
  const { directory, owned } = folder();
  try {
    const one = record(shaA, leaseA, 1);
    const path = publishV2Evidence(owned, "prepared", one).path;
    writeFileSync(path, JSON.stringify(record(shaA, leaseA, 2)));
    assert.throws(() => publishV2Evidence(owned, "prepared", one),
      /V2_IMMUTABLE_RECORD_MISMATCH_NEVER_OVERWRITE/);
    const other = join(directory, "foreign.json");
    writeFileSync(other, JSON.stringify(one));
    const leaf = join(owned, v2EvidenceName("manifest", shaA, leaseA));
    symlinkSync(other, leaf, "file");
    assert.throws(() => readV2Evidence(owned, "manifest", shaA, leaseA));
    const redirected = join(directory,
      "tmp/issue300-r2-w7-acceptance-v2-owned-link");
    symlinkSync(owned, redirected, "junction");
    assert.throws(() => readV2Evidence(redirected, "prepared", shaA, leaseA));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
