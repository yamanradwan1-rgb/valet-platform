import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(process.cwd(), "../..");
const systemEnvironment = new Set([
  "path", "pathext", "systemroot", "windir", "temp", "tmp", "userprofile",
  "appdata", "localappdata", "homedrive", "homepath", "pnpm_home", "comspec",
  "processor_architecture", "number_of_processors", "home", "lang",
  "npm_config_store_dir",
]);

function appEnvironment(apiOrigin: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => systemEnvironment.has(name.toLowerCase())));
  return {
    ...env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED: "true",
    API_ORIGIN: apiOrigin,
    HOSTNAME: "127.0.0.1",
  };
}

/** Choose an unused port; verify the spawned process owns it before any fetch. */
export async function unusedIssue463Port(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePort);
  });
  const address = server.address();
  await new Promise<void>((done, reject) => server.close((error) =>
    error ? reject(error) : done()));
  if (!address || typeof address === "string" ||
      [3001, 3002, 3003, 3311, 3312].includes(address.port)) {
    throw new Error("Issue463 could not allocate an independent browser port.");
  }
  return address.port;
}

function awaitBuild(pkg: string, env: NodeJS.ProcessEnv): Promise<void> {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath :
    process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const args = [...(npmExecPath ? [npmExecPath] : []), "--filter", pkg, "build"];
  return new Promise((done, reject) => {
    const child = spawn(command, args, {
      cwd: root, env, windowsHide: true,
      shell: !npmExecPath && process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let tail = "";
    const record = (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-6000); };
    child.stdout?.on("data", record);
    child.stderr?.on("data", record);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) done();
      else reject(new Error("Issue463 production build failed: " + pkg + " exit=" + code + "\n" + tail));
    });
  });
}

function listeningOwner(port: number): number[] {
  // The integrated browser target is intentionally local Windows Docker Desktop.
  const output = execFileSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "Get-NetTCPConnection -State Listen -LocalPort " + port +
      " -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess; exit 0",
  ], { encoding: "utf8", timeout: 8_000, windowsHide: true });
  return output.trim().split(/\s+/).filter(Boolean).map(Number);
}

async function waitForOwnedServer(child: ChildProcess, port: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
      throw new Error("Issue463 owned Next server exited before readiness.");
    }
    const owners = listeningOwner(port);
    if (owners.length > 0) {
      if (owners.some((pid) => pid !== child.pid)) {
        throw new Error("Issue463 browser port occupied by a different process.");
      }
      const response = await fetch("http://127.0.0.1:" + port, {
        redirect: "manual", signal: AbortSignal.timeout(3_000),
      }).catch(() => undefined);
      if (response && response.status < 500) return;
    }
    await delay(250);
  }
  throw new Error("Issue463 owned Next server failed readiness.");
}

async function stopOwned(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((done) => child.once("close", () => done()));
  child.kill();
  await Promise.race([exited, delay(5_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(5_000)]);
  }
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error("Issue463 owned Next process cleanup could not be verified.");
  }
}

async function launch(
  name: "customer" | "dashboard",
  port: number,
  env: NodeJS.ProcessEnv,
): Promise<ChildProcess> {
  if (listeningOwner(port).length !== 0) throw new Error("Issue463 port already occupied.");
  const appRoot = resolve(root, "apps", name);
  const entry = name === "customer"
    ? resolve(appRoot, "scripts/start-production.mjs")
    : resolve(appRoot, ".next/standalone/apps/dashboard/server.js");
  const child = spawn(process.execPath, [entry], {
    cwd: appRoot, env: { ...env, PORT: String(port) },
    stdio: ["ignore", "ignore", "ignore"], windowsHide: true,
  });
  const spawnFailure = new Promise<never>((_, reject) => child.once("error", reject));
  try {
    await Promise.race([waitForOwnedServer(child, port), spawnFailure]);
    return child;
  } catch (error) {
    await stopOwned(child);
    throw error;
  }
}

/** Actual production builds from the exact checked-out test candidate. */
export async function startIssue463BrowserApps(
  proxyOrigin: string, customerPort: number, dashboardPort: number,
) {
  const parsed = new URL(proxyOrigin);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" ||
      parsed.origin !== proxyOrigin || !parsed.port) {
    throw new Error("Issue463 web builds require the attested local proxy.");
  }
  if (customerPort === dashboardPort ||
      [customerPort, dashboardPort].includes(Number(parsed.port))) {
    throw new Error("Issue463 web application ports must be distinct.");
  }
  const env = appEnvironment(proxyOrigin);
  await awaitBuild("@valet/customer", env);
  await awaitBuild("@valet/dashboard", env);
  const buildIds = {
    customer: readFileSync(resolve(root, "apps/customer/.next/BUILD_ID"), "utf8").trim(),
    dashboard: readFileSync(resolve(root, "apps/dashboard/.next/BUILD_ID"), "utf8").trim(),
  };
  if (!buildIds.customer || !buildIds.dashboard) throw new Error("Issue463 build identity missing.");
  const customer = await launch("customer", customerPort, env);
  try {
    const dashboard = await launch("dashboard", dashboardPort, env);
    return {
      customerOrigin: "http://127.0.0.1:" + customerPort,
      dashboardOrigin: "http://127.0.0.1:" + dashboardPort,
      buildIds,
      async close() {
        try { await stopOwned(dashboard); }
        finally { await stopOwned(customer); }
      },
    };
  } catch (error) {
    await stopOwned(customer);
    throw error;
  }
}
