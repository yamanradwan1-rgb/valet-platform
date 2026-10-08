import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { readCustomerArtifactApiOrigin } from "../../apps/customer/scripts/artifact-origin.mjs";

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

export function validateCustomerRewriteArtifact({
  customerBuildRoot,
  expectedApiOrigin,
}) {
  const manifestPath = join(customerBuildRoot, "routes-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Customer build artifact is missing routes-manifest.json.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rewrites = manifest.rewrites;
  const candidates = Array.isArray(rewrites)
    ? rewrites
    : [
        ...(rewrites?.beforeFiles ?? []),
        ...(rewrites?.afterFiles ?? []),
        ...(rewrites?.fallback ?? []),
      ];
  const matches = candidates.filter(
    (rewrite) => rewrite?.source === "/api/v1/guest/:path*",
  );
  if (matches.length !== 1) {
    throw new Error("Customer artifact must contain exactly one Guest API rewrite.");
  }
  const expected = `${new URL(expectedApiOrigin).origin}/v1/guest/:path*`;
  if (matches[0]?.destination !== expected) {
    throw new Error("Customer Guest API rewrite does not match build-time API_ORIGIN.");
  }
  return matches[0];
}

export function validateCustomerReadinessOriginArtifact({
  customerBuildRoot,
  expectedApiOrigin,
}) {
  const expected = new URL(expectedApiOrigin).origin;
  const standaloneAppRoot = join(customerBuildRoot, "standalone", "apps", "customer");
  if (readCustomerArtifactApiOrigin(standaloneAppRoot) !== expected) {
    throw new Error("Customer readiness origin does not match build-time API_ORIGIN.");
  }
  const needle = Buffer.from(expected, "utf8");
  for (const publicRoot of [
    join(customerBuildRoot, "static"),
    join(customerBuildRoot, "standalone", "apps", "customer", "public"),
  ]) {
    if (!existsSync(publicRoot)) continue;
    for (const filePath of filesRecursively(publicRoot)) {
      if (readFileSync(filePath).includes(needle)) {
        throw new Error("Customer build-time API_ORIGIN leaked into public assets.");
      }
    }
  }
}

function filesRecursively(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

export function validateCustomerStandaloneArtifact(customerBuildRoot) {
  const requiredPaths = [
    "standalone/apps/customer/server.js",
    "standalone/apps/customer/public/sw.js",
    "standalone/apps/customer/.next/static",
  ];
  for (const relativePath of requiredPaths) {
    if (!existsSync(join(customerBuildRoot, ...relativePath.split("/")))) {
      throw new Error(`Customer standalone artifact is missing ${relativePath}.`);
    }
  }
}
