param()
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$log = Join-Path $PSScriptRoot 'logs/final-merge-quality.txt'
$checks = @(
  @{ Label = 'API typecheck'; Args = @('--filter', '@valet/api', 'typecheck') },
  @{ Label = 'API lint'; Args = @('--filter', '@valet/api', 'lint') },
  @{ Label = 'Architecture'; Args = @('architecture:check') },
  @{ Label = 'API build'; Args = @('--filter', '@valet/api', 'build') }
)
$overall = 0
[IO.File]::WriteAllText($log,
  "#319 final local checks (NO CI). Branch source before final evidence commit: 1f4aa54f5ad89e768e85b9bbed25d39385b79c31`r`n",
  [Text.UTF8Encoding]::new($false))
Push-Location $repository
try {
  foreach ($check in $checks) {
    $arguments = [string[]]$check.Args
    [IO.File]::AppendAllText($log, "`r`nCOMMAND: pnpm $($arguments -join ' ')`r`n")
    $ErrorActionPreference = 'Continue'
    $output = & pnpm @arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    [IO.File]::AppendAllText($log, $output + "`r`nEXIT_CODE=$exitCode`r`n")
    Write-Output "$($check.Label) EXIT_CODE=$exitCode"
    if ($exitCode -ne 0) { $overall = 1 }
  }
} finally { Pop-Location }
# Normalize only formatting whitespace in the newly captured quality log.
# Keep command output and exact native process exit codes unchanged.
$captured = [IO.File]::ReadAllText($log)
$captured = [regex]::Replace($captured, '[ \t]+(?=\r?\n|$)', '')
[IO.File]::WriteAllText($log, $captured, [Text.UTF8Encoding]::new($false))
exit $overall
