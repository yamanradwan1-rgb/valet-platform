import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execPath } from "node:process";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const runner = readFileSync(
  resolve(repositoryRoot, "scripts", "mobile-poc.ps1"),
  "utf8",
);
const support = readFileSync(
  resolve(repositoryRoot, "scripts", "mobile-poc-support.ps1"),
  "utf8",
);
const script = `${runner}\n${support}`;
const envCheckPath = resolve(
  repositoryRoot,
  "scripts",
  "mobile-poc-env-check.mjs",
);
const rootManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
);
const foundationShell = readFileSync(
  resolve(
    repositoryRoot,
    "apps",
    "valet-native",
    "src",
    "foundation",
    "foundation-shell.tsx",
  ),
  "utf8",
);

function runEnvironmentCheck(envContents) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "vaylet-mobile-poc-"));
  const envPath = join(temporaryDirectory, ".env");
  writeFileSync(envPath, envContents, "utf8");
  try {
    return spawnSync(execPath, [envCheckPath, envPath], {
      encoding: "utf8",
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

describe("Windows physical POC runner", () => {
  it("keeps the diagnostics panel behind the development presentation boundary", () => {
    expect(foundationShell).toContain("{__DEV__ ? (");
    expect(foundationShell).toContain("<NativePocPanel");
  });

  it("is exposed as the one-command root workflow without rebuilding an APK", () => {
    expect(rootManifest.scripts["mobile:poc"]).toBe(
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mobile-poc.ps1",
    );
    expect(script).toContain("start --dev-client --lan --port 8081");
    expect(script).not.toMatch(/run:android|prebuild|gradlew/i);
  });

  it("launches the API with absolute executable, environment, and entry paths", () => {
    expect(script).toContain(
      '$nodeExecutable = Resolve-RequiredCommand -Name "node"',
    );
    expect(script).toContain("-FilePath $nodeExecutable");
    expect(script).toContain("$rootEnvPath = [System.IO.Path]::GetFullPath(");
    expect(script).toContain("$apiEntryPath = [System.IO.Path]::GetFullPath(");
    expect(script).toContain(
      '$apiArguments = "--env-file=`"$rootEnvPath`" `"$apiEntryPath`""',
    );
    expect(script).toContain("-WorkingDirectory $repositoryRoot");
  });

  it.each([
    ["missing", "API_PORT=3001\n"],
    ["empty", "ANTI_ABUSE_HMAC_SECRET_B64URL=\n"],
    ["malformed", `ANTI_ABUSE_HMAC_SECRET_B64URL=${"+".repeat(43)}\n`],
    [
      "non-canonical round trip",
      `ANTI_ABUSE_HMAC_SECRET_B64URL=${"A".repeat(42)}B\n`,
    ],
    [
      "wrong decoded length",
      `ANTI_ABUSE_HMAC_SECRET_B64URL=${Buffer.alloc(31, 7).toString("base64url")}\n`,
    ],
  ])("rejects a %s anti-abuse secret", (_caseName, envContents) => {
    const result = runEnvironmentCheck(envContents);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Physical POC configuration invalid:");
    expect(result.stderr).toContain(
      "ANTI_ABUSE_HMAC_SECRET_B64URL must be configured in root .env.",
    );
  });

  it("accepts a canonical 32-byte, 43-character anti-abuse secret", () => {
    const secret = Buffer.alloc(32, 7).toString("base64url");
    expect(secret).toHaveLength(43);

    const result = runEnvironmentCheck(
      `ANTI_ABUSE_HMAC_SECRET_B64URL=${secret}\n`,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("runs the root environment preflight before API build or reuse", () => {
    const preflightIndex = runner.indexOf(
      "& $nodeExecutable $envCheckPath $rootEnvPath",
    );

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(
      runner.indexOf(
        '& $corepackExecutable pnpm --filter "@valet/api..." build',
      ),
    );
    expect(preflightIndex).toBeLessThan(
      runner.indexOf("if (Test-ValetApiReady)"),
    );
  });

  it("never includes the supplied secret in validation output", () => {
    const secret = `visible-sentinel-${"x".repeat(30)}`;
    const result = runEnvironmentCheck(
      `ANTI_ABUSE_HMAC_SECRET_B64URL=${secret}\n`,
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
  });

  it("captures sanitized API diagnostics without printing environment contents", () => {
    expect(script).toContain("-RedirectStandardOutput $apiStdoutLog");
    expect(script).toContain("-RedirectStandardError $apiStderrLog");
    expect(script).toContain("Show-ApiDiagnosticTail");
    expect(script).toContain("Protect-DiagnosticLine");
    expect(script).toContain("Get-Content -LiteralPath $Path -Tail 12");
    expect(script).not.toMatch(/Get-Content[^\r\n]*\.env/i);
    expect(script).not.toMatch(/Write-(?:Host|Output)[^\r\n]*(?:\.env|env:)/i);
  });

  it("selects a usable address from the active default route", () => {
    expect(script).toContain(
      'Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0"',
    );
    expect(script).toContain("-InterfaceIndex $route.InterfaceIndex");
    expect(script).toContain("Test-UsableLanAddress");
    expect(script).not.toMatch(
      /Get-NetIP(?:Address|Configuration)[^\r\n|]*\|\s*Select-Object -First/i,
    );
  });

  it("uses localhost readiness while exporting the LAN API origin to Expo", () => {
    expect(script).toContain('$localApiHealthUri = "http://127.0.0.1:3001/"');
    expect(script).toContain("-Uri $localApiHealthUri");
    expect(script).toContain('$apiOrigin = "http://${lanAddress}:3001"');
    expect(script).toContain("$env:EXPO_PUBLIC_API_ORIGIN = $apiOrigin");
    expect(script).toContain("-Method Get");
  });

  it("surfaces child exit immediately and gives a bounded timeout diagnosis", () => {
    const waitApi = script.slice(
      script.indexOf("function Wait-ValetApiReady"),
      script.indexOf("function Wait-MetroReady"),
    );
    expect(waitApi.indexOf("$Process.HasExited")).toBeLessThan(
      waitApi.indexOf("Start-Sleep"),
    );
    expect(waitApi).toContain("exit code $($Process.ExitCode)");
    expect(waitApi).toContain("API process still alive:");
    expect(waitApi).toContain("Local port 3001 listening:");
    expect(waitApi).toContain("Show-ApiDiagnosticTail");
  });

  it("reuses only a healthy external API and cleans up only owned children", () => {
    expect(script).toContain('$apiOwnership = "external"');
    expect(script).toContain("elseif ($apiPortOccupied)");
    expect(script).toContain(
      'throw "Port 3001 is occupied, but a healthy VAYLET API is not reachable."',
    );
    expect(script).toContain("if (-not $OwnedByHarness");
    expect(script).toContain(
      "Stop-HarnessProcess -Process $apiProcess -OwnedByHarness $apiStartedByHarness",
    );
    expect(script).toContain("/PID $Process.Id /T /F");
    expect(script).not.toMatch(/taskkill[^\r\n]*(?:node|postgres)/i);
  });

  it("fails deterministically when Metro port 8081 is occupied", () => {
    expect(script).toContain("Test-LocalPortListening -Port 8081");
    expect(script).toContain(
      'throw "Metro port 8081 is already in use; no process was stopped."',
    );
    expect(script).toContain('$env:CI = "1"');
    expect(script).not.toMatch(/--port\s+(?!8081)\d+/);
    expect(script).toContain(
      'Write-Host "Development Client URL: $metroOrigin"',
    );
    expect(script).not.toContain("expo-development-client/?url=");
  });
});
