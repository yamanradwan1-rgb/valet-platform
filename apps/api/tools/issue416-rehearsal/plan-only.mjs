import process from "node:process";
import { describeSafeL2Rehearsal, evaluateL2Evidence } from "./cutover-plan.mjs";

// Deliberately never parses database URLs or opens sockets. This executable
// only prints planning status; it cannot be repurposed into production cutover.
if (process.argv.length > 2) {
  process.stderr.write("L2_PLAN_ONLY_NO_ACTION_ARGUMENTS\n");
  process.exitCode = 2;
} else {
  const plan = describeSafeL2Rehearsal();
  const gates = evaluateL2Evidence();
  process.stdout.write(JSON.stringify({ plan, gates }, null, 2) + "\n");
}
