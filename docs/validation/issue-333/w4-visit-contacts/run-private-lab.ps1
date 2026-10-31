$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$runId = [Guid]::NewGuid().ToString('N')
$parent = Join-Path $repo 'tmp/issue-333-w4-private'
$lab = Join-Path $parent "issue333w4-$runId"
$data = Join-Path $lab '.issue333-w4-private-cluster'
$logs = Join-Path $repo "tmp/issue-333-w4-private/evidence/issue333w4-$runId"
"ISSUE333_W4_RUN_ID=$runId"
if ($env:CI -eq 'true') { throw 'W4 private PostgreSQL test cannot run in CI.' }
if (!(Test-Path (Join-Path $repo 'apps/api/node_modules'))) { throw 'W4 test dependencies missing.' }
foreach ($binary in @('initdb.exe','pg_ctl.exe','psql.exe')) {
  if (!(Test-Path (Join-Path $pgBin $binary))) { throw "PostgreSQL 17 missing $binary" }
}
New-Item -ItemType Directory -Path $lab,$logs -Force | Out-Null
$passwordFile = Join-Path $lab 'bootstrap-password'
$password = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
[IO.File]::WriteAllText($passwordFile, $password)
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$started = $false
$testExit = 1
$childrenClean = $false
try {
  & "$pgBin/initdb.exe" -D $data -U issue333_w4_owner --auth=scram-sha-256 --pwfile=$passwordFile --encoding=UTF8 --locale=C *> (Join-Path $lab 'init.log')
  if ($LASTEXITCODE -ne 0) { throw 'Private W4 initdb failed.' }
  & "$pgBin/pg_ctl.exe" -D $data -l (Join-Path $lab 'server.log') -o "-h 127.0.0.1 -p $port -c max_connections=50" -w start
  if ($LASTEXITCODE -ne 0) { throw 'Private W4 PostgreSQL startup failed.' }
  $started = $true
  $env:PGPASSWORD = $password
  & "$pgBin/psql.exe" -h 127.0.0.1 -p $port -U issue333_w4_owner -d postgres -X -A -c "SELECT current_database(),current_user,inet_server_port(),current_setting('data_directory'),version(); SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user;" | Tee-Object (Join-Path $logs 'identity.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Private W4 PostgreSQL identity query failed.' }
  $env:TEST_DATABASE_URL = "postgresql://issue333_w4_owner:$password@127.0.0.1:$port/postgres"
  $env:MIGRATION_DATABASE_URL = $env:TEST_DATABASE_URL
  $env:ISSUE333_W4_PRIVATE_PG = 'I_OWN_W4_CLUSTER'
  $env:ISSUE333_W4_PRIVATE_DATADIR = $data
  $env:NODE_ENV = 'test'
  foreach ($name in @('DATABASE_URL','PGHOST','PGPORT','PGUSER','PGDATABASE',
      'PGOPTIONS','PGSERVICE','PGSSLMODE','PGSERVICEFILE')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $sourceFiles = @(
    'apps/api/test/issue333-w4-visit-contacts.integration.test.ts',
    'apps/api/test/issue333-w4-visit-contact-race.ts',
    'apps/api/test/issue333-w4-private-lab.ts',
    'docs/validation/issue-333/w4-visit-contacts/vitest.config.mjs',
    'docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1'
  )
  $sourceHashes = foreach ($sourceFile in $sourceFiles) {
    $digest = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repo $sourceFile)).Hash.ToLowerInvariant()
    "$sourceFile sha256=$digest"
  }
  $sourceHashes | Tee-Object (Join-Path $logs 'source-sha256.txt')
  Push-Location (Join-Path $repo 'apps/api')
  try {
    $ErrorActionPreference = 'Continue'
    & pnpm exec vitest run --config ../../docs/validation/issue-333/w4-visit-contacts/vitest.config.mjs --reporter=verbose 2>&1 | Tee-Object (Join-Path $logs 'tests.txt')
    $testExit = $LASTEXITCODE
  } finally { $ErrorActionPreference = 'Stop'; Pop-Location }
} finally {
  if ($started) {
    $inventory = & "$pgBin/psql.exe" -h 127.0.0.1 -p $port -U issue333_w4_owner -d postgres -X -t -A -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1'); SELECT count(*) FROM pg_stat_activity WHERE datname <> 'postgres';"
    if ($LASTEXITCODE -ne 0) { throw 'Private W4 cleanup inventory failed.' }
    $childrenClean = $inventory.Count -eq 2 -and [int]$inventory[0] -eq 0 -and [int]$inventory[1] -eq 0
    $inventory | Tee-Object (Join-Path $logs 'cleanup.txt')
    if (!$childrenClean) { $testExit = 1; Write-Warning 'Private W4 child resources remain.' }
    & "$pgBin/pg_ctl.exe" -D $data -m immediate -w stop
    if ($LASTEXITCODE -ne 0) { throw 'Private W4 cluster stop failed; preserve directory.' }
  }
  foreach ($name in @('PGPASSWORD','TEST_DATABASE_URL','MIGRATION_DATABASE_URL','ISSUE333_W4_PRIVATE_PG','ISSUE333_W4_PRIVATE_DATADIR')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $resolvedLab = [IO.Path]::GetFullPath($lab)
  $expectedParent = [IO.Path]::GetFullPath($parent) + [IO.Path]::DirectorySeparatorChar
  if (!$resolvedLab.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase) -or
      !$resolvedLab.EndsWith("issue333w4-$runId")) { throw 'Unsafe W4 cleanup target.' }
  if ($childrenClean) { Remove-Item -LiteralPath $resolvedLab -Recurse -Force }
  "OWNED_CLUSTER_DIRECTORY_REMOVED=$(!(Test-Path -LiteralPath $resolvedLab))" | Tee-Object -Append (Join-Path $logs 'cleanup.txt')
  foreach ($name in @('identity','tests','cleanup','source-sha256')) {
    $capture = Join-Path $logs "$name.txt"
    if (Test-Path -LiteralPath $capture) {
      $contents = [IO.File]::ReadAllText($capture)
      [IO.File]::WriteAllText($capture, ($contents.TrimEnd() + "`r`n"), [Text.UTF8Encoding]::new($false))
    }
  }
}
exit $testExit
