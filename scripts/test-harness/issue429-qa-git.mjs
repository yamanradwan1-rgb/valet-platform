import { execFileSync } from "node:child_process";

/** Git can execute fsmonitor/hooks. Attestation must never inherit QA secrets. */
function safeGitEnvironment() {
  const environment = {};
  for (const key of [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "WINDIR",
    "ComSpec",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
  ]) {
    if (typeof process.env[key] === "string" && process.env[key]) {
      environment[key] = process.env[key];
    }
  }
  // Explicit allowlist excludes credentials, NODE_OPTIONS and GIT_CONFIG_*.
  return {
    ...environment,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
  };
}

export function runIssue429SafeGit(cwd, args, timeout = 4_000) {
  return execFileSync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args],
    {
      cwd,
      env: safeGitEnvironment(),
      encoding: "utf8",
      windowsHide: true,
      timeout,
      stdio: "pipe",
    },
  );
}
