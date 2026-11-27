// Issue 463: exact migration SHA verification on a disposable attested PG17.
// NEVER use a production/staging/shared database or credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

if (process.env.NODE_ENV !== "test" ||
    !/^\d{15,20}$/.test(process.env.ISSUE463_P2_DISPOSABLE_ATTEST ?? "") ||
    !process.env.MIGRATION_DATABASE_URL) {
  throw Error("Issue463 exact scratch migration target attestation required.");
}
const migrationUrl=new URL(process.env.MIGRATION_DATABASE_URL);
if (!["postgresql:","postgres:"].includes(migrationUrl.protocol) ||
    migrationUrl.hostname!=="127.0.0.1" ||
    migrationUrl.pathname!=="/p0463_w2_db" ||
    migrationUrl.username!=="p0463_migrator" ||
    !/^\d{4,5}$/.test(migrationUrl.port)) {
  throw Error("Issue463 ledger must target only local isolated PG fixture");
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const client = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  connectionTimeoutMillis: 5_000, query_timeout: 15_000,
});
try {
  await client.connect();
  const id = (await client.query(
    "SELECT current_database() db,current_user principal,current_setting('server_version_num')::integer ver,system_identifier::text sysid FROM pg_control_system()"
  )).rows[0];
  assert.deepEqual([id.db,id.principal,id.ver,id.sysid],[
    "p0463_w2_db","p0463_migrator",170011,
    process.env.ISSUE463_P2_DISPOSABLE_ATTEST,
  ],"Only W2 synthetic PG17 fixture is allowed");
  const dir = new URL("../prisma/migrations/",import.meta.url);
  const files = (await readdir(dir,{withFileTypes:true}))
    .filter(x=>x.isDirectory() && /^[0-9]{14}_/.test(x.name))
    .map(x=>x.name).sort();
  const rows = (await client.query(
    "SELECT migration_name,checksum,finished_at IS NOT NULL finished,rolled_back_at IS NULL not_rolled_back,applied_steps_count steps FROM _prisma_migrations ORDER BY migration_name"
  )).rows;
  assert.equal(files.length,157);
  assert.equal(rows.length,files.length);
  const mismatch=[];
  for (let i=0;i<files.length;i++){
    const expected=hash(await readFile(new URL(files[i]+"/migration.sql",dir)));
    const actual=rows[i];
    if(actual.migration_name!==files[i] || actual.checksum!==expected ||
       actual.finished!==true || actual.not_rolled_back!==true ||
       actual.steps<1) mismatch.push(files[i]);
  }
  assert.deepEqual(mismatch,[],"Migration history/source mismatched");
  const summary={
    result:"PASS",count:rows.length,
    finalP2Sha256:rows.find(x=>x.migration_name.startsWith("20261127000100_")).checksum,
    finalP5Sha256:rows.find(x=>x.migration_name.startsWith("20261127000200_")).checksum,
    orderedLedgerSha256:hash(rows.map(x=>x.migration_name+"|"+x.checksum).join("\n")),
  };
  console.log(JSON.stringify(summary));
}finally{
  await client.end().catch(()=>{});
}
