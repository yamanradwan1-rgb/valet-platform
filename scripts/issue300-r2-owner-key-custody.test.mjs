// Task-owned synthetic ACL probe; NEVER reads the genuine Owner private key.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { assertOwnerKeyCustody } from "./issue300-r2-owner-key-custody.mjs";

test("real Windows ACL fails closed on an untrusted synthetic ACL", t => {
  if (process.platform !== "win32") return t.skip("Windows ACL-only probe");
  const folder = mkdtempSync(join(tmpdir(), "issue300-synthetic-acl-"));
  const key = join(folder, "fake-not-an-owner-key.txt");
  try {
    writeFileSync(key, "non-secret dummy fixture");
    const icacls = "C:\\Windows\\System32\\icacls.exe";
    // Force a protected folder DACL so the next check actually exercises
    // untrusted raw ACE access masks, not only inherited-DACL denial.
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
