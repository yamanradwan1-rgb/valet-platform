/** Persisted Session facts only; the caller must separately prove source authority. */
export interface ManagementReadySessionSource {
  readonly sessionId: string;
  readonly state: string;
  readonly readyAt: Date | null;
  readonly handoffPendingAt: Date | null;
}

/** Source phase candidate only; no proven unique READY transition identity. */
export interface ManagementReadyCandidate {
  readonly sourceId: string;
  readonly readyAt: string;
  readonly state: "READY" | "HANDOFF_PENDING";
}

function isPersistedInstant(value: Date | null): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Project an unexposed readiness-phase candidate. Handoff/abort/re-initiation
 * preserve the original READY clock. This cannot issue an alert or serve as a
 * unique episode key: a future READY correction may create another READY entry
 * at the same millisecond. Current mark-ready also stores transaction-start
 * time, potentially before a contended lock, so duration is not yet proven.
 */
export function projectManagementReadyCandidate(
  session: ManagementReadySessionSource,
): ManagementReadyCandidate | null {
  if (!isPersistedInstant(session.readyAt)) return null;
  if (session.state === "READY") {
    if (session.handoffPendingAt !== null) return null;
  } else if (session.state === "HANDOFF_PENDING") {
    if (
      !isPersistedInstant(session.handoffPendingAt) ||
      session.handoffPendingAt.getTime() < session.readyAt.getTime()
    ) {
      return null;
    }
  } else {
    return null;
  }

  const readyAt = session.readyAt.toISOString();
  return {
    sourceId: session.sessionId,
    readyAt,
    state: session.state,
  };
}
