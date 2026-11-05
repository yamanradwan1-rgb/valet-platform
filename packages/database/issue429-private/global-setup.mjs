import generalPostgresSetup from "../../../scripts/test-harness/vitest-postgres-global.mjs";
import { preflightIssue429BeforeLease } from "./target-preflight.mjs";

export default async function setup() {
  // Re-attest before the generic harness is even invoked. The private project
  // uses its existing bounded database-provision resource profile under this
  // local, fixed alias; it is not included in the ordinary package test suite.
  await preflightIssue429BeforeLease();
  const cleanup = await generalPostgresSetup({ name: "database-postgres-provision" });
  process.env.VAYLET_TEST_PROJECT = "database-postgres-issue429-ocr";
  return cleanup;
}
