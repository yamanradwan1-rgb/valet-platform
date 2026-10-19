// Task-owned synthetic ACL probe; NEVER reads the genuine Owner private key.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { assertOwnerKeyCustody, foreignAceUnsafe,
  unsafeAncestorAccessMask } from "./issue300-r2-owner-key-custody.mjs";

test("synthetic ACE masks deny generic/owner-write but not plain reading", () => {
  assert.equal(unsafeAncestorAccessMask, 0x530d0156);
  for (const mask of [0x40000000, 0x10000000, 0x02000000,
    0x01000000, 0x00000040, 0x00010000, 0x00040000,
    0x00080000, 0x00000002, 0x00000004]) {
    assert.equal(foreignAceUnsafe(mask, 0), true);
    assert.equal(foreignAceUnsafe(mask, 8), false,
      "Inherit-only is never effective on the current ancestor");
    assert.equal(foreignAceUnsafe(mask, 8, true), true,
      "Owner folder/key must deny even inherit-only foreign ACEs");
  }
  assert.equal(foreignAceUnsafe(0x001200a9, 0), false);
  assert.equal(foreignAceUnsafe(0x001200a9, 0, true), true);
});

test("real Windows ACL fails closed on untrusted synthetic folder", t => {
  if (process.platform !== "win32") return t.skip("Windows ACL-only probe");
  const folder = mkdtempSync(join(tmpdir(), "issue300-synthetic-acl-"));
  const key = join(folder, "fake-not-an-owner-key.txt");
  try {
    writeFileSync(key, "non-secret dummy fixture");
    const icacls = "C:\\Windows\\System32\\icacls.exe";
    // This machine's C:/Users/.../Temp ancestors are NOT Owner-only.
    // A real positive full-path test requires a separately secured volume;
    // this negative test deliberately does NOT claim Owner positive custody.
    execFileSync(icacls, [folder, "/inheritance:r"],
      { windowsHide: true, timeout: 5000, maxBuffer: 4096 });
    execFileSync(icacls, [folder, "/grant", "*S-1-1-0:(OI)(CI)(F)"],
      { windowsHide: true, timeout: 5000, maxBuffer: 4096 });
    let rejection = null;
    try { assertOwnerKeyCustody(key, folder); }
    catch (error) { rejection = error; }
    assert(rejection, "Untrusted inherited/full-control ACE must fail closed");
    const diagnostics = String(rejection.stderr ?? rejection.message);
    assert.match(diagnostics,
      /OWNER_DACL_(?:FOREIGN_ALLOW_ACE|OWNER_OR_INHERITANCE_UNSAFE)/,
      "Unexpected PowerShell error is NOT security evidence");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
