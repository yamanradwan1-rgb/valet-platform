import type { ParkingCompletionProof } from "@valet/contracts";

import type { ParkingAuditEvidence } from "./operational-history-audit-discovery";

export interface ParkingTaskDispatchEvidence {
  readonly sessionId: string;
  readonly taskId: string;
  readonly status: string;
  readonly taskVersion: number;
  readonly ownerId: string | null;
  readonly dispatchId: string | null;
  readonly actorId: string | null;
  readonly newAssigneeId: string | null;
  readonly previousAssigneeId: string | null;
  readonly reason: string | null;
  readonly occurredAt: Date | null;
}

export interface ParkingHistoryDecision {
  readonly proof: ParkingCompletionProof;
  readonly actorId: string | null;
}

function positiveVersion(value: unknown): value is number {
  // Both canonical Task and ValetSession versions are PostgreSQL INTEGER.
  // Accepting JS-safe values outside int4 makes impossible evidence PROVEN.
  return typeof value === "number" &&
    Number.isInteger(value) && value > 0 && value <= 2147483647;
}

function timestamp(value: unknown): number | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.getTime()
    : null;
}

function matchesCanonicalAudit(
  audit: ParkingAuditEvidence,
  task: ParkingTaskDispatchEvidence,
  sessionId: string,
): boolean {
  const data = audit.metadata;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return false;
  }
  const m = data as Record<string, unknown>;
  return (
    audit.valetSessionId === sessionId &&
    audit.entityType === "VALET_SESSION" &&
    audit.entityId === sessionId &&
    m.taskId === task.taskId &&
    m.fromTaskStatus === "IN_PROGRESS" &&
    m.toTaskStatus === "COMPLETED" &&
    positiveVersion(m.fromTaskVersion) &&
    positiveVersion(m.toTaskVersion) &&
    m.toTaskVersion === m.fromTaskVersion + 1 &&
    m.toTaskVersion === task.taskVersion &&
    m.fromSessionState === "PARKING" &&
    m.toSessionState === "PARKED" &&
    positiveVersion(m.fromSessionVersion) &&
    positiveVersion(m.toSessionVersion) &&
    m.toSessionVersion === m.fromSessionVersion + 1 &&
    audit.actorId !== null &&
    audit.actorId === task.actorId &&
    timestamp(audit.occurredAt) !== null &&
    timestamp(audit.occurredAt) === timestamp(task.occurredAt)
  );
}

/**
 * Fail closed over ALL scoped PARKING Tasks and all discoverable canonical
 * Audits. Never skip an anomalous candidate to choose an older Parker.
 */
export function classifyParkingHistory(
  tasks: readonly ParkingTaskDispatchEvidence[],
  audits: readonly ParkingAuditEvidence[],
  input: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly sessionId: string;
  },
): ParkingHistoryDecision {
  const byTask = new Map<string, ParkingTaskDispatchEvidence[]>();
  for (const row of tasks) {
    const existing = byTask.get(row.taskId) ?? [];
    existing.push(row);
    byTask.set(row.taskId, existing);
  }
  const auditByTask = new Map<string, ParkingAuditEvidence[]>();
  let anomaly = false;
  for (const audit of audits) {
    const data = audit.metadata;
    const taskId =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>).taskId
        : null;
    if (
      audit.organizationId !== input.organizationId ||
      audit.locationId !== input.locationId ||
      audit.valetSessionId !== input.sessionId ||
      audit.entityType !== "VALET_SESSION" ||
      audit.entityId !== input.sessionId ||
      typeof taskId !== "string" ||
      !byTask.has(taskId)
    ) {
      anomaly = true;
      continue;
    }
    const matches = auditByTask.get(taskId) ?? [];
    matches.push(audit);
    auditByTask.set(taskId, matches);
  }
  const completions: { actorId: string; occurredAt: number }[] = [];
  for (const [taskId, rows] of byTask) {
    const task = rows[0]!;
    const events = rows.filter((row) => row.dispatchId !== null);
    const paired = auditByTask.get(taskId) ?? [];
    if (task.status !== "COMPLETED") {
      if (events.length > 0 || paired.length > 0) anomaly = true;
      continue;
    }
    const event = events[0];
    if (
      events.length !== 1 ||
      event === undefined ||
      paired.length !== 1 ||
      !positiveVersion(task.taskVersion) ||
      task.ownerId === null ||
      event.actorId === null ||
      event.actorId !== task.ownerId ||
      event.newAssigneeId !== event.actorId ||
      event.previousAssigneeId !== null ||
      event.reason !== null ||
      timestamp(event.occurredAt) === null ||
      !matchesCanonicalAudit(paired[0]!, event, input.sessionId)
    ) {
      anomaly = true;
      continue;
    }
    completions.push({
      actorId: event.actorId,
      occurredAt: timestamp(event.occurredAt)!,
    });
  }
  if (anomaly) return { proof: "UNVERIFIABLE", actorId: null };
  if (completions.length === 0) return { proof: "NO_RECORD", actorId: null };
  completions.sort((a, b) => b.occurredAt - a.occurredAt);
  if (
    completions.length > 1 &&
    completions[0]!.occurredAt === completions[1]!.occurredAt
  ) {
    return { proof: "UNVERIFIABLE", actorId: null };
  }
  return { proof: "PROVEN", actorId: completions[0]!.actorId };
}
