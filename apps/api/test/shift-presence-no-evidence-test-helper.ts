import type { Pool } from "pg";
import type { ShiftPresenceMode } from "@valet/contracts";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";

export async function noEvidenceCase(
  db: PresenceServerTestContext,
  action: "START" | "END",
  mode: ShiftPresenceMode = "OFF",
) {
  const f = await db.createFixture();
  const auth = await db.session(f.userId);
  const shift = action === "END" ? await db.start(f, auth.context) : null;
  await db.policy(f, mode);
  const challenge = await db.challenge(f, auth.context, shift?.shiftId, "7");
  const run = (
    pool: Pool = db.runtimePool,
    auditEventIdFactory?: () => string,
  ) =>
    action === "START"
      ? createStartShiftCommandExecutor(pool, {
          ...(auditEventIdFactory === undefined ? {} : { auditEventIdFactory }),
        })({
          authenticatedUserId: f.userId,
          targetLocationId: f.locationId,
          sessionContext: auth.context,
          operationId: challenge.operationId,
        })
      : createEndShiftCommandExecutor(pool, {
          ...(auditEventIdFactory === undefined ? {} : { auditEventIdFactory }),
        })({
          authenticatedUserId: f.userId,
          shiftId: shift!.shiftId,
          cashReported: "7.000",
          sessionContext: auth.context,
          operationId: challenge.operationId,
        });
  const row = async () =>
    (
      await db.adminPool.query(
        `SELECT status,request_fingerprint,request_policy_fingerprint,completion_basis,result_shift_id,result_decision_id
      FROM shift_presence_operations WHERE operation_id=$1`,
        [challenge.operationId],
      )
    ).rows[0];
  return { f, auth, shift, challenge, run, row };
}
