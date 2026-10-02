import { staffShiftForceEndReasonSchema } from "@valet/contracts";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectManagementShiftAuditDetails(
  source: Readonly<Record<string, unknown>>,
  eventType: string | undefined,
) {
  const details: Record<string, unknown> = { kind: "SHIFT" };
  for (const key of ["fromStatus", "status", "toStatus"]) {
    if (source[key] === "ACTIVE" || source[key] === "ENDED")
      details[key] = source[key];
  }
  if (eventType === "SHIFT_FORCE_ENDED") {
    if (source.closureKind === "ADMIN_FORCE_END")
      details.closureKind = source.closureKind;
    if (source.cashReconciliationState === "PENDING")
      details.cashReconciliationState = source.cashReconciliationState;
    for (const key of ["targetMembershipId", "operationId"])
      if (typeof source[key] === "string" && uuidPattern.test(source[key]))
        details[key] = source[key];
    const reason = staffShiftForceEndReasonSchema.safeParse(source.reason);
    if (reason.success) details.reason = reason.data;
  }
  return details;
}
