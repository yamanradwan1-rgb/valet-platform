<#
Runs exactly the Issue #309 HTTP photo acceptance suite and the original #215
real HTTP upload suite against new, disposable, identity-attested PG17 + MinIO.
Run from this W5 worktree after integrating the approved W1/W2 migration commits.

Usage:
  ./scripts/test-harness/run-issue309-private-qa.ps1 `
    -ScopeMigration '2026..._scope...' -DefinerMigration '2026..._definer...'
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ScopeMigration,
  [Parameter(Mandatory = $true)]
  [string] $DefinerMigration,
  [switch] $Browser,
  [switch] $BrowserOnly
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$migrationRoot = Join-Path $repo 'packages\database\prisma\migrations'
$pgFixture = Join-Path $repo 'scripts\test-harness\issue215-worker9-pg-fixture.mjs'
$pgManifest = Join-Path $repo 'tmp\issue215-worker9-final\pg.runtime.json'
$s3Start = Join-Path $repo 'scripts\issue215-local-s3\start.mjs'
$s3Stop = Join-Path $repo 'scripts\issue215-local-s3\stop.mjs'
$s3Manifest = Join-Path $repo 'scripts\issue215-local-s3\.runtime.json'

foreach ($name in @($ScopeMigration, $DefinerMigration)) {
  if ($name -cnotmatch '^\d{14}_[a-z0-9_]+$') {
    throw "Expected an exact migration directory basename: $name"
  }
  if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $migrationRoot $name) 'migration.sql') -PathType Leaf)) {
    throw "Required reviewed migration is missing: $name"
  }
}
if ($ScopeMigration -ceq $DefinerMigration) {
  throw 'W1 and W2 migration directory names must differ.'
}

foreach ($key in @('PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGOPTIONS', 'PGSERVICE', 'PGSSLMODE', 'PGSERVICEFILE')) {
  if ([Environment]::GetEnvironmentVariable($key, 'Process')) {
    throw "Unexpected PostgreSQL override $key; refusing protected test run."
  }
}
if (Test-Path -LiteralPath $pgManifest -PathType Leaf) {
  throw 'W5 PostgreSQL manifest already exists; refusing fixture takeover.'
}
if (Test-Path -LiteralPath $s3Manifest -PathType Leaf) {
  throw 'W5 MinIO manifest already exists; refusing fixture takeover.'
}

function Invoke-Checked([string] $name, [string[]] $commandArgs) {
  & $name @commandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "$name returned exit code $LASTEXITCODE."
  }
}

$pgStarted = $false
$s3Started = $false
$failed = $false
Push-Location $repo
try {
  Invoke-Checked 'node' @($pgFixture, 'start')
  $pgStarted = $true
  Invoke-Checked 'node' @($s3Start)
  $s3Started = $true

  $pg = Get-Content -LiteralPath $pgManifest -Raw | ConvertFrom-Json
  $s3 = Get-Content -LiteralPath $s3Manifest -Raw | ConvertFrom-Json
  if ($pg.runId -cnotmatch '^[a-f0-9]{32}$' -or $s3.runId -cnotmatch '^[a-f0-9]{32}$') {
    throw 'Fixture manifest ownership IDs are invalid.'
  }
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

  $runner = @('--filter', '@valet/api', 'exec', 'node',
    '../../scripts/test-harness/run-owned-tests.mjs', 'api', 'vitest.config.mjs')
  # Prisma on Windows can extract the same schema engine binary during each
  # worker's concurrent migrate deploy. Keep the two real-PG suites sequential
  # so a shared engine rename cannot cause unrelated tests to skip setup.
  $suites = if ($BrowserOnly) { @() } else { @(
    'test/issue309-photo-viewer.integration.test.ts',
    'test/issue309-photo-grant-race.integration.test.ts') }
  foreach ($suite in $suites) {
    Write-Host "Running #309 live suite: $suite"
    try {
      Invoke-Checked 'pnpm' ($runner + @($suite))
    } catch {
      $failed = $true
      Write-Warning "#309 $suite failed: $_"
    }
  }

  if ($Browser -or $BrowserOnly) {
    Write-Host 'Running real Next Dashboard browser + authenticated HTTP private JPEG suite.'
    try {
      Invoke-Checked 'pnpm' ($runner + @('test/issue309-photo-browser.integration.test.ts'))
    } catch {
      $failed = $true
      Write-Warning "#309 real Next browser E2E failed: $_"
    }
  }

  if (-not $BrowserOnly) {
    Write-Host 'Running original #215 6 real upload HTTP regression cases.'
    try {
      Invoke-Checked 'pnpm' ($runner + @('test/issue215-real-http-integration.test.ts'))
    } catch {
      $failed = $true
      Write-Warning "#215 regression failed: $_"
    }
  }
} finally {
  try {
    if ($s3Started) { Invoke-Checked 'node' @($s3Stop) }
  } catch { $failed = $true; Write-Warning "Owned MinIO teardown failed: $_" }
  try {
    if ($pgStarted) { Invoke-Checked 'node' @($pgFixture, 'stop') }
  } catch { $failed = $true; Write-Warning "Owned PG17 teardown failed: $_" }
  Pop-Location
}
if ($failed) { exit 1 }
Write-Host 'Selected protected suites completed; owned fixtures removed.'
