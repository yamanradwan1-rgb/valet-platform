import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { createOwnedFileReader } from "./issue300-w13-owned-files.mjs";

function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), "issue300-w13-signed-files-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const owned = join(workspace, "owned");
  mkdirSync(owned);
  const cert = join(owned, "R2_SIGNED_HTTP_LOCAL_ATTESTATION.json");
  const other = join(owned, "fixture-signature.json");
  const credentials = join(owned, "credentials.json");
  const pair = generateKeyPairSync("ed25519"); // Ephemeral test-only identity.
  const bytes = Buffer.from(
    '{"mode":"ISOLATED_PROOF_CANDIDATE","leaseId":"test"}',
  );
  writeFileSync(cert, bytes);
  writeFileSync(
    `${cert}.sig`,
    sign(null, bytes, pair.privateKey).toString("base64"),
  );
  writeFileSync(other, '{"purpose":"INDEPENDENT_SOURCE_ORACLE"}');
  writeFileSync(credentials, '{"ca":{"email":"test@invalid.example"}}');
  return {
    workspace,
    owned,
    cert,
    other,
    credentials,
    bytes,
    pair,
    reader: createOwnedFileReader(owned, pair.publicKey),
  };
}

test("authenticates raw certificate bytes against detached Ed25519 Base64", (t) => {
  const { reader, cert, other, credentials, bytes } = fixture(t);
  const result = reader.readCertificate(cert);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.json.leaseId, "test");
  assert.equal(
    reader.readJson(other).json.purpose,
    "INDEPENDENT_SOURCE_ORACLE",
  );
  assert.equal(
    reader.readJson(credentials).json.ca.email,
    "test@invalid.example",
  );
});

test("raw JSON tampering fails even when still syntactically valid", (t) => {
  const { reader, cert } = fixture(t);
  writeFileSync(cert, '{"mode":"ISOLATED_PROOF_CANDIDATE","leaseId":"evil"}');
  assert.throws(
    () => reader.readCertificate(cert),
    /signature verification failed/i,
  );
});

test("unsigned certificate or missing .sig cannot reach trusted JSON", (t) => {
  const { reader, cert } = fixture(t);
  rmSync(`${cert}.sig`);
  assert.throws(() => reader.readCertificate(cert));
});

test("malformed certificate signature and wrong valid signature are denied", (t) => {
  const { reader, cert, bytes } = fixture(t);
  writeFileSync(`${cert}.sig`, '{"signatureBase64":"untrusted-json"}');
  assert.throws(() => reader.readCertificate(cert), /raw Owner Ed25519/i);
  const second = generateKeyPairSync("ed25519");
  writeFileSync(
    `${cert}.sig`,
    sign(null, bytes, second.privateKey).toString("base64"),
  );
  assert.throws(() => reader.readCertificate(cert), /verification failed/i);
});

test("wrong public key cannot validate the unchanged Owner-format certificate", (t) => {
  const { owned, cert } = fixture(t);
  const other = generateKeyPairSync("ed25519");
  const reader = createOwnedFileReader(owned, other.publicKey);
  assert.throws(() => reader.readCertificate(cert), /verification failed/i);
});

test("traversal, relative path, sibling file and NTFS ADS are rejected", (t) => {
  const { reader, workspace, owned, cert } = fixture(t);
  assert.throws(
    () => reader.readCertificate(`.${sep}${basename(cert)}`),
    /absolute/i,
  );
  assert.throws(
    () =>
      reader.readCertificate(
        `${owned}${sep}..${sep}${basename(owned)}${sep}${basename(cert)}`,
      ),
    /traversal/i,
  );
  const sibling = join(workspace, "outsider.json");
  writeFileSync(sibling, "{}");
  assert.throws(() => reader.readJson(sibling), /direct child/i);
  assert.throws(
    () => reader.readJson(`${cert}:data`),
    /alternate data stream/i,
  );
});

test("hard links are rejected for signed/credential input", (t) => {
  const { reader, owned, credentials } = fixture(t);
  const linked = join(owned, "credential-hardlink.json");
  linkSync(credentials, linked);
  assert.throws(() => reader.readJson(linked), /Hard-linked/i);
});

test("symlinked certificate, fixture and credential files fail closed", (t) => {
  const { reader, owned, cert, other, credentials } = fixture(t);
  const links = [
    ["certificate-link.json", cert, "certificate"],
    ["fixture-signature-link.json", other, "fixture signature"],
    ["credentials-link.json", credentials, "credentials"],
  ];
  for (const [name, target, kind] of links) {
    const linked = join(owned, name);
    try {
      symlinkSync(target, linked, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        t.diagnostic(
          `OS disallows unprivileged file symlink creation: ${kind}`,
        );
        continue;
      }
      throw error;
    }
    assert.throws(
      () =>
        kind === "certificate"
          ? reader.readCertificate(linked)
          : reader.readJson(linked),
      /symlink\/reparse/i,
    );
  }
});

test("raw certificate .sig symlink is refused before verifying Owner bytes", (t) => {
  const { reader, owned, cert } = fixture(t);
  const external = join(dirname(owned), "external-raw-signature.txt");
  const sidecar = `${cert}.sig`;
  const bytes = Buffer.from(readFileSync(sidecar));
  writeFileSync(external, bytes);
  rmSync(sidecar);
  try {
    symlinkSync(external, sidecar, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code))
      return t.skip("File symlinks unsupported");
    throw error;
  }
  assert.throws(() => reader.readCertificate(cert), /symlink\/reparse/i);
});

test("redirected parent directory and Windows junction/reparse are rejected", (t) => {
  const { workspace, owned, pair, cert } = fixture(t);
  for (const type of process.platform === "win32"
    ? ["junction", "dir"]
    : ["dir"]) {
    const redirected = join(workspace, `redirect-${type}`);
    try {
      symlinkSync(owned, redirected, type);
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        t.diagnostic(`OS disallows unprivileged ${type} creation`);
        continue;
      }
      throw error;
    }
    assert.throws(
      () => createOwnedFileReader(redirected, pair.publicKey),
      /symlink\/reparse|redirected reparse/i,
    );
    const redirectedCert = join(redirected, basename(cert));
    assert.throws(() =>
      createOwnedFileReader(redirected, pair.publicKey).readCertificate(
        redirectedCert,
      ),
    );
  }
});

test("symlinked ancestor outside owned folder cannot be trusted", (t) => {
  const { workspace, owned, pair } = fixture(t);
  const top = join(dirname(workspace), `${basename(workspace)}-link`);
  try {
    symlinkSync(
      workspace,
      top,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code))
      return t.skip("Symlinks unsupported");
    throw error;
  }
  t.after(() => unlinkSync(top));
  const alias = join(top, basename(owned));
  assert.throws(
    () => createOwnedFileReader(alias, pair.publicKey),
    /symlink\/reparse|redirected reparse/i,
  );
});
