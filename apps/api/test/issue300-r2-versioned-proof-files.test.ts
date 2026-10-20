import { linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  r2ReadSignedCertificateFile, r2ReadVersionedManifest,
  r2VersionedManifestName,
} from "../src/modules/management/audit-investigation/audit-investigation-u05-proof-files";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const lease = "issue300-r2-local-lease-0001";
const otherLease = "issue300-r2-local-lease-0002";
const directories: string[] = [];

function caseFiles() {
  const folder = mkdtempSync(join(tmpdir(), "r2-versioned-proof-"));
  directories.push(folder);
  const entrypoint = join(folder, "apps/api/dist/main.js");
  const owned = join(folder, "tmp/issue300-r2-w7-acceptance-v2-owned");
  mkdirSync(dirname(entrypoint), { recursive: true });
  mkdirSync(owned, { recursive: true });
  writeFileSync(entrypoint, "// synthetic only");
  const name = r2VersionedManifestName(sha, lease)!;
  const path = join(owned, name);
  const bytes = Buffer.from('{"candidateSha":"synthetic"}');
  writeFileSync(path, bytes);
  return { folder, owned, entrypoint, name, path, bytes };
}

afterEach(() => {
  for (const folder of directories.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

it("derives only closed v1 per-SHA/lease names", () => {
  const { entrypoint, name, bytes } = caseFiles();
  expect(r2VersionedManifestName(sha, lease)).toBe(name);
  const proof = { artifactVersion: 1, candidateSha: sha, leaseId: lease,
    resourceManifestFilename: name };
  expect(r2ReadVersionedManifest(entrypoint, proof)).toEqual(bytes);
  expect(r2VersionedManifestName("../", lease)).toBeNull();
  expect(r2VersionedManifestName(sha, "../escape")).toBeNull();
  expect(r2ReadVersionedManifest(entrypoint,
    { candidateSha: sha, leaseId: lease,
      resourceManifestFilename: name })).toBeNull();
  expect(r2ReadVersionedManifest(entrypoint,
    { ...proof, resourceManifestFilename: "R2_OWNED_RESOURCE_MANIFEST.json" }))
    .toBeNull();
  expect(r2ReadVersionedManifest(entrypoint,
    { ...proof, resourceManifestFilename: "../" + name })).toBeNull();
  expect(r2ReadVersionedManifest(entrypoint,
    { ...proof, candidateSha: otherSha })).toBeNull();
  expect(r2ReadVersionedManifest(entrypoint,
    { ...proof, leaseId: otherLease })).toBeNull();
});

it("new lease and SHA reject the stale old resource even if fixed alias exists", () => {
  const { entrypoint, owned, bytes } = caseFiles();
  writeFileSync(join(owned, "R2_OWNED_RESOURCE_MANIFEST.json"), bytes);
  const oldName = r2VersionedManifestName(sha, lease)!;
  expect(r2ReadVersionedManifest(entrypoint, {
    artifactVersion: 1, candidateSha: sha, leaseId: otherLease,
    resourceManifestFilename: oldName,
  })).toBeNull();
});

it("rejects forged leaf symlinks and hard links; exposes changed bytes for digest checks", () => {
  const { entrypoint, owned, path } = caseFiles();
  const alias = join(owned, r2VersionedManifestName(otherSha, lease)!);
  symlinkSync(path, alias, "file");
  expect(r2ReadVersionedManifest(entrypoint, {
    artifactVersion: 1, candidateSha: otherSha, leaseId: lease,
    resourceManifestFilename: r2VersionedManifestName(otherSha, lease)!,
  })).toBeNull();
  const hardAlias = join(owned, "hardlink-alias.bin");
  linkSync(path, hardAlias);
  expect(r2ReadVersionedManifest(entrypoint, {
    artifactVersion: 1, candidateSha: sha, leaseId: lease,
    resourceManifestFilename: r2VersionedManifestName(sha, lease)!,
  })).toBeNull();
  unlinkSync(hardAlias);
  const previous = readFileSync(path);
  const changed = Buffer.concat([previous, Buffer.from("changed")]);
  writeFileSync(path, changed);
  expect(r2ReadVersionedManifest(entrypoint, {
    artifactVersion: 1, candidateSha: sha, leaseId: lease,
    resourceManifestFilename: r2VersionedManifestName(sha, lease)!,
  })).toEqual(changed);
});

it("accepts only exact owned signed-certificate filenames and sidecars", () => {
  const { entrypoint, owned } = caseFiles();
  const cert = join(owned,
    `R2_SIGNED_HTTP_LOCAL_ATTESTATION_${sha.slice(0, 12)}_1792368000000_${lease}.json`);
  writeFileSync(cert, '{"project":"synthetic"}');
  writeFileSync(cert + ".sig", "a".repeat(88));
  expect(r2ReadSignedCertificateFile(entrypoint, cert, sha, lease))
    .toBeTruthy();
  expect(r2ReadSignedCertificateFile(entrypoint, cert + ".sig",
    sha, lease, true)).toBeTruthy();
  expect(r2ReadSignedCertificateFile(entrypoint, cert, sha, otherLease))
    .toBeNull();
  expect(r2ReadSignedCertificateFile(entrypoint, cert + ".sig",
    sha, lease, false)).toBeNull();
  expect(r2ReadSignedCertificateFile(entrypoint, join(dirname(owned),
    "other.json"), sha, lease)).toBeNull();
});
