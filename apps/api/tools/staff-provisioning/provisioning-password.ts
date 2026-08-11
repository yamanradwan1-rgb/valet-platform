import { randomBytes } from "node:crypto";

import { staffLoginRequestSchema } from "@valet/contracts";
import argon2 from "argon2";

import { isAcceptedStaffPasswordHash } from "../../src/modules/auth/staff-auth.service";
import { fail } from "./types";

export function passwordFromStdin(value: string, interactive: boolean): string {
  if (interactive) {
    fail("Provide the password through non-interactive standard input.");
  }
  const password = value.endsWith("\r\n")
    ? value.slice(0, -2)
    : value.endsWith("\n")
      ? value.slice(0, -1)
      : value;
  if (/[\r\n]/.test(password)) fail("Password must not contain line breaks.");
  const codePoints = Array.from(password).length;
  if (codePoints < 15 || codePoints > 128) {
    fail("Password must contain between 15 and 128 Unicode code points.");
  }
  if (Buffer.byteLength(password, "utf8") > 1024) {
    fail("Password exceeds the maximum UTF-8 size.");
  }
  return password;
}

export async function readProvisioningPassword(
  interactive: boolean,
  read: () => Promise<string>,
): Promise<string> {
  if (interactive) {
    fail("Provide the password through non-interactive standard input.");
  }
  return passwordFromStdin(await read(), false);
}

export function normalizeProvisioningIdentity(
  email: string,
  password: string,
): { email: string; password: string } {
  const parsed = staffLoginRequestSchema.safeParse({ email, password });
  if (!parsed.success) fail("Invalid staff email or password.");
  return parsed.data;
}

export async function hashProvisioningPassword(
  password: string,
): Promise<string> {
  const passwordHash = await argon2.hash(password, {
    hashLength: 32,
    memoryCost: 65_536,
    parallelism: 4,
    salt: randomBytes(16),
    timeCost: 3,
    type: argon2.argon2id,
    version: 19,
  });
  if (!isAcceptedStaffPasswordHash(passwordHash)) {
    fail("Password hashing failed.");
  }
  return passwordHash;
}
