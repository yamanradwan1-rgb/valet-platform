// Fail-closed pre-read custody check for the task-only Owner private key.
// Signing identity verification does not establish private-key confidentiality.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

export function assertOwnerKeyCustody(keyPath, folder) {
  assert.equal(dirname(keyPath), folder, "OWNER_KEY_OUTSIDE_CUSTODY");
  const directory = lstatSync(folder);
  const key = lstatSync(keyPath);
  assert(directory.isDirectory() && !directory.isSymbolicLink() &&
    key.isFile() && !key.isSymbolicLink() && key.nlink === 1,
  "OWNER_KEY_CUSTODY_FILE_UNSAFE");
  if (process.platform !== "win32") {
    assert((directory.mode & 0o077) === 0 && (key.mode & 0o077) === 0,
      "OWNER_KEY_CUSTODY_UNSAFE_POSIX_MODE");
    return true;
  }

  // Inspect the actual Windows DACLs, not POSIX mode bits (Windows ignores
  // chmod 0600 for ACL confidentiality). All allow ACE trustees must be
  // the caller, SYSTEM, or built-in Administrators. No inherited DACLs.
  // This intentionally rejects ordinary inherited Users/Authenticated Users
  // ACLs, even if the signing key is cryptographically correct.
  const encodedPaths = Buffer.from(JSON.stringify([folder, keyPath]))
    .toString("base64");
  const script = `
$ErrorActionPreference = 'Stop'
$paths = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPaths}')) | ConvertFrom-Json
$caller = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($caller, 'S-1-5-18', 'S-1-5-32-544')
foreach ($path in $paths) {
  $acl = Get-Acl -LiteralPath $path
  $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if (-not ($allowed -contains $owner) -or -not $acl.AreAccessRulesProtected) { throw 'OWNER_DACL_OWNER_OR_INHERITANCE_UNSAFE' }
  $aces = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
  foreach ($ace in $aces) {
    if ($ace.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
      -not ($allowed -contains $ace.IdentityReference.Value)) {
      throw 'OWNER_DACL_FOREIGN_ALLOW_ACE'
    }
  }
}
'OWNER_DACL_VERIFIED'
`;
  const executable = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const output = execFileSync(executable, ["-NoProfile", "-NonInteractive",
    "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
  { encoding: "utf8", windowsHide: true, timeout: 10000,
    maxBuffer: 4096 });
  assert.equal(output.trim(), "OWNER_DACL_VERIFIED", "OWNER_DACL_NOT_VERIFIED");
  return true;
}
