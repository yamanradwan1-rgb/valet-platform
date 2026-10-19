// Fail-closed pre-read custody check for the task-only Owner private key.
// Signing identity verification does not establish private-key confidentiality.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, join, parse, resolve, sep } from "node:path";
import process from "node:process";

// Explicit file-write/delete/ACL/ownership and generic Windows rights.
// Keep the production PowerShell check and the offline mask test tied to
// the same constant, rather than duplicating security-critical bit masks.
export const unsafeAncestorAccessMask = 0x530d0156;

export function foreignAceUnsafe(mask, flags, strict = false) {
  const access = Number(mask) >>> 0;
  const inheritOnly = (Number(flags) & 8) !== 0;
  return strict || (!inheritOnly &&
    (access & unsafeAncestorAccessMask) !== 0);
}

export function assertOwnerKeyCustody(keyPath, folder) {
  assert.equal(dirname(keyPath), folder, "OWNER_KEY_OUTSIDE_CUSTODY");
  const directory = lstatSync(folder);
  const key = lstatSync(keyPath);
  assert(directory.isDirectory() && !directory.isSymbolicLink() &&
    key.isFile() && !key.isSymbolicLink() && key.nlink === 1,
  "OWNER_KEY_CUSTODY_FILE_UNSAFE");
  const normalizedFolder = resolve(folder);
  assert.equal(normalizedFolder, folder, "OWNER_KEY_CUSTODY_ALIAS");
  const drive = parse(folder).root;
  let ancestor = drive;
  const ancestors = [drive];
  for (const part of folder.slice(drive.length).split(sep).filter(Boolean)) {
    ancestor = join(ancestor, part);
    ancestors.push(ancestor);
  }
  for (const path of ancestors) {
    const state = lstatSync(path);
    assert(state.isDirectory() && !state.isSymbolicLink(),
      "OWNER_KEY_CUSTODY_ANCESTOR_REPARSE");
    if (process.platform === "win32" &&
        realpathSync.native(path).toLowerCase() !== path.toLowerCase()) {
      const target = statSync(path);
      // Genuine 8.3 aliases retain the same inode; junctions do not.
      assert(/~[0-9]+(?:\\|$)/i.test(path) &&
        state.dev === target.dev && state.ino === target.ino,
      "OWNER_KEY_CUSTODY_ALIAS_OR_REPARSE");
    }
  }
  if (process.platform !== "win32") {
    assert((directory.mode & 0o077) === 0 && (key.mode & 0o077) === 0,
      "OWNER_KEY_CUSTODY_UNSAFE_POSIX_MODE");
    for (const path of ancestors)
      assert((lstatSync(path).mode & 0o022) === 0,
        "OWNER_KEY_CUSTODY_WRITABLE_ANCESTOR");
    return true;
  }

  // Inspect the actual Windows DACLs, not POSIX mode bits (Windows ignores
  // chmod 0600 for ACL confidentiality). All allow ACE trustees must be
  // the caller, SYSTEM, or built-in Administrators. No inherited DACLs.
  // This intentionally rejects ordinary inherited Users/Authenticated Users
  // ACLs, even if the signing key is cryptographically correct.
  const sources = [...ancestors.map(path => ({ path, strict: path === folder })),
    { path: keyPath, strict: true }];
  const encodedPaths = Buffer.from(JSON.stringify(sources))
    .toString("base64");
  const script = `
$ErrorActionPreference = 'Stop'
$paths = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPaths}')) | ConvertFrom-Json
$caller = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($caller, 'S-1-5-18', 'S-1-5-32-544')
$trustedInstaller = 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
foreach ($entry in $paths) {
  $acl = Get-Acl -LiteralPath $entry.path
  $raw = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  if ($null -eq $raw.DiscretionaryAcl) { throw 'OWNER_DACL_NULL_OR_ABSENT' }
  $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  $volumeRoot = [IO.Path]::GetPathRoot($entry.path)
  $systemVolumeOwner = $entry.path -eq $volumeRoot -and $owner -eq $trustedInstaller
  if (-not (($allowed -contains $owner) -or $systemVolumeOwner) -or
      ($entry.strict -and -not $acl.AreAccessRulesProtected)) {
    throw 'OWNER_DACL_OWNER_OR_INHERITANCE_UNSAFE'
  }
  $unsafe = [long]${unsafeAncestorAccessMask}
  foreach ($ace in $raw.DiscretionaryAcl) {
    if ($ace -isnot [Security.AccessControl.QualifiedAce]) {
      throw 'OWNER_DACL_UNKNOWN_ACE_TYPE'
    }
    if ($ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessAllowed -and
        $ace.AceQualifier -ne [Security.AccessControl.AceQualifier]::AccessDenied) {
      throw 'OWNER_DACL_UNSUPPORTED_ACE_QUALIFIER'
    }
    # Inherit-only ACEs do not grant rights to THIS ancestor; every actual
    # descendant is checked separately, and the protected issuer folder/key
    # reject foreign ACEs regardless of inheritance flags.
    $inheritedOnly = (([int]$ace.AceFlags -band 8) -ne 0)
    if ($ace.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessAllowed -and
      -not ($allowed -contains $ace.SecurityIdentifier.Value) -and
      ($entry.strict -or -not $inheritedOnly) -and
      ($entry.strict -or (([long]$ace.AccessMask -band $unsafe) -ne 0))) {
      throw 'OWNER_DACL_FOREIGN_ALLOW_ACE'
    }
  }
}
'OWNER_DACL_VERIFIED'
`;
  const executable = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  let output;
  try {
    output = execFileSync(executable, ["-NoProfile", "-NonInteractive",
      "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    { encoding: "utf8", windowsHide: true, timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4096 });
  } catch (error) {
    const failure = String(error?.stderr ?? "");
    const reasons = ["OWNER_DACL_FOREIGN_ALLOW_ACE",
      "OWNER_DACL_OWNER_OR_INHERITANCE_UNSAFE", "OWNER_DACL_NULL_OR_ABSENT",
      "OWNER_DACL_UNKNOWN_ACE_TYPE", "OWNER_DACL_UNSUPPORTED_ACE_QUALIFIER"];
    const reason = reasons.find(item => failure.includes(item)) ?? "OWNER_DACL_PROBE_FAILED";
    throw Error(reason);
  }
  assert.equal(output.trim(), "OWNER_DACL_VERIFIED", "OWNER_DACL_NOT_VERIFIED");
  return true;
}
