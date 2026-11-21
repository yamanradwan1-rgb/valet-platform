import { randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { Pool } from "pg";

export async function createStaffAuthNativeUser(
  pool: Pool,
  options: { status?: "ACTIVE" | "DISABLED" } = {},
): Promise<{ email: string; id: string; password: string }> {
  const id = randomUUID();
  const email = `${id}@example.com`;
  const password = "MOB-007 exact password";
  const passwordHash = await argon2.hash(password, {
    hashLength: 32,
    memoryCost: 65_536,
    parallelism: 4,
    salt: randomBytes(16),
    timeCost: 3,
    type: argon2.argon2id,
    version: 19,
  });
  await pool.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, $3, $4, transaction_timestamp())`,
    [id, email, passwordHash, options.status ?? "ACTIVE"],
  );
  return { email, id, password };
}
