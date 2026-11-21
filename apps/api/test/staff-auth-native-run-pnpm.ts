import { spawn } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(process.cwd(), "../..");

export async function runPnpm(args: string[], environment: NodeJS.ProcessEnv) {
  const npmExecPath = process.env.npm_execpath;
  const command =
    npmExecPath === undefined
      ? process.platform === "win32"
        ? "pnpm.cmd"
        : "pnpm"
      : process.execPath;
  const commandArgs = npmExecPath === undefined ? args : [npmExecPath, ...args];
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `MOB-007 database setup failed (${String(code)}). ${output}`,
          ),
        );
    });
  });
}
