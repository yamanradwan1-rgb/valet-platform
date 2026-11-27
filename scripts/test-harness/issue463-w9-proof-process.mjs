import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { clearTimeout, setTimeout } from "node:timers";

/** Launch tools as argv only, with bounded capture and no ambient shell. */
export async function execute(argv, options = {}) {
  const {
    cwd, env, input, timeoutMs = 180_000, maxBytes = 256 * 1024,
  } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd, env, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"],
    });
    const parts = { stdout: [], stderr: [] };
    let length = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    for (const stream of ["stdout", "stderr"]) {
      child[stream].on("data", (chunk) => {
        length += chunk.length;
        if (length > maxBytes) child.kill();
        else parts[stream].push(chunk);
      });
    }
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Process could not start: ${error.code ?? "UNKNOWN"}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code, timedOut, truncated: length > maxBytes,
        stdout: Buffer.concat(parts.stdout).toString("utf8"),
        stderr: Buffer.concat(parts.stderr).toString("utf8"),
      });
    });
    if (input === undefined) child.stdin.end();
    else child.stdin.end(input);
  });
}

export async function checked(argv, options = {}) {
  const result = await execute(argv, options);
  if (result.code !== 0 || result.truncated || result.timedOut)
    throw new Error(
      `Command failed (${result.code}, time=${result.timedOut}, ` +
      `capture=${result.truncated}): ${result.stderr.slice(-2200)} ` +
      result.stdout.slice(-800),
    );
  return result;
}

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
