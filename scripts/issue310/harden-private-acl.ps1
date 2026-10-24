$ErrorActionPreference = 'Stop'
$privateDirectory = Join-Path (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path 'tmp\wa310-runtime'
if (-not (Test-Path -LiteralPath $privateDirectory -PathType Container)) {
  throw 'Issue310 private directory is missing.'
}
$actual = (Resolve-Path -LiteralPath $privateDirectory).Path
if (-not $actual.EndsWith('\tmp\wa310-runtime', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to change ACL outside the exact Issue310 private directory.'
}
$principal = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$directoryGrants = @("${principal}:(OI)(CI)F", 'NT AUTHORITY\SYSTEM:(OI)(CI)F', 'BUILTIN\Administrators:(OI)(CI)F')
$fileGrants = @("${principal}:F", 'NT AUTHORITY\SYSTEM:F', 'BUILTIN\Administrators:F')

& icacls $actual /grant:r $directoryGrants | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant owner, SYSTEM, Administrators directory access.' }
& icacls $actual /inheritance:r | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to remove broad inherited directory access.' }
foreach ($file in (Get-ChildItem -LiteralPath $actual -File)) {
  & icacls $file.FullName /grant:r $fileGrants | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant explicit file permissions.' }
  & icacls $file.FullName /inheritance:r | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove inherited file access.' }
}
Write-Output 'Issue310 private credential ACL hardened (owner + SYSTEM + local Administrators); values withheld.'
