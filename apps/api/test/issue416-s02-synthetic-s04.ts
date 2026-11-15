// Only W33's dedicated local PG17 fixture may emulate the pending W58 helper.
import { readFileSync } from "node:fs";
import { Pool } from "pg";

export async function installSyntheticS04ForS02(url: string): Promise<void> {
  const target = new URL(url);
  if (
    process.env.ISSUE416_S02_PROTECTED_TEST !== "1" ||
    target.hostname !== "127.0.0.1" || target.port !== "45533" ||
    !target.pathname.startsWith("/valet_mob007_auth_") ||
    target.username !== "issue416_w33_s02_owner"
  ) {
    throw new Error("S02 synthetic S04 needs a W33-owned test database.");
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const installed = await pool.query<{ present: boolean }>(
      `SELECT to_regprocedure(
        'public.s04_mfa_success(uuid,text,text)') IS NOT NULL AS present`,
    );
    if (installed.rows[0]?.present) return;
    const fixtureSql = readFileSync(
      new URL("../../../packages/database/issue416-s02-protected/s04-mfa-success-synthetic.sql", import.meta.url),
      "utf8",
    );
    await pool.query(fixtureSql);
  } finally {
    await pool.end();
  }
}
