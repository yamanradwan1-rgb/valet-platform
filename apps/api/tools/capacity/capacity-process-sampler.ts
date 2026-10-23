import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

export interface ProcessMetricSample {
  readonly oneCpuCapacityUnits: number;
  readonly processCpuUnits: number;
  readonly processIdentity: string;
  readonly rssBytes: number;
}

export interface ProcessMetricSampler {
  sample(pid: number): Promise<ProcessMetricSample>;
}

export function createCapacityProcessSampler(
  platformName: string = process.platform,
): ProcessMetricSampler {
  if (platformName === "linux") return { sample: sampleLinuxProcess };
  if (platformName === "win32") return { sample: sampleWindowsProcess };
  throw new Error(
    `Capacity process sampling is unsupported on platform ${platformName}.`,
  );
}

export async function requireCapacityApiPid(
  raw: string | undefined,
  sampler: ProcessMetricSampler = createCapacityProcessSampler(),
): Promise<number> {
  if (raw === undefined || raw.trim() === "") {
    throw new Error("CAPACITY_API_PID is required.");
  }
  if (!/^\d+$/u.test(raw)) {
    throw new Error("CAPACITY_API_PID must be an integer greater than 1.");
  }
  const pid = Number(raw);
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error("CAPACITY_API_PID must be an integer greater than 1.");
  }
  try {
    await sampler.sample(pid);
  } catch {
    throw new Error("CAPACITY_API_PID does not identify a readable process.");
  }
  return pid;
}

export function parseLinuxProcessSample(
  processStat: string,
  systemStat: string,
  status: string,
  logicalCpuCount: number,
): ProcessMetricSample {
  const close = processStat.lastIndexOf(")");
  if (close < 0) throw new Error("Linux process CPU sample is malformed.");
  const fields = processStat
    .slice(close + 2)
    .trim()
    .split(/\s+/u);
  const userTicks = Number(fields[11]);
  const systemTicks = Number(fields[12]);
  const startTicks = fields[19];
  const cpuFields = systemStat.split("\n", 1)[0]?.trim().split(/\s+/u) ?? [];
  const systemTicksList = cpuFields.slice(1).map(Number);
  const rssKib = Number(/^VmRSS:\s+(\d+)\s+kB$/mu.exec(status)?.[1] ?? NaN);
  if (
    cpuFields[0] !== "cpu" ||
    !Number.isFinite(userTicks) ||
    !Number.isFinite(systemTicks) ||
    userTicks < 0 ||
    systemTicks < 0 ||
    !/^\d+$/u.test(startTicks ?? "") ||
    systemTicksList.length === 0 ||
    systemTicksList.some((value) => !Number.isFinite(value) || value < 0) ||
    !Number.isInteger(logicalCpuCount) ||
    logicalCpuCount < 1 ||
    !Number.isFinite(rssKib) ||
    rssKib < 0
  ) {
    throw new Error("Linux process sample is unavailable.");
  }
  const totalTicks = systemTicksList.reduce((sum, value) => sum + value, 0);
  if (totalTicks <= 0)
    throw new Error("Linux system CPU sample is unavailable.");
  return {
    oneCpuCapacityUnits: totalTicks / logicalCpuCount,
    processCpuUnits: userTicks + systemTicks,
    processIdentity: `linux:${startTicks}`,
    rssBytes: rssKib * 1024,
  };
}

export function parseWindowsProcessSample(
  output: string,
  expectedPid: number,
): ProcessMetricSample {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error("Windows process sample is not valid JSON.");
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Windows process sample is malformed.");
  }
  const row = value as Record<string, unknown>;
  const pid = Number(row.pid);
  const processCpuUnits = Number(row.cpuMs);
  const rssBytes = Number(row.rssBytes);
  const oneCpuCapacityUnits = Number(row.sampleMs);
  const startTimeUtc = row.startTimeUtc;
  if (
    pid !== expectedPid ||
    !Number.isFinite(processCpuUnits) ||
    processCpuUnits < 0 ||
    !Number.isSafeInteger(rssBytes) ||
    rssBytes < 0 ||
    !Number.isFinite(oneCpuCapacityUnits) ||
    oneCpuCapacityUnits <= 0 ||
    typeof startTimeUtc !== "string" ||
    startTimeUtc.length === 0
  ) {
    throw new Error("Windows process sample is malformed.");
  }
  return {
    oneCpuCapacityUnits,
    processCpuUnits,
    processIdentity: `windows:${startTimeUtc}`,
    rssBytes,
  };
}

async function sampleLinuxProcess(pid: number): Promise<ProcessMetricSample> {
  const [processStat, systemStat, status] = await Promise.all([
    readFile(`/proc/${pid}/stat`, "utf8"),
    readFile("/proc/stat", "utf8"),
    readFile(`/proc/${pid}/status`, "utf8"),
  ]);
  return parseLinuxProcessSample(
    processStat,
    systemStat,
    status,
    cpus().length,
  );
}

async function sampleWindowsProcess(pid: number): Promise<ProcessMetricSample> {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$targetPid=[int]$env:VAYLET_CAPACITY_PID",
    "$p=Get-Process -Id $targetPid -ErrorAction Stop",
    "$sampleMs=([System.Diagnostics.Stopwatch]::GetTimestamp()*1000.0)/[System.Diagnostics.Stopwatch]::Frequency",
    "$result=[pscustomobject]@{pid=$p.Id;cpuMs=$p.TotalProcessorTime.TotalMilliseconds;rssBytes=[double]$p.WorkingSet64;sampleMs=$sampleMs;startTimeUtc=$p.StartTime.ToUniversalTime().ToString('o')}",
    "$result | ConvertTo-Json -Compress",
  ].join("; ");
  // A contended Windows runner may time out while starting PowerShell. Retry
  // that transient child timeout once; each child still has its own hard cap.
  // Missing PIDs, malformed output, and all other failures remain fail-closed.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { stdout } = await executeFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        {
          encoding: "utf8",
          env: { ...process.env, VAYLET_CAPACITY_PID: String(pid) },
          maxBuffer: 64 * 1024,
          timeout: 10_000,
          killSignal: "SIGKILL",
          windowsHide: true,
        },
      );
      return parseWindowsProcessSample(stdout, pid);
    } catch (error) {
      const child = error as { killed?: boolean; signal?: string };
      if (attempt > 0 || child.killed !== true || child.signal !== "SIGKILL") {
        throw error;
      }
    }
  }
  throw new Error("Windows process sample is unavailable.");
}
