// Offline only: synthetic task-owned proof files and disposable Ed25519 keys.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { preflightName, publishSignedPreflight, selectSignedPreflight } from
  "./issue300-r2-browser-preflight-files.mjs";

const candidate = "a".repeat(40);
const nextCandidate = "b".repeat(40);
const lease = "issue300-r2-w7-browser-renewal-0001";
const nextLease = "issue300-r2-w7-browser-renewal-0002";
const epoch = 1_792_400_000_000;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const identity = (candidateSha = candidate, leaseId = lease, at = epoch) => ({
  candidateSha, leaseId, issuedAt: new Date(at).toISOString(),
  expiresAt: new Date(at + 60_000).toISOString(), kind: "synthetic-test-preflight",
});
const encode = (document) => {
  const bytes = Buffer.from(JSON.stringify(document));
  return [bytes, sign(null, bytes, privateKey)];
};
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), "w17-browser-preflight-"));
  const folder = join(root, "tmp/issue300-r2-v2-prime-owned");
  mkdirSync(folder, { recursive: true });
  try { return fn({ root, folder }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function publish(folder, document, now = Date.parse(document.issuedAt)) {
  return publishSignedPreflight(folder, ...encode(document), publicKey, now);
}

test("distinct final SHA/lease/epoch produce immutable bounded names", () => {
  const name = preflightName(candidate, lease, epoch);
  assert.equal(name, `W7_V2_INDEPENDENT_LIVE_PREFLIGHT.v1.${candidate}.${lease}.${epoch}.json`);
  for (const bad of [
    ["x", lease, epoch], [candidate, "../escape", epoch],
    [candidate, lease, -1], [candidate, lease, Infinity],
    [candidate, lease, 1_792_400_000_000.5],
    [candidate, "issue300-r2-w7-" + "x".repeat(120), epoch],
  ]) assert.throws(() => preflightName(...bad));
});

test("positive multiple epoch renewals and distinct legitimate leases and SHAs", () =>
  fixture(({ folder }) => {
    const first = publish(folder, identity());
    const nextEpoch = epoch + 20_000;
    const next = publish(folder, identity(candidate, lease, nextEpoch), nextEpoch);
    const foreignLease = publish(folder, identity(candidate, nextLease, epoch + 30_000),
      epoch + 30_000);
    const foreignSha = publish(folder, identity(nextCandidate, lease, epoch + 12_000),
      epoch + 12_000);
    assert.notEqual(first.path, next.path);
    assert.notEqual(first.path, foreignLease.path);
    assert.notEqual(first.path, foreignSha.path);
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch + 31_000, publicKey), /PREFLIGHT_OLD_OR_FOREIGN_LEASE_REPLAY/);
    assert.equal(selectSignedPreflight(folder, candidate, nextLease, epoch + 31_000,
      publicKey).path, foreignLease.path);
    assert.equal(selectSignedPreflight(folder, nextCandidate, lease, epoch + 31_000,
      publicKey).path, foreignSha.path);
    assert.throws(() => publish(folder, identity(), epoch + 21_000),
      /PREFLIGHT_EPOCH_REPLAY/);
    assert.throws(() => selectSignedPreflight(folder, candidate, nextLease,
      epoch + 91_000, publicKey), /PREFLIGHT_STALE_FUTURE_OR_REPLAY/);
  }));

test("legacy fixed preflight and unrelated lease cannot silently become active", () =>
  fixture(({ folder }) => {
    const [bytes, signature] = encode(identity());
    writeFileSync(join(folder, "W7_V2_INDEPENDENT_LIVE_PREFLIGHT.json"), bytes);
    writeFileSync(join(folder, "W7_V2_INDEPENDENT_LIVE_PREFLIGHT.json.sig"),
      signature);
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch, publicKey), /PREFLIGHT_MISSING_OR_EXCESSIVE/);
    publish(folder, identity(candidate, nextLease));
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch, publicKey), /PREFLIGHT_OLD_OR_FOREIGN_LEASE_REPLAY/);
    assert.throws(() => selectSignedPreflight(folder, nextCandidate, nextLease,
      epoch, publicKey), /PREFLIGHT_MISSING_OR_EXCESSIVE/);
  }));

test("newest invalid signature is fatal; never fall back to older valid proof", () =>
  fixture(({ folder }) => {
    publish(folder, identity());
    const later = publish(folder, identity(candidate, lease, epoch + 10_000),
      epoch + 10_000);
    writeFileSync(later.path + ".sig", Buffer.alloc(64, 8));
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch + 11_000, publicKey), /PREFLIGHT_OWNER_SIGNATURE_INVALID/);
    assert.throws(() => publish(folder, identity(candidate, lease, epoch + 10_000),
      epoch + 11_000), /PREFLIGHT_EPOCH_REPLAY/);
  }));

test("fail closed on expired/future/overlong, forged bytes, and mismatched path identities", () =>
  fixture(({ folder }) => {
    assert.throws(() => publish(folder, identity(candidate, lease, epoch + 1000),
      epoch), /PREFLIGHT_STALE_FUTURE_OR_REPLAY/);
    assert.throws(() => publish(folder, identity(candidate, lease, epoch - 60000),
      epoch), /PREFLIGHT_STALE_FUTURE_OR_REPLAY/);
    assert.throws(() => publish(folder, {
      ...identity(), expiresAt: new Date(epoch + 90000).toISOString(),
    }), /PREFLIGHT_STALE_FUTURE_OR_REPLAY/);
    const [bytes, signature] = encode(identity());
    assert.throws(() => publishSignedPreflight(folder, Buffer.from(bytes.toString() + " "),
      signature, publicKey, epoch), /PREFLIGHT_OWNER_SIGNATURE_INVALID/);
    const published = publish(folder, identity());
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch - 1, publicKey), /PREFLIGHT_STALE_FUTURE_OR_REPLAY/);
    writeFileSync(published.path, JSON.stringify({ ...identity(), kind: "forged" }));
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch + 1, publicKey), /PREFLIGHT_OWNER_SIGNATURE_INVALID/);
  }));

test("reject symlink, hardlink, junction, foreign folder, and missing sidecar", (t) =>
  fixture(({ root, folder }) => {
    const output = publish(folder, identity());
    const back = readFileSync(output.path);
    rmSync(output.path);
    const outside = join(root, "outside.json");
    writeFileSync(outside, back);
    try { symlinkSync(outside, output.path, "file"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes(error?.code)) t.skip("No symlink privilege");
      else throw error;
    }
    if (readFileSync(output.path).equals(back)) assert.throws(() =>
      selectSignedPreflight(folder, candidate, lease, epoch + 1, publicKey),
    /PREFLIGHT_SYMLINK_OR_JUNCTION_DENIED/);
    rmSync(output.path);
    linkSync(outside, output.path);
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch + 1, publicKey), /PREFLIGHT_UNSAFE_FILE/);
    rmSync(output.path);
    writeFileSync(output.path, back);
    rmSync(output.path + ".sig");
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch + 1, publicKey));
    assert.throws(() => selectSignedPreflight(join(root, "outside"),
      candidate, lease, epoch + 1, publicKey));
  }));

test("reject task-owned folder junction and altered-case newest filename", (t) =>
  fixture(({ root, folder }) => {
    const earlier = publish(folder, identity());
    const later = publish(folder, identity(candidate, lease, epoch + 10_000),
      epoch + 10_000);
    const renamedPath = later.path.slice(0, -5) + ".JSON";
    renameSync(later.path, renamedPath);
    assert.throws(() => selectSignedPreflight(folder, candidate, lease,
      epoch + 11_000, publicKey), /PREFLIGHT_UNEXPECTED_VERSIONED_FILE/);
    renameSync(renamedPath, later.path);
    assert.equal(selectSignedPreflight(folder, candidate, lease,
      epoch + 11_000, publicKey).path, later.path);
    assert.notEqual(earlier.path, later.path);
    const aliasParent = join(root, "elsewhere");
    mkdirSync(aliasParent);
    const alias = join(aliasParent, "issue300-r2-v2-prime-owned");
    try {
      symlinkSync(folder, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
        t.skip("Directory junction privilege unavailable");
        return;
      }
      throw error;
    }
    assert.throws(() => selectSignedPreflight(alias, candidate, lease,
      epoch + 11_000, publicKey), /PREFLIGHT_SYMLINK_OR_JUNCTION_DENIED/);
  }));
