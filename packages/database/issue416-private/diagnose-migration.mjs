import { inspectFailedMigration, sanitizeDiagnosticLogs } from "./read-only-diagnostics.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--read-only") {
  console.error("Issue416 diagnostic requires --read-only; no migration or recovery commands supported.");
  process.exitCode = 1;
} else {
  try {
    const data = await inspectFailedMigration();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Issue416 read-only diagnostic refused: ${sanitizeDiagnosticLogs(error.message)}`);
    process.exitCode = 1;
  }
}
