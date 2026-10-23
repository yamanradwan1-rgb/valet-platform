param([ValidateSet('baseline', 'audit')][string]$Suite = 'baseline')
$ErrorActionPreference = 'Stop'
$auditRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$runId = [Guid]::NewGuid().ToString('N')
$labRoot = Join-Path $auditRoot "tmp/issue-315-pg-qa/issue319-$runId"
$dataPath = Join-Path $labRoot '.issue315-private-cluster'
$logRoot = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Path $labRoot,$logRoot -Force | Out-Null
$passwordFile = Join-Path $labRoot 'bootstrap-password'
$password = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText($passwordFile, $password)
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$started = $false
$testExit = 1
try {
  & "$pgBin/initdb.exe" -D $dataPath -U issue315_owner --auth=scram-sha-256 --pwfile=$passwordFile --encoding=UTF8 --locale=C *> (Join-Path $labRoot 'init.log')
  if ($LASTEXITCODE -ne 0) { throw 'Private initdb failed.' }
  $serverOptions = "-h 127.0.0.1 -p $port -c max_connections=50"
  & "$pgBin/pg_ctl.exe" -D $dataPath -l (Join-Path $labRoot 'server.log') -o $serverOptions -w start
  if ($LASTEXITCODE -ne 0) { throw 'Private PostgreSQL start failed.' }
  $started = $true
  $env:PGPASSWORD = $password
  & "$pgBin/psql.exe" -h 127.0.0.1 -p $port -U issue315_owner -d postgres -X -A -c "SELECT current_database(),current_user,inet_server_port(),current_setting('data_directory'),version(); SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user;" | Tee-Object (Join-Path $logRoot "$Suite-identity.txt")
  if ($LASTEXITCODE -ne 0) { throw 'Private cluster identity query failed.' }
  $env:TEST_DATABASE_URL = "postgresql://issue315_owner:$password@127.0.0.1:$port/postgres"
  $env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
  $env:ISSUE315_EPHEMERAL_PG = 'I_OWN_THIS_CLUSTER'
  $env:ISSUE315_PG_PRIVATE_DATADIR = $dataPath
  $env:ISSUE319_EPHEMERAL_PG = 'I_OWN_THIS_CLUSTER'
  $env:NODE_ENV = 'test'
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Push-Location (Join-Path $auditRoot 'apps/api')
  try {
    # Windows PowerShell 5 wraps native stderr warnings as ErrorRecords.
    # The native exit code, not warning-stream formatting, owns test status.
    $ErrorActionPreference = 'Continue'
    if ($Suite -eq 'baseline') {
      & pnpm exec vitest run --config ../../docs/validation/issue-315/pg-qa/vitest.config.mjs --reporter=verbose 2>&1 | Tee-Object (Join-Path $logRoot 'baseline-tests.txt')
    } else {
      & pnpm exec vitest run --config ../../docs/validation/issue-319/vitest.config.mjs --reporter=verbose 2>&1 | Tee-Object (Join-Path $logRoot 'audit-tests.txt')
    }
    $testExit = $LASTEXITCODE
  } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
} finally {
  if ($started) {
    & "$pgBin/psql.exe" -h 127.0.0.1 -p $port -U issue315_owner -d postgres -X -A -c "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1'); SELECT rolname FROM pg_roles WHERE rolname LIKE 'valet_%'; SELECT count(*) AS child_connections FROM pg_stat_activity WHERE datname <> 'postgres';" | Tee-Object (Join-Path $logRoot "$Suite-cleanup.txt")
    & "$pgBin/pg_ctl.exe" -D $dataPath -m immediate -w stop
    if ($LASTEXITCODE -ne 0) { throw 'Owned cluster stop failed; preserve directory for recovery.' }
  }
  foreach ($name in @('PGPASSWORD','TEST_DATABASE_URL','MIGRATION_DATABASE_URL','ISSUE315_EPHEMERAL_PG','ISSUE315_PG_PRIVATE_DATADIR','ISSUE319_EPHEMERAL_PG')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $resolvedLab = [IO.Path]::GetFullPath($labRoot)
  $expectedParent = [IO.Path]::GetFullPath((Join-Path $auditRoot 'tmp/issue-315-pg-qa')) + [IO.Path]::DirectorySeparatorChar
  if (!$resolvedLab.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase) -or !$resolvedLab.EndsWith("issue319-$runId")) { throw 'Unsafe cleanup target.' }
  Remove-Item -LiteralPath $resolvedLab -Recurse -Force
  "OWNED_CLUSTER_DIRECTORY_REMOVED=$(!(Test-Path -LiteralPath $resolvedLab))" | Tee-Object -Append (Join-Path $logRoot "$Suite-cleanup.txt")
  # Windows PowerShell 5.1 Tee-Object emits UTF-16LE by default; preserve
  # reviewable Git text artifacts without changing the captured assertions.
  foreach ($name in @('identity', 'tests', 'cleanup')) {
    $captured = Join-Path $logRoot "$Suite-$name.txt"
    if (Test-Path -LiteralPath $captured) {
      $contents = [IO.File]::ReadAllText($captured)
      $contents = [regex]::Replace($contents, '[ \t]+(?=\r?\n|$)', '')
      $contents = $contents.TrimEnd() + "`r`n"
      [IO.File]::WriteAllText($captured, $contents, [Text.UTF8Encoding]::new($false))
    }
  }
}
exit $testExit
