import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInRecoverable,
  EmployeeCheckInTransport,
} from "./employee-check-in-types";

export async function loadCheckInRecoverables(
  transport: EmployeeCheckInTransport,
  locationId: string,
): Promise<EmployeeCheckInRecoverable[]> {
  const [drafts, continuations] = await Promise.all([
    transport.loadDrafts(locationId),
    transport.loadContinuations(locationId),
  ]);
  return [
    ...drafts.drafts.map((value) => ({ kind: "DRAFT" as const, value })),
    ...continuations.continuations.map((value) => ({
      kind: "CONTINUATION" as const,
      value,
    })),
  ];
}

export async function hydrateCheckInSession(
  transport: EmployeeCheckInTransport,
  locationId: string,
  sessionId: string,
): Promise<EmployeeCheckInAuthoritativeSession> {
  const detail = await transport.loadSession(sessionId);
  if (
    detail.locationId !== locationId ||
    (detail.state !== "CHECKING_IN" && detail.state !== "AWAITING_PARKING")
  ) {
    throw new Error("The check-in has changed. Refresh to continue.");
  }
  return {
    sessionId: detail.sessionId,
    state: detail.state,
    vehicle: detail.vehicle,
  };
}
