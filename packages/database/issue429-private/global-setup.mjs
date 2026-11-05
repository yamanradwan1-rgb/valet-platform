import generalPostgresSetup from "../../../scripts/test-harness/vitest-postgres-global.mjs";
import { preflightIssue429BeforeLease } from "./target-preflight.mjs";

export default async function setup() {
  // Re-attest before the generic harness is even invoked. The private project
  // has a dedicated six-client budget for distinct runtime, administrator,
  // maintenance, operator and adversarial-lock connections. It is excluded
  // from ordinary package discovery and remains bounded by PG17 headroom.
  await preflightIssue429BeforeLease();
  const cleanup = await generalPostgresSetup({
    name: "database-postgres-issue429-ocr",
  });
  process.env.VAYLET_TEST_PROJECT = "database-postgres-issue429-ocr";
  return cleanup;
}
