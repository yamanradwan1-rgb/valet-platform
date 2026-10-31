param(
  [ValidateSet('issue333', 'audit', 'baseline')][string]$Suite = 'issue333',
  [ValidatePattern('^test/dashboard-issue(315|319|333)-[a-z0-9-]+\.integration\.test\.ts$')]
  [string]$TestFile = ''
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$runId = [Guid]::NewGuid().ToString('N')
# Historical #315/#319 fixture guards require this exact *shape*; the random
# child of our own worktree remains a distinct, disposable #333 cluster.
$parent = Join-Path $repo 'tmp/issue-315-pg-qa'
$lab = Join-Path $parent "issue319-$runId"
$data = Join-Path $lab '.issue315-private-cluster'
$evidence = Join-Path $repo 'tmp/issue-333-w6-evidence'
$log = Join-Path $evidence $runId
$owner = 'issue315_owner'
$started = $false
$verified = $false
$clean = $false
$exitCode = 1
if ($env:CI -eq 'true') { throw 'Issue333 private Windows lab cannot run in CI.' }
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm is required before starting a private PostgreSQL cluster.'
}
if (!(Test-Path -LiteralPath (Join-Path $repo 'apps/api/node_modules'))) {
  throw 'Local test dependencies are missing; use frozen offline installation first.'
}
if ($TestFile -and $TestFile -notmatch "^test/dashboard-issue$(switch ($Suite) { 'audit' {'319'} 'baseline' {'315'} default {'333'} })-") {
  throw 'TestFile does not belong to the selected private suite.'
}
foreach ($name in @('initdb.exe', 'pg_ctl.exe', 'psql.exe')) {
  if (!(Test-Path -LiteralPath (Join-Path $pgBin $name))) {
    throw "PostgreSQL 17 binary missing: $name"
  }
}
if (Test-Path -LiteralPath $lab) { throw 'Refusing to reuse an existing lab.' }
New-Item -ItemType Directory -Path $lab, $log -Force | Out-Null
$passFile = Join-Path $lab 'bootstrap-password'
$password = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText($passFile, $password)
$socket = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$socket.Start()
$port = $socket.LocalEndpoint.Port
$socket.Stop()

function Assert-ClusterIdentity {
  $record = & "$pgBin/psql.exe" -h 127.0.0.1 -p $port -U $owner -d postgres `
    -X -t -A -F '|' -v ON_ERROR_STOP=1 -c `
    "SELECT current_database(), current_user, inet_server_port(), current_setting('data_directory'), current_setting('server_version_num');"
  if ($LASTEXITCODE -ne 0) { throw 'Private PostgreSQL identity query failed.' }
  $parts = ([string]($record | Select-Object -Last 1)).Trim() -split '\|'
  if ($parts.Length -ne 5 -or $parts[0] -ne 'postgres' -or $parts[1] -ne $owner -or
      [int]$parts[2] -ne $port -or [int]$parts[4] -lt 170000 -or
      [int]$parts[4] -ge 180000 -or
      ![string]::Equals([IO.Path]::GetFullPath($parts[3]).TrimEnd('\'),
        [IO.Path]::GetFullPath($data).TrimEnd('\'),
        [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Private PostgreSQL identity does not match this run; refusing use.'
  }
  return ($parts -join '|')
}

try {
  & "$pgBin/initdb.exe" -D $data -U $owner --auth=scram-sha-256 `
    --pwfile=$passFile --encoding=UTF8 --locale=C *> (Join-Path $log 'init.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Private initdb failed.' }
  $options = "-h 127.0.0.1 -p $port -c max_connections=50"
  & "$pgBin/pg_ctl.exe" -D $data -l (Join-Path $log 'server.txt') `
    -o $options -w start
  if ($LASTEXITCODE -ne 0) { throw 'Private pg_ctl start failed.' }
  $started = $true
  $env:PGPASSWORD = $password
  $identity = Assert-ClusterIdentity
  $verified = $true
  [IO.File]::WriteAllText((Join-Path $log 'identity.txt'), $identity + "`r`n")
  foreach ($name in @('DATABASE_URL','PGHOST','PGPORT','PGUSER','PGDATABASE',
      'PGOPTIONS','PGSERVICE','PGSSLMODE','PGSERVICEFILE')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $env:TEST_DATABASE_URL = "postgresql://${owner}:${password}@127.0.0.1:${port}/postgres"
  $env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
  $env:NODE_ENV = 'test'
  $env:ISSUE315_EPHEMERAL_PG = 'I_OWN_THIS_CLUSTER'
  $env:ISSUE315_PG_PRIVATE_DATADIR = $data
  $env:ISSUE319_EPHEMERAL_PG = 'I_OWN_THIS_CLUSTER'
  $env:ISSUE333_EPHEMERAL_PG = 'I_OWN_THIS_CLUSTER'
  $env:ISSUE333_PG_PRIVATE_DATADIR = $data
  $config = switch ($Suite) {
    'audit' { '../../docs/validation/issue-319/vitest.config.mjs' }
    'baseline' { '../../docs/validation/issue-315/pg-qa/vitest.config.mjs' }
    default { '../../docs/validation/issue-333/w6/vitest.config.mjs' }
  }
  Push-Location (Join-Path $repo 'apps/api')
  try {
    $ErrorActionPreference = 'Continue'
    $argsForVitest = @('exec','vitest','run','--config',$config,'--reporter=verbose')
    if ($TestFile) { $argsForVitest += $TestFile }
    & pnpm @argsForVitest *> (Join-Path $log 'tests.txt')
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
} catch {
  [IO.File]::WriteAllText((Join-Path $log 'failure.txt'), $_.Exception.Message + "`r`n")
  $exitCode = 1
  Write-Warning "Owned PostgreSQL test failed; inspect $log"
} finally {
  if ($started -and $verified) {
    try {
      Assert-ClusterIdentity | Out-Null
      $inventory = & "$pgBin/psql.exe" -h 127.0.0.1 -p $port -U $owner -d postgres `
        -X -t -A -v ON_ERROR_STOP=1 -c `
        "SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1'); SELECT count(*) FROM pg_stat_activity WHERE datname <> 'postgres';"
      if ($LASTEXITCODE -ne 0) { throw 'Cleanup inventory query failed.' }
      [IO.File]::WriteAllText((Join-Path $log 'cleanup.txt'), ($inventory -join "`r`n") + "`r`n")
      $clean = $inventory.Count -eq 2 -and [int]$inventory[0] -eq 0 -and [int]$inventory[1] -eq 0
      if (!$clean) { $exitCode = 1; Write-Warning 'Child resources remain; preserving private cluster directory.' }
    } catch { $exitCode = 1; Write-Warning $_.Exception.Message }
  }
  if ($started) {
    & "$pgBin/pg_ctl.exe" -D $data -m immediate -w stop
    if ($LASTEXITCODE -ne 0) { $exitCode = 1; $clean = $false }
  }
  foreach ($name in @('PGPASSWORD','TEST_DATABASE_URL','MIGRATION_DATABASE_URL',
      'ISSUE315_EPHEMERAL_PG','ISSUE315_PG_PRIVATE_DATADIR','ISSUE319_EPHEMERAL_PG',
      'ISSUE333_EPHEMERAL_PG','ISSUE333_PG_PRIVATE_DATADIR')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $path = [IO.Path]::GetFullPath($lab)
  $safeParent = [IO.Path]::GetFullPath($parent).TrimEnd('\') + '\'
  if ($clean -and $path.StartsWith($safeParent,[StringComparison]::OrdinalIgnoreCase) -and
      $path.EndsWith("issue319-$runId",[StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
  Write-Output "ISSUE333_LAB run=$runId exit=$exitCode removed=$(!(Test-Path -LiteralPath $lab)) evidence=$log"
}
exit $exitCode
