import { assertMigrationMode, migrateAttestedIssue416 } from "./prisma-migrations.mjs";

async function main() {
  if (process.argv.length !== 3) throw new Error("Only --apply is supported.");
  assertMigrationMode(process.argv[2]);
  const result = await migrateAttestedIssue416();
  console.log(`Issue416 attested private PG17 migrations finished (exit=${result.exitCode}).`);
}

try {
  await main();
} catch (error) {
  console.error(`Issue416 private migration refused or failed: ${error.message}`);
  process.exitCode = 1;
}
