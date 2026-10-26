import { validatePresenceResult } from "./employee-shift-presence-result";
import type { ShiftPresenceEvidence } from "@valet/contracts";
import type { PresenceTarget } from "./employee-shift-presence-types";
import {
  assertAvailable,
  assertCurrent,
  persistPresenceDispatch,
  type PresenceAttempt,
  type PresenceWorkflow,
} from "./employee-shift-presence-workflow";

/** Durable marker must precede the first possible protected Shift dispatch. */
export async function dispatchPresenceShift(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
  target: PresenceTarget,
  evidence: ShiftPresenceEvidence | undefined,
) {
  await persistPresenceDispatch(workflow, attempt, "SHIFT_MAY_HAVE_LEFT");
  workflow.publish({ phase: "submitting" });
  attempt.sent = true;
  const sent = workflow.transport.submit(
    target,
    attempt.descriptor.operationId,
    evidence,
  );
  evidence = undefined;
  const result = await sent;
  assertCurrent(workflow, attempt);
  assertAvailable(workflow);
  validatePresenceResult(target, result);
  attempt.terminal = true;
  attempt.result = result;
  await workflow.store.delete();
  assertCurrent(workflow, attempt);
  workflow.publish({ phase: "confirmed", overrideReason: null });
  return result;
}
