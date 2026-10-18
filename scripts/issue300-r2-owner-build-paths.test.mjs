import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { loadExact, ownedLocation } from "./issue300-r2-owner-build-paths.mjs";
import { requireOwnerSigner } from "./issue300-r2-owner-build-issuer.mjs";

test("disposable non-Owner private key cannot sign the build receipt", () => {
  const temporary = generateKeyPairSync("ed25519");
  const pem = temporary.privateKey.export({ type: "pkcs8", format: "pem" });
  assert.throws(() => requireOwnerSigner(pem), /SIGNER_IDENTITY_INVALID/);
});

test("Owner directory restricts ignored task-owned location and junctions", (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "issue300-owner-path-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const owned = join(temporary, "tmp", "issue300-r2-v2-prime-owned");
  mkdirSync(owned, { recursive: true });
  assert.equal(
    ownedLocation(temporary, "tmp/issue300-r2-v2-prime-owned"),
    realpathSync.native(owned),
  );
  assert.throws(() => ownedLocation(temporary, "tmp/foreign-owner"));
  const bad = join(temporary, "tmp", "issue300-r2-w17-build-owned");
  try {
    symlinkSync(owned, bad, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code))
      return t.skip("Reparse unsupported");
    throw error;
  }
  assert.throws(
    () => ownedLocation(temporary, "tmp/issue300-r2-w17-build-owned"),
    /REPARSE_DENIED/,
  );
});

test("Owner evidence rejects symlink, hardlink and outside paths", (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "issue300-owner-file-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const parent = join(temporary, "tmp", "issue300-r2-v2-prime-owned");
  mkdirSync(parent, { recursive: true });
  const folder = realpathSync.native(parent);
  const receipt = join(folder, "build-lease.json");
  writeFileSync(receipt, '{"state":"signed"}');
  assert.equal(
    loadExact(receipt, folder, 128).toString("utf8"),
    '{"state":"signed"}',
  );
  assert.throws(
    () => loadExact(join(dirname(folder), "outside.json"), folder, 128),
    /PATH_OUTSIDE_SCOPE/,
  );
  const hardlink = join(folder, "second-lease.json");
  linkSync(receipt, hardlink);
  assert.throws(() => loadExact(receipt, folder, 128), /FILE_UNSAFE/);
  const linked = join(folder, "linked-lease.json");
  try {
    symlinkSync(receipt, linked, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code))
      return t.skip("Symlink unsupported");
    throw error;
  }
  assert.throws(() => loadExact(linked, folder, 128), /FILE_UNSAFE/);
});
