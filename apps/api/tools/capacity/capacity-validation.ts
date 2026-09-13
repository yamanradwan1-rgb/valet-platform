interface CapacityQueueScope {
  readonly allowedSessionIds: readonly string[];
  readonly sentinelSessionId: string;
}

export function validateCapacityDetail(
  body: unknown,
  locationId: string,
  sessionId: string,
): void {
  if (typeof body !== "object" || body === null)
    throw new Error("Session detail response is not JSON.");
  const detail = body as Record<string, unknown>;
  if (detail.locationId !== locationId || detail.sessionId !== sessionId) {
    throw new Error("Hard-zero failure: cross-scope session detail detected.");
  }
}

export function validateCapacityQueue(
  body: unknown,
  scope: CapacityQueueScope,
  includeSentinel = false,
): boolean {
  if (typeof body !== "object" || body === null)
    throw new Error("Task queue response is not JSON.");
  const tasks = (body as Record<string, unknown>).tasks;
  if (!Array.isArray(tasks))
    throw new Error("Task queue response contract failed.");
  const allowed = new Set(scope.allowedSessionIds);
  if (includeSentinel) allowed.add(scope.sentinelSessionId);
  const sessionIds = tasks.map((task) =>
    typeof task === "object" && task !== null
      ? (task as Record<string, unknown>).sessionId
      : undefined,
  );
  if (sessionIds.some((sessionId) => !allowed.has(String(sessionId)))) {
    throw new Error("Hard-zero failure: cross-scope queue item detected.");
  }
  if (
    scope.allowedSessionIds.some((sessionId) => !sessionIds.includes(sessionId))
  ) {
    throw new Error("Task queue omitted the representative fixture.");
  }
  return !includeSentinel || sessionIds.includes(scope.sentinelSessionId);
}
