param()
$ErrorActionPreference = 'Stop'
$auditRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$outputPath = Join-Path $PSScriptRoot 'logs/quality-checks.txt'
$checks = @(
  @{Name='API typecheck'; Args=@('--filter','@valet/api','typecheck')},
  @{Name='API lint'; Args=@('--filter','@valet/api','lint')},
  @{Name='Architecture'; Args=@('architecture:check')},
  @{Name='API build'; Args=@('--filter','@valet/api','build')}
)
[IO.File]::WriteAllText($outputPath, "Issue319 quality checks (source baseline 20998a069eb5d576895c0e6c149271a4a0e4028b)`r`n", [Text.UTF8Encoding]::new($false))
$overall = 0
Push-Location $auditRoot
try {
  foreach ($check in $checks) {
    $argsToPass = [string[]]$check.Args
    [IO.File]::AppendAllText($outputPath, "`r`nCOMMAND: pnpm $($argsToPass -join ' ')`r`n")
    $ErrorActionPreference = 'Continue'
    & pnpm @argsToPass 2>&1 | Out-String | ForEach-Object {
      [IO.File]::AppendAllText($outputPath, $_)
    }
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    [IO.File]::AppendAllText($outputPath, "`r`nEXIT_CODE=$exitCode`r`n")
    if ($exitCode -ne 0) { $overall = 1 }
  }
} finally { Pop-Location }
exit $overall
