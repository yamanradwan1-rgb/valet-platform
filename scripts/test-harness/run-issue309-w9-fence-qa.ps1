# Isolated restricted PG17+private S3 proof for the W9 two-lease fence.
# Copies the existing #215 ownership attestations and never reuses a fixture.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pgScript = Join-Path $root 'scripts\test-harness\issue215-worker9-pg-fixture.mjs'
$s3Start = Join-Path $root 'scripts\issue215-local-s3\start.mjs'
$s3Stop = Join-Path $root 'scripts\issue215-local-s3\stop.mjs'
$pgManifest = Join-Path $root 'tmp\issue215-worker9-final\pg.runtime.json'
$s3Manifest = Join-Path $root 'scripts\issue215-local-s3\.runtime.json'
foreach ($path in @($pgManifest,$s3Manifest)) {
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    throw 'Owned PostgreSQL/MinIO runtime already exists; refusing takeover.'
  }
}
foreach ($key in @('PGHOST','PGPORT','PGUSER','PGDATABASE','PGOPTIONS','PGSERVICE','PGSSLMODE','PGSERVICEFILE')) {
  if ([Environment]::GetEnvironmentVariable($key,'Process')) {
    throw "Unexpected PostgreSQL override: $key"
  }
}
$pgStarted = $false
$s3Started = $false
$failed = $false
Push-Location $root
try {
  & node $pgScript start
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PG17 startup failed.' }
  $pgStarted = $true
  & node $s3Start
  if ($LASTEXITCODE -ne 0) { throw 'Disposable MinIO startup failed.' }
  $s3Started = $true
  $pg = Get-Content -LiteralPath $pgManifest -Raw | ConvertFrom-Json
  $s3 = Get-Content -LiteralPath $s3Manifest -Raw | ConvertFrom-Json
  $env:NODE_ENV = 'test'
  $env:VAYLET_ISSUE215_TEST_TARGET = 'worker9'
  $env:VAYLET_ISSUE215_WORKER9_RUN_ID = $pg.runId
  $env:VAYLET_TEST_PROJECT = 'api-postgres-issue215'
  $env:VAYLET_TEST_RUN_ID = $pg.runId
  $env:TEST_DATABASE_URL = $pg.databaseUrl
  $env:ISSUE215_REAL_HTTP_ENABLED = 'true'
  $env:ISSUE215_REAL_S3_ENABLED = 'true'
  $env:ISSUE215_S3_ENDPOINT = $s3.endpoint
  $env:ISSUE215_S3_BUCKET = $s3.bucket
  $env:ISSUE215_S3_ACCESS_KEY_ID = $s3.accessKeyId
  $env:ISSUE215_S3_SECRET_ACCESS_KEY = $s3.secretAccessKey
  & pnpm --filter '@valet/api' exec node '../../scripts/test-harness/run-owned-tests.mjs' api vitest.config.mjs 'test/issue309-photo-cross-commit-pg17.integration.test.ts'
  if ($LASTEXITCODE -ne 0) { throw 'PG17+HTTP W9 race proof failed.' }
} catch {
  $failed = $true
  Write-Warning "W9 PG17 proof failed: $_"
} finally {
  if ($s3Started) {
    & node $s3Stop
    if ($LASTEXITCODE -ne 0) { $failed = $true; Write-Warning 'MinIO scoped cleanup failed.' }
  }
  if ($pgStarted) {
    & node $pgScript stop
    if ($LASTEXITCODE -ne 0) { $failed = $true; Write-Warning 'PG17 scoped cleanup failed.' }
  }
  Pop-Location
}
if ($failed) { exit 1 }
Write-Host 'W9 real PG17 + HTTP proof passed; disposable fixtures removed.'
