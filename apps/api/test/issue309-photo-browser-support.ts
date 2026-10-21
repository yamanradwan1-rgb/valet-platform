import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";

import argon2 from "argon2";

import { protectTotpSecret } from "../src/modules/auth/mfa/mfa-secret-protection";
import type { Issue215HttpScope } from "./issue215-http-fixture-database";
import type { Issue309PhotoHttpFixture } from "./issue309-photo-http-fixture";

const execute = promisify(execFile);
const dashboardRoot = resolve(__dirname, "../../dashboard");
const requireDashboard = createRequire(resolve(dashboardRoot, "package.json"));
const totpSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export function realChromium() {
  return (requireDashboard("@playwright/test") as {
    // Playwright's generated Browser type is not directly exported from @playwright/test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chromium: { launch(options: { headless: boolean }): Promise<any> };
  }).chromium;
}

export async function unusedLoopbackPort(): Promise<number> {
  const server = createServer();
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No isolated port"));
      server.close((error) => error ? reject(error) : accept(address.port));
    });
  });
}

export async function openRealNext(apiOrigin: string, port: number): Promise<{
  readonly origin: string;
  close(): Promise<void>;
}> {
  const origin = `http://127.0.0.1:${port}`;
  const nextBin = resolve(dashboardRoot, "node_modules/next/dist/bin/next");
  const child: ChildProcess = spawn(process.execPath,
    [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: dashboardRoot,
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: "development", API_ORIGIN: apiOrigin,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + String(chunk)).slice(-2500); });
  const deadline = Date.now() + 90_000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${stderr}`);
      try {
        const res = await fetch(`${origin}/vehicles`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) return { origin, close: () => closeNext(child) };
      } catch { /* Next is still compiling. */ }
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error(`Next readiness timeout: ${stderr}`);
  } catch (error) {
    await closeNext(child);
    throw error;
  }
}

async function closeNext(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      await execute("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true, timeout: 10_000,
      });
    } catch { if (child.exitCode === null) child.kill(); }
  } else child.kill("SIGTERM");
}

export type BrowserRole = "LOCATION_MANAGER" | "ORG_ADMIN" |
  "VALET_SUPERVISOR" | "VALET_EMPLOYEE";

export async function browserActor(
  h: Issue309PhotoHttpFixture,
  scope: Issue215HttpScope,
  role: BrowserRole,
): Promise<{ userId: string; memberId: string; email: string; password: string }> {
  const actor = await h.createViewer(scope);
  const password = `W11-${randomBytes(18).toString("hex")}!`;
  const email = `${actor.userId}@issue309.test.invalid`;
  await h.db.admin.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
    actor.userId, await argon2.hash(password, { type: argon2.argon2id }),
  ]);
  if (role !== "LOCATION_MANAGER") {
    await h.db.admin.query(
      "UPDATE organization_memberships SET role=$2 WHERE id=$1", [actor.memberId, role],
    );
  }
  if (role === "ORG_ADMIN") {
    const factorId = randomUUID();
    const secret = protectTotpSecret(totpSecret, { factorId, userId: actor.userId });
    await h.db.admin.query(
      `INSERT INTO user_mfa_totp_factors
       (id,user_id,state,protected_secret,last_accepted_step,recovery_set_generation,activated_at)
       VALUES($1,$2,'ACTIVE',$3,0,1,clock_timestamp())`,
      [factorId, actor.userId, secret],
    );
  }
  return { userId: actor.userId, memberId: actor.memberId, email, password };
}

export function currentTotp(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of totpSecret) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const key = Buffer.alloc(bits.length / 8);
  for (let i = 0; i < key.length; i++) key[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
