import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  r2ApiBundleDigest,
  r2AttestationIsFresh,
  r2BuildEvidenceMatches,
} from "../src/modules/management/audit-investigation/audit-investigation-u05-proof-attestation";

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Independent synthetic compiled API/contracts and separate certificate/manifest. */
function proofFixture() {
  const dir = mkdtempSync(join(tmpdir(), "issue300-r2-build-attestation-"));
  created.push(dir);
  const main = join(dir, "apps/api/dist/main.js");
  const contracts = join(dir, "packages/contracts/dist");
  const importedContract = join(contracts, "staff-auth.js");
  mkdirSync(dirname(main), { recursive: true });
  mkdirSync(contracts, { recursive: true });
  writeFileSync(main, "// independently compiled synthetic API");
  writeFileSync(join(contracts, "index.js"), "// synthetic contracts entrypoint");
  writeFileSync(importedContract, "// synthetic imported contracts v1");
  const provenance = {
    sourceSha256: "1".repeat(64),
    apiBuildReceiptSha256: "2".repeat(64),
    contractsBundleSha256: r2ApiBundleDigest(join(contracts, "index.js"), "index.js"),
  };
  const certPath = join(dir, "R2_SIGNED_HTTP_LOCAL_ATTESTATION.json");
  const manifestPath = join(dir, "R2_OWNED_RESOURCE_MANIFEST.json");
  writeFileSync(certPath, JSON.stringify(provenance));
  writeFileSync(manifestPath, JSON.stringify(provenance));
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  return { main, importedContract, certPath, manifestPath, read };
}

const fields = ["contractsBundleSha256", "sourceSha256", "apiBuildReceiptSha256"];

describe("Issue300 U005 build-provenance fail-closed gate", () => {
  it("accepts matching complete hex64 build evidence and compiled contracts", () => {
    const f = proofFixture();
    expect(r2BuildEvidenceMatches(f.main, f.read(f.certPath), f.read(f.manifestPath)))
      .toBe(true);
  });

  it.each(fields)("rejects legacy certificate missing %s even when manifest has it", (field) => {
    const f = proofFixture();
    const certificate = f.read(f.certPath);
    delete certificate[field];
    expect(r2BuildEvidenceMatches(f.main, certificate, f.read(f.manifestPath)))
      .toBe(false);
  });

  it.each(fields)("rejects manifest missing %s even when certificate has it", (field) => {
    const f = proofFixture();
    const manifest = f.read(f.manifestPath);
    delete manifest[field];
    expect(r2BuildEvidenceMatches(f.main, f.read(f.certPath), manifest))
      .toBe(false);
  });

  it.each(fields)("rejects missing %s in both legacy certificate and manifest", (field) => {
    const f = proofFixture();
    const certificate = f.read(f.certPath);
    const manifest = f.read(f.manifestPath);
    delete certificate[field];
    delete manifest[field];
    expect(r2BuildEvidenceMatches(f.main, certificate, manifest)).toBe(false);
  });

  it.each(fields)("rejects mismatched or malformed %s in either document", (field) => {
    const f = proofFixture();
    const certificate = f.read(f.certPath);
    const manifest = f.read(f.manifestPath);
    expect(r2BuildEvidenceMatches(f.main,
      { ...certificate, [field]: "a".repeat(64) }, manifest)).toBe(false);
    expect(r2BuildEvidenceMatches(f.main, certificate,
      { ...manifest, [field]: "a".repeat(64) })).toBe(false);
    expect(r2BuildEvidenceMatches(f.main,
      { ...certificate, [field]: "INVALID" }, manifest)).toBe(false);
  });

  it("rejects tampered imported contracts even when cert and manifest still match", () => {
    const f = proofFixture();
    const certificate = f.read(f.certPath);
    const manifest = f.read(f.manifestPath);
    expect(r2BuildEvidenceMatches(f.main, certificate, manifest)).toBe(true);
    writeFileSync(f.importedContract, "// synthetic imported contracts v2 tampered");
    expect(r2BuildEvidenceMatches(f.main, certificate, manifest)).toBe(false);
    const forged = { ...certificate, contractsBundleSha256: "f".repeat(64) };
    expect(r2BuildEvidenceMatches(f.main, forged, { ...forged })).toBe(false);
  });

  it("rejects expired, future-issued and overlong signed certificate windows", () => {
    const now = Date.parse("2026-10-19T00:00:00.000Z");
    const at = (offset: number) => new Date(now + offset).toISOString();
    expect(r2AttestationIsFresh(at(-1000), at(60_000), now)).toBe(true);
    expect(r2AttestationIsFresh(at(-1000), at(-1), now)).toBe(false);
    expect(r2AttestationIsFresh(at(1000), at(60_000), now)).toBe(false);
    expect(r2AttestationIsFresh(at(-1000), at(900_001), now)).toBe(false);
    expect(r2AttestationIsFresh("invalid", at(60_000), now)).toBe(false);
    expect(r2AttestationIsFresh(at(-1000), "invalid", now)).toBe(false);
  });
});
