/**
 * Issue #414 Phase 2/3 stage-source release gate, distinct from Phase 1.
 *
 * The Phase 1 Dispatch cutover CANNOT attest to the newer ACCEPTED,
 * IN_PROGRESS, READY and HANDOFF_PENDING stage writer fixes. Operations must
 * first quiesce ALL pre-fix stage writers and their in-flight transactions,
 * then capture the PostgreSQL server clock (millisecond precision), preserve
 * the quiescence/capture evidence, and only then configure the separate
 * MANAGEMENT_ALERTS_PHASE23 stage release gate below. No guessed timestamp,
 * deploy time, Phase 1 fallback, or test-generated value is release evidence.
 */
const stageCutoverEnv = "MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER";

export function parseRetrievalPhaseStageClockCutover(
  value: string | undefined,
): Date {
  if (
    value === undefined ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw new Error("Phase 2/3 stage source-clock cutover is unavailable.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error("Phase 2/3 stage source-clock cutover is invalid.");
  }
  return date;
}

/** Server-only; fail closed when independent stage release evidence is absent. */
export function requireRetrievalPhaseStageClockCutover(): Date {
  return parseRetrievalPhaseStageClockCutover(process.env[stageCutoverEnv]);
}
