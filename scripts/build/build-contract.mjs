import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const VERIFICATION_API_ORIGIN = "http://127.0.0.1:3001";

export function buildEnvironment(mode, source = process.env) {
  if (mode === "verification") {
    const environment = { ...source, API_ORIGIN: VERIFICATION_API_ORIGIN };
    delete environment.NEXT_PUBLIC_CUSTOMER_APP_ORIGIN;
    return environment;
  }
  if (mode === "production") return { ...source };
  throw new Error(`Unknown build mode: ${String(mode)}.`);
}

export function turboBuildArguments(extraArguments = []) {
  return ["turbo", "run", "build", "--env-mode=strict", ...extraArguments];
}

export function pnpmCommand(arguments_, environment = process.env) {
  const npmExecPath = environment.npm_execpath;
  if (typeof npmExecPath === "string" && npmExecPath !== "") {
    return {
      args: [npmExecPath, ...arguments_],
      executable: process.execPath,
      shell: false,
    };
  }

  const corepackPnpm = join(
    dirname(process.execPath),
    "node_modules",
    "corepack",
    "dist",
    "pnpm.js",
  );
  if (existsSync(corepackPnpm)) {
    return {
      args: [corepackPnpm, ...arguments_],
      executable: process.execPath,
      shell: false,
    };
  }

  return {
    args: arguments_,
    executable: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    shell: process.platform === "win32",
  };
}
