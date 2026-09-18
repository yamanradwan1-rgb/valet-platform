import { readFileSync } from "node:fs";

export function currentProcessIdentity() {
  return process.platform === "linux"
    ? linuxProcessIdentity(process.pid)
    : undefined;
}

export function linuxProcessIdentity(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    if (close < 0) return undefined;
    const fields = stat
      .slice(close + 2)
      .trim()
      .split(/\s+/);
    const startTicks = fields[19];
    return /^\d+$/.test(startTicks ?? "") ? `linux:${startTicks}` : undefined;
  } catch {
    return undefined;
  }
}
