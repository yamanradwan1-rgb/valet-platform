function Resolve-RequiredCommand {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -eq $command) {
    throw "Required command is unavailable: $Name"
  }
  return [System.IO.Path]::GetFullPath($command.Source)
}

function Test-UsableLanAddress {
  param([Parameter(Mandatory = $true)][string]$Address)

  $parsed = $null
  if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$parsed)) {
    return $false
  }
  $bytes = $parsed.GetAddressBytes()
  return (
    $bytes.Length -eq 4 -and
    $bytes[0] -ne 0 -and
    $bytes[0] -ne 127 -and
    $bytes[0] -lt 224 -and
    -not ($bytes[0] -eq 169 -and $bytes[1] -eq 254)
  )
}

function Resolve-DefaultRouteLanAddress {
  $routes = @(
    Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" |
      Where-Object { $_.State -eq "Alive" }
  )
  if ($routes.Count -eq 0) {
    throw "No active IPv4 default route was found."
  }

  $candidates = foreach ($route in $routes) {
    $networkInterface = Get-NetIPInterface `
      -AddressFamily IPv4 `
      -InterfaceIndex $route.InterfaceIndex `
      -ErrorAction SilentlyContinue |
      Where-Object { $_.ConnectionState -eq "Connected" } |
      Select-Object -First 1
    if ($null -eq $networkInterface) {
      continue
    }
    $addresses = Get-NetIPAddress `
      -AddressFamily IPv4 `
      -InterfaceIndex $route.InterfaceIndex `
      -ErrorAction SilentlyContinue |
      Where-Object {
        -not $_.SkipAsSource -and
        (Test-UsableLanAddress -Address $_.IPAddress)
      }
    foreach ($address in $addresses) {
      [pscustomobject]@{
        Address = $address.IPAddress
        Metric = [int]$route.RouteMetric + [int]$networkInterface.InterfaceMetric
      }
    }
  }

  $selected = $candidates | Sort-Object Metric, Address | Select-Object -First 1
  if ($null -eq $selected) {
    throw "The active IPv4 default route has no usable LAN address."
  }
  return $selected.Address
}

function Test-LocalPortListening {
  param([Parameter(Mandatory = $true)][int]$Port)

  return $null -ne (Get-NetTCPConnection `
      -LocalPort $Port `
      -State Listen `
      -ErrorAction SilentlyContinue |
      Select-Object -First 1)
}

function Test-ValetApiReady {
  try {
    $response = Invoke-WebRequest `
      -Uri $localApiHealthUri `
      -Method Get `
      -TimeoutSec 2 `
      -UseBasicParsing
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
      return $false
    }
    $payload = $response.Content | ConvertFrom-Json
    return $payload.name -eq "valet-api" -and $payload.status -eq "ok"
  } catch {
    return $false
  }
}

function Protect-DiagnosticLine {
  param([Parameter(Mandatory = $true)][string]$Line)

  $safe = $Line -replace '(?i)postgres(?:ql)?://\S+', '[REDACTED DATABASE URL]'
  $safe = $safe -replace '(?i)\bBearer\s+\S+', '[REDACTED AUTH]'
  $safe = $safe -replace '(?i)\b(vsa1|vsr1)\.[A-Za-z0-9_-]+', '[REDACTED TOKEN]'
  $safe = $safe -replace '(?i)\b(DATABASE_URL|PASSWORD|TOKEN|SECRET|AUTHORIZATION|COOKIE)\b\s*[:=]\s*\S+', '[REDACTED SETTING]'
  $safe = $safe -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', '?'
  return $safe.Substring(0, [Math]::Min(500, $safe.Length))
}

function Show-SanitizedLogTail {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$Path
  )

  Write-Host "$Label (sanitized tail):"
  $lines = if (Test-Path -LiteralPath $Path -PathType Leaf) {
    @(Get-Content -LiteralPath $Path -Tail 12 -ErrorAction SilentlyContinue)
  } else {
    @()
  }
  if ($lines.Count -eq 0) {
    Write-Host "  (empty)"
    return
  }
  foreach ($line in $lines) {
    Write-Host "  $(Protect-DiagnosticLine -Line $line)"
  }
}

function Show-ApiDiagnosticTail {
  Show-SanitizedLogTail -Label "API stderr" -Path $apiStderrLog
  Show-SanitizedLogTail -Label "API stdout" -Path $apiStdoutLog
}

function Wait-ValetApiReady {
  param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)

  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $deadline) {
    $Process.Refresh()
    if ($Process.HasExited) {
      $Process.WaitForExit(1000) | Out-Null
      Show-ApiDiagnosticTail
      throw "Local API exited before readiness (exit code $($Process.ExitCode))."
    }
    if (Test-ValetApiReady) {
      return
    }
    Start-Sleep -Milliseconds 300
  }

  $Process.Refresh()
  $stillAlive = -not $Process.HasExited
  $portListening = Test-LocalPortListening -Port 3001
  Write-Host "API process still alive: $($stillAlive.ToString().ToLowerInvariant())"
  Write-Host "Local port 3001 listening: $($portListening.ToString().ToLowerInvariant())"
  Show-ApiDiagnosticTail
  throw "Local API readiness timed out after 30 seconds."
}

function Wait-MetroReady {
  param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)

  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while ([DateTime]::UtcNow -lt $deadline) {
    $Process.Refresh()
    if ($Process.HasExited) {
      $Process.WaitForExit(1000) | Out-Null
      Show-SanitizedLogTail -Label "Metro stderr" -Path $metroStderrLog
      Show-SanitizedLogTail -Label "Metro stdout" -Path $metroStdoutLog
      throw "Metro exited before readiness (exit code $($Process.ExitCode))."
    }
    if (Test-LocalPortListening -Port 8081) {
      return
    }
    Start-Sleep -Milliseconds 300
  }
  Show-SanitizedLogTail -Label "Metro stderr" -Path $metroStderrLog
  Show-SanitizedLogTail -Label "Metro stdout" -Path $metroStdoutLog
  throw "Metro did not listen on port 8081 within 60 seconds."
}

function Stop-HarnessProcess {
  param(
    [System.Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)][bool]$OwnedByHarness
  )

  if (-not $OwnedByHarness -or $null -eq $Process) {
    return
  }
  try {
    $Process.Refresh()
    if (-not $Process.HasExited) {
      & taskkill.exe /PID $Process.Id /T /F *> $null
    }
  } catch {
    # Cleanup is best effort and remains limited to this runner's process tree.
  }
}
