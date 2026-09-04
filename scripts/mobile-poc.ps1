[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$rootEnvPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot ".env"))
$envCheckPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "mobile-poc-env-check.mjs"))
$apiEntryPath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot "apps/api/dist/main.js"))
$nativeAppRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot "apps/valet-native"))
$expoCliPath = [System.IO.Path]::GetFullPath((Join-Path $nativeAppRoot "node_modules/expo/bin/cli"))
$diagnosticDirectory = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot ".tmp/mobile-poc"))
$apiStdoutLog = Join-Path $diagnosticDirectory "api.stdout.log"
$apiStderrLog = Join-Path $diagnosticDirectory "api.stderr.log"
$metroStdoutLog = Join-Path $diagnosticDirectory "metro.stdout.log"
$metroStderrLog = Join-Path $diagnosticDirectory "metro.stderr.log"
$localApiHealthUri = "http://127.0.0.1:3001/"
$apiProcess = $null
$metroProcess = $null
$apiStartedByHarness = $false
$metroStartedByHarness = $false

. (Join-Path $PSScriptRoot "mobile-poc-support.ps1")

try {
  Set-Location -LiteralPath $repositoryRoot
  $nodeExecutable = Resolve-RequiredCommand -Name "node"
  $corepackExecutable = Resolve-RequiredCommand -Name "corepack"
  & $nodeExecutable $envCheckPath $rootEnvPath
  if ($LASTEXITCODE -ne 0) {
    exit 1
  }
  foreach ($requiredDirectory in @($nativeAppRoot, (Split-Path $apiEntryPath))) {
    if (-not (Test-Path -LiteralPath $requiredDirectory -PathType Container)) {
      throw "Required repository directory is missing."
    }
  }
  & $corepackExecutable pnpm --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm is unavailable through Corepack."
  }

  $lanAddress = Resolve-DefaultRouteLanAddress
  $apiOrigin = "http://${lanAddress}:3001"
  $metroOrigin = "http://${lanAddress}:8081"
  Write-Host "Physical POC LAN IP: $lanAddress"
  Write-Host "API origin: $apiOrigin"
  Write-Host "Metro: $metroOrigin"

  & $corepackExecutable pnpm --filter "@valet/api..." build
  if ($LASTEXITCODE -ne 0) {
    throw "Local API build failed."
  }
  if (-not (Test-Path -LiteralPath $apiEntryPath -PathType Leaf)) {
    throw "Local API build did not produce its entry point."
  }
  if (-not (Test-Path -LiteralPath $expoCliPath -PathType Leaf)) {
    throw "Workspace Expo CLI is unavailable."
  }
  New-Item -ItemType Directory -Path $diagnosticDirectory -Force | Out-Null

  $apiPortOccupied = Test-LocalPortListening -Port 3001
  if (Test-ValetApiReady) {
    $apiOwnership = "external"
  } elseif ($apiPortOccupied) {
    throw "Port 3001 is occupied, but a healthy VAYLET API is not reachable."
  } else {
    $env:NODE_ENV = "development"
    $apiArguments = "--env-file=`"$rootEnvPath`" `"$apiEntryPath`""
    $apiProcess = Start-Process `
      -FilePath $nodeExecutable `
      -ArgumentList $apiArguments `
      -WorkingDirectory $repositoryRoot `
      -RedirectStandardOutput $apiStdoutLog `
      -RedirectStandardError $apiStderrLog `
      -WindowStyle Hidden `
      -PassThru
    $apiStartedByHarness = $true
    Wait-ValetApiReady -Process $apiProcess
    $apiOwnership = "harness"
  }

  if (Test-LocalPortListening -Port 8081) {
    throw "Metro port 8081 is already in use; no process was stopped."
  }
  $env:EXPO_PUBLIC_API_ORIGIN = $apiOrigin
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $lanAddress
  $env:CI = "1"
  $metroArguments = "`"$expoCliPath`" start --dev-client --lan --port 8081"
  $metroProcess = Start-Process `
    -FilePath $nodeExecutable `
    -ArgumentList $metroArguments `
    -WorkingDirectory $nativeAppRoot `
    -RedirectStandardOutput $metroStdoutLog `
    -RedirectStandardError $metroStderrLog `
    -WindowStyle Hidden `
    -PassThru
  $metroStartedByHarness = $true
  Wait-MetroReady -Process $metroProcess

  Write-Host "VAYLET Physical POC ready"
  Write-Host "API: READY ($apiOwnership)"
  Write-Host "API origin: $apiOrigin"
  Write-Host "Metro: READY"
  Write-Host "Development Client URL: $metroOrigin"
  while ($true) {
    $metroProcess.Refresh()
    if ($metroProcess.HasExited) {
      throw "Metro exited (exit code $($metroProcess.ExitCode))."
    }
    Start-Sleep -Seconds 1
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
} finally {
  Stop-HarnessProcess -Process $metroProcess -OwnedByHarness $metroStartedByHarness
  Stop-HarnessProcess -Process $apiProcess -OwnedByHarness $apiStartedByHarness
}
