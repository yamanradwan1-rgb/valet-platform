import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { isAcceptedStaffPasswordHash } from "./staff-password-verification";

export async function hashStaffPassword(password: string): Promise<string> {
  const hash = await argon2.hash(password, {
    hashLength: 32,
    memoryCost: 65_536,
    parallelism: 4,
    salt: randomBytes(16),
    timeCost: 3,
    type: argon2.argon2id,
    version: 19,
  });
  if (!isAcceptedStaffPasswordHash(hash))
    throw new Error("Password hashing failed.");
  return hash;
}
