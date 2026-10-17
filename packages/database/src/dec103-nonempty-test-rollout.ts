import { readFile } from "node:fs/promises";

/** Replay the two reviewed operator index statements on a disposable test DB. */
export async function installDec103NonemptyTestIndexes(
  client: { query(sql: string): Promise<unknown> },
): Promise<void> {
  const script = await readFile(
    new URL("../scripts/dec103-online-index-rollout.sql", import.meta.url),
    "utf8",
  );
  const statements = [...script.matchAll(
    /^CREATE INDEX CONCURRENTLY IF NOT EXISTS[\s\S]*?;/gm,
  )].map(([sql]) => sql);
  if (statements.length !== 2)
    throw new Error("DEC-103 approved online index statements changed unexpectedly.");
  // These must be separate top-level queries: CONCURRENTLY rejects transactions.
  for (const sql of statements) await client.query(sql);
}
