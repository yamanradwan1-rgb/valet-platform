import { createHash, createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(process.cwd(), "../..");

function localMfaKey(purpose: "recovery" | "totp"): string {
  return createHash("sha256").update(`md06-runtime-${purpose}`, "utf8").digest("base64url");
}

function runtimeMfaEnvironment(): Record<string, string> {
  return {
    MFA_RECOVERY_HMAC_SECRET_B64URL:
      process.env.MFA_RECOVERY_HMAC_SECRET_B64URL ?? localMfaKey("recovery"),
    MFA_TOTP_ENCRYPTION_KEY_B64URL:
      process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL ?? localMfaKey("totp"),
  };
}

export const runtimeFixture = {
  organizations: {
    a: { id: "d0600000-0000-4000-8000-000000000001", name: "MD06 Organization A" },
    b: { id: "d0600000-0000-4000-8000-000000000002", name: "MD06 Organization B" },
  },
  locations: {
    a: { id: "d0600000-0000-4000-8000-000000000011", name: "MD06 Garage A" },
    b: { id: "d0600000-0000-4000-8000-000000000012", name: "MD06 Garage B" },
    ungranted: {
      id: "d0600000-0000-4000-8000-000000000013",
      name: "MD06 Ungranted Garage",
    },
    foreign: { id: "d0600000-0000-4000-8000-000000000021", name: "MD06 Foreign Garage" },
  },
  emails: {
    companyAdmin: "md06-ca@valet.test",
    conflictAdmin: "md06-conflict@valet.test",
    exportAdmin: "md06-export@valet.test",
    authorityAdmin: "md06-authority@valet.test",
    locationManager: "md06-lm@valet.test",
    supervisor: "md06-supervisor@valet.test",
    employee: "md06-employee@valet.test",
    disabled: "md06-disabled@valet.test",
    foreignManager: "md06-foreign-lm@valet.test",
    multiAdmin: "md06-multi-ca@valet.test",
  },
  shifts: {
    employee: "d0600000-0000-4000-8000-000000000302",
  },
  preEnrolledSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  contact: {
    displayName: "MD06 Sensitive Contact",
    phone: "+962790000606",
  },
  operations: {
    custody: {
      keySlotCode: "MD06-K1",
      sessionId: "d0600000-0000-4000-8000-000000000601",
    },
    guest: {
      rawToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      sessionId: "d0600000-0000-4000-8000-000000000611",
    },
  },
} as const;

export async function signIn(page: Page, email: string): Promise<string> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes("/v1/staff/auth/login") && response.request().method() === "POST");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(
    process.env.E2E_STAFF_PASSWORD ?? "md06 browser password",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const payload = await (await loginResponse).json() as { accessToken?: string };
  return payload.accessToken ?? "";
}

export async function assurePreEnrolled(
  page: Page,
  offset = 0,
): Promise<void> {
  await expect(page.getByRole("status").filter({ hasText: "MFA status:" }))
    .toContainText("Verification required");
  await page.getByLabel("6-digit authenticator code").fill(
    totp(runtimeFixture.preEnrolledSecret, offset),
  );
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Choose your authorized workspace" }))
    .toBeVisible();
}

export async function selectCompany(
  page: Page,
  organization: { readonly id: string; readonly name: string } =
    runtimeFixture.organizations.a,
): Promise<void> {
  await page.getByRole("button", { name: organization.name }).click();
  await page.getByRole("button", { name: "All Locations" }).click();
}

export async function selectLocation(
  page: Page,
  organizationName: string,
  locationName: string,
): Promise<void> {
  await page.getByRole("button", { name: organizationName }).click();
  await page.getByRole("button", { name: locationName }).click();
}

export async function controlFixture(...args: string[]): Promise<string> {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required for runtime fixture control.");
  const tsxCli = path.join(repositoryRoot, "apps/api/node_modules/tsx/dist/cli.mjs");
  const result = await execFileAsync(
    process.execPath,
    [
      tsxCli,
      path.join(repositoryRoot, "apps/api/tools/e2e/control-management-dashboard-e2e.ts"),
      ...args,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        E2E_FIXTURE_CONFIRM: "management-dashboard-e2e",
        ...runtimeMfaEnvironment(),
        NODE_ENV: "test",
      },
    },
  );
  return result.stdout.trim();
}

export async function resetRuntimeFixture(): Promise<void> {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required for runtime fixture reset.");
  const tsxCli = path.join(repositoryRoot, "apps/api/node_modules/tsx/dist/cli.mjs");
  await execFileAsync(
    process.execPath,
    [
      tsxCli,
      path.join(repositoryRoot, "apps/api/tools/e2e/provision-management-dashboard-e2e.ts"),
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        E2E_FIXTURE_CONFIRM: "management-dashboard-e2e",
        ...runtimeMfaEnvironment(),
        NODE_ENV: "test",
      },
    },
  );
}

export async function browserApiStatus(
  page: Page,
  accessToken: string,
  pathName: string,
): Promise<number> {
  return page.evaluate(async ({ pathName, accessToken }) => {
    const response = await fetch(pathName, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    return response.status;
  }, { pathName, accessToken });
}

export function totp(secret: string, offset = 0): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }
  const step = BigInt(Math.floor(Date.now() / 30_000) + offset);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const position = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, "0");
}
