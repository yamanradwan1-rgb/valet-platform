import console from "node:console";
import process from "node:process";

import { assertRaceMatrix, enumerateTrials } from "./race-matrix.mjs";
import { migrationSourceChecksums } from "./pg17-acceptance-catalog.mjs";
import { domainReadinessReport, assertNotDomainPass } from "./pg17-domain-readiness.mjs";
import { runDormantQuotaControls } from "./pg17-quota-race-controls.mjs";
import {
  runPg17PhysicalLockSmoke, runPg17ReadOnlyPreflight,
} from "./pg17-acceptance-runtime.mjs";

// None of these modes authorizes or claims a 21-case domain execution. The
// original W9 race-runner remains hard-denied. There is no SQL/URL argument.
export async function executeAcceptanceCli(args) {
  assertRaceMatrix();
  if (args.length !== 1) throw new Error("W30_PG17_UNKNOWN_MODE");
  if (args[0] === "--status") {
    const report = domainReadinessReport();
    assertNotDomainPass(report);
    return `BLOCKED_DOMAIN_ACCEPTANCE; ${report.cases.length} named cases; ${report.declared} declared; 0 PG17 domain cases executed`;
  }
  if (args[0] === "--source-check") {
    const sourceCount = migrationSourceChecksums().size;
    return `SOURCE_CHECK_ONLY; ${sourceCount} migrations; ${enumerateTrials().length} declared; 0 domain executed`;
  }
  if (args[0] === "--preflight") {
    const attested = await runPg17ReadOnlyPreflight();
    return `READ_ONLY_PREFLIGHT; ${attested.migrations} committed source-exact migrations; 0 domain executed`;
  }
  if (args[0] === "--smoke") {
    const result = await runPg17PhysicalLockSmoke();
    return `${result.status}; ${result.physicalSmokes} actual physical smokes; 0/210 domain trials`;
  }
  if (args[0] === "--quota-negative") {
    const result = await runDormantQuotaControls();
    return `${result.status}; ${result.controlsExecuted} actual SQL controls; ${result.domainTrialsPassed}/210 domain trials`;
  }
  throw new Error("W30_PG17_DOMAIN_EXECUTION_NOT_BOUND");
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/pg17-acceptance-cli.mjs")) {
  executeAcceptanceCli(process.argv.slice(2))
    .then((result) => console.log(result))
    .catch((error) => {
      const code = typeof error?.message === "string" &&
        /^W30_PG17_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "W30_PG17_PREFLIGHT_OR_SMOKE_FAILED";
      console.error(`W30 PG17 DENIED: ${code}; zero domain cases passed`);
      process.exitCode = 2;
    });
}
