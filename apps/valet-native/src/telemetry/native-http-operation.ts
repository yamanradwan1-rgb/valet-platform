/**
 * Closed path->operation mapper for Native HTTP telemetry (MOB-024A).
 *
 * SAFETY CONTRACT (review Finding #1 — operation correlation):
 * - `request.path` carries ENTITY IDS and may even carry hostile strings.
 *   This mapper reads the path ONLY to SELECT a closed-table literal. No
 *   path substring, segment, or derivative is EVER placed into an event —
 *   the return value is always a member of
 *   `EMPLOYEE_TELEMETRY_OPERATIONS` ("other" as the bounded fallback).
 * - Routing is METHOD + STATIC PATH SEGMENTS ONLY against literal route
 *   templates with a `{id}` placeholder. Dynamic segments are replaced
 *   with that placeholder before lookup, so a real UUID, a poisoned
 *   traversal segment, and an injected query string all collapse onto the
 *   same bounded template (or "other") and are never echoed.
 * - Auth routes (`/v1/staff/auth/**`) are deliberately NOT mapped here:
 *   they are issued by `NativeAuthHttpTransport` with source "auth", whose
 *   classification already identifies the action (login/refresh/logout).
 *   Mapping them would double-attribute the surface, so they return
 *   "other" from THIS mapper (the auth transport itself does not map).
 * - Defense in depth: the selected literal is re-validated with
 *   `isValidEmployeeTelemetryOperation` before being returned; on any
 *   mismatch the bounded fallback "other" is returned instead.
 */
import {
  isValidEmployeeTelemetryOperation,
  type EmployeeTelemetryOperation,
  type EmployeeTransportRequest,
} from "@valet/employee-client";

/**
 * A route template: STATIC literal segments plus `{id}` placeholders where
 * the real route has one dynamic path segment (session/shift/task/incident
 * id). Keys are template literals only — never runtime input.
 */
type OperationRouteTemplate = string;

/**
 * CLOSED route table: `METHOD template` -> operation literal.
 *
 * Every entry mirrors a real production staff route (employee-client
 * transports + native transports + the API controllers that serve them):
 *
 *   GET  /v1/staff/operational-context
 *        -> operational-context (staff-operational-context.controller)
 *   GET  /v1/staff/tasks/queue -> task-queue (dispatch.controller)
 *   POST /v1/staff/tasks/{id}/assign|accept -> task-assign|task-accept
 *   POST /v1/staff/shifts/start -> shift-start
 *   POST /v1/staff/shifts/{id}/end -> shift-end
 *   GET  /v1/staff/shifts/active -> shift-active-lookup
 *   GET  /v1/staff/check-in/continuations -> check-in-continuations
 *   GET  /v1/staff/check-in/drafts -> check-in-drafts
 *   POST /v1/staff/check-in/intakes -> check-in-intake
 *   POST /v1/staff/check-in/vehicle-recognition
 *        -> check-in-vehicle-recognition
 *   POST /v1/staff/check-in/plate-ocr -> check-in-plate-ocr
 *   POST /v1/staff/check-in/sessions/{id}/complete -> check-in-complete
 *   PUT  /v1/staff/check-in/sessions/{id}/vehicle-details
 *        -> check-in-vehicle-details
 *   PUT  /v1/staff/check-in/sessions/{id}/vehicle-identity
 *        -> check-in-vehicle-identity
 *   POST /v1/staff/check-in/sessions/{id}/condition-notes
 *        -> check-in-condition-note
 *   POST /v1/staff/check-in/sessions/{id}/condition-completion
 *        -> check-in-condition-completion
 *   POST /v1/staff/check-in/sessions/{id}/guest-access/issue|revoke
 *        -> guest-access
 *   GET  /v1/staff/valet-sessions/{id} -> valet-session-read
 *   GET  /v1/staff/valet-sessions/directory -> valet-session-read
 *        (the vehicle directory is a session read surface)
 *   POST /v1/staff/valet-sessions/{id}/parking-task/queue
 *        -> parking-queue
 *   POST /v1/staff/valet-sessions/{id}/start-parking -> parking-start
 *   POST /v1/staff/valet-sessions/{id}/confirm-parked -> parking-confirm
 *   POST /v1/staff/valet-sessions/{id}/start-retrieval -> retrieval-start
 *   POST /v1/staff/valet-sessions/{id}/mark-ready -> mark-ready
 *   POST /v1/staff/valet-sessions/{id}/initiate-handoff -> handoff-initiate
 *   POST /v1/staff/valet-sessions/{id}/verify-pickup-code
 *   POST /v1/staff/valet-sessions/{id}/verify-dynamic-qr -> handoff-verify
 *   POST /v1/staff/valet-sessions/{id}/supervisor-override-handoff
 *        -> handoff-override
 *   POST /v1/staff/valet-sessions/{id}/abort-handoff -> handoff-abort
 *   POST /v1/staff/valet-sessions/{id}/complete-handoff
 *        -> release-complete
 *   GET  /v1/staff/valet-sessions/{id}/payment
 *        -> release-payment-status
 *   POST /v1/staff/valet-sessions/{id}/incidents -> incident-report
 *   GET  /v1/staff/valet-sessions/{id}/incidents/{id}/recovery
 *   POST /v1/staff/valet-sessions/{id}/incidents/{id}/recovery-intent
 *   POST /v1/staff/valet-sessions/{id}/incidents/{id}/recovery-intent/retire
 *        -> incident-recovery
 *   PUT  /v1/staff/push/registrations -> push-registration
 */
const OPERATION_ROUTES: Readonly<
  Record<OperationRouteTemplate, EmployeeTelemetryOperation>
> = {
  "GET /v1/staff/operational-context": "operational-context",
  "GET /v1/staff/tasks/queue": "task-queue",
  "POST /v1/staff/tasks/{id}/assign": "task-assign",
  "POST /v1/staff/tasks/{id}/accept": "task-accept",
  "POST /v1/staff/shifts/start": "shift-start",
  "POST /v1/staff/shifts/{id}/end": "shift-end",
  "GET /v1/staff/shifts/active": "shift-active-lookup",
  "GET /v1/staff/check-in/continuations": "check-in-continuations",
  "GET /v1/staff/check-in/drafts": "check-in-drafts",
  "POST /v1/staff/check-in/intakes": "check-in-intake",
  "POST /v1/staff/check-in/vehicle-recognition": "check-in-vehicle-recognition",
  "POST /v1/staff/check-in/plate-ocr": "check-in-plate-ocr",
  "POST /v1/staff/check-in/sessions/{id}/complete": "check-in-complete",
  "PUT /v1/staff/check-in/sessions/{id}/vehicle-details":
    "check-in-vehicle-details",
  "PUT /v1/staff/check-in/sessions/{id}/vehicle-identity":
    "check-in-vehicle-identity",
  "POST /v1/staff/check-in/sessions/{id}/condition-notes":
    "check-in-condition-note",
  "POST /v1/staff/check-in/sessions/{id}/condition-completion":
    "check-in-condition-completion",
  "POST /v1/staff/check-in/sessions/{id}/guest-access/issue": "guest-access",
  "POST /v1/staff/check-in/sessions/{id}/guest-access/revoke": "guest-access",
  "GET /v1/staff/valet-sessions/{id}": "valet-session-read",
  "GET /v1/staff/valet-sessions/directory": "valet-session-read",
  "POST /v1/staff/valet-sessions/{id}/parking-task/queue": "parking-queue",
  "POST /v1/staff/valet-sessions/{id}/start-parking": "parking-start",
  "POST /v1/staff/valet-sessions/{id}/confirm-parked": "parking-confirm",
  "POST /v1/staff/valet-sessions/{id}/start-retrieval": "retrieval-start",
  "POST /v1/staff/valet-sessions/{id}/mark-ready": "mark-ready",
  "POST /v1/staff/valet-sessions/{id}/initiate-handoff": "handoff-initiate",
  "POST /v1/staff/valet-sessions/{id}/verify-pickup-code": "handoff-verify",
  "POST /v1/staff/valet-sessions/{id}/verify-dynamic-qr": "handoff-verify",
  "POST /v1/staff/valet-sessions/{id}/supervisor-override-handoff":
    "handoff-override",
  "POST /v1/staff/valet-sessions/{id}/abort-handoff": "handoff-abort",
  "POST /v1/staff/valet-sessions/{id}/complete-handoff": "release-complete",
  "GET /v1/staff/valet-sessions/{id}/payment": "release-payment-status",
  "POST /v1/staff/valet-sessions/{id}/incidents": "incident-report",
  "GET /v1/staff/valet-sessions/{id}/incidents/{id}/recovery":
    "incident-recovery",
  "POST /v1/staff/valet-sessions/{id}/incidents/{id}/recovery-intent":
    "incident-recovery",
  "POST /v1/staff/valet-sessions/{id}/incidents/{id}/recovery-intent/retire":
    "incident-recovery",
  "PUT /v1/staff/push/registrations": "push-registration",
};

/** Bounded fallback for unmatched routes (documented, never the path). */
const FALLBACK_OPERATION: EmployeeTelemetryOperation = "other";

/** UUID-style segment: hex chunks in the canonical 8-4-4-4-12 layout. */
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when a path segment is a STATIC literal we can route on. Dynamic id
 * segments (UUIDs, opaque ids, numbers) are replaced with `{id}` — so a
 * genuine session id, an injected traversal segment, and a poisoned string
 * all collapse to the same placeholder and nothing is echoed back.
 */
function isStaticSegment(segment: string): boolean {
  // "{id}" never appears in real paths; treat placeholder-looking input as
  // dynamic so it cannot be used to forge a template literal collision.
  if (segment.length === 0 || segment === "{id}") return false;
  if (UUID_SEGMENT_PATTERN.test(segment)) return false;
  return isKnownStaticSegment(segment);
}

/**
 * CLOSED static-segment vocabulary — every literal that can appear in a
 * template. A segment that is not here is dynamic: it gets `{id}`-replaced
 * and CANNOT influence the selected literal (only template position can).
 */
const STATIC_SEGMENTS: ReadonlySet<string> = new Set([
  "accept",
  "active",
  "assign",
  "abort-handoff",
  "check-in",
  "complete",
  "complete-handoff",
  "confirm-parked",
  "condition-completion",
  "condition-notes",
  "continuations",
  "directory",
  "drafts",
  "guest-access",
  "handoff",
  "incidents",
  "initiate-handoff",
  "intakes",
  "issue",
  "mark-ready",
  "operational-context",
  "parking-task",
  "payment",
  "plate-ocr",
  "push",
  "queue",
  "recovery",
  "recovery-intent",
  "registrations",
  "retire",
  "revoke",
  "sessions",
  "shifts",
  "staff",
  "start",
  "start-parking",
  "start-retrieval",
  "supervisor-override-handoff",
  "tasks",
  "end",
  "valet-sessions",
  "vehicle-details",
  "vehicle-identity",
  "vehicle-recognition",
  "verify-dynamic-qr",
  "verify-pickup-code",
  "v1",
]);

function isKnownStaticSegment(segment: string): boolean {
  return STATIC_SEGMENTS.has(segment);
}

/**
 * Reduce a raw request path to a bounded route template: split on "/",
 * replace every non-static segment with `{id}`, and rejoin. Query strings
 * are dropped before splitting. The result contains ONLY known static
 * literals and `{id}` placeholders — never request material.
 */
function templateFor(rawPath: string): string {
  const withoutQuery = rawPath.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter((segment) => segment !== "");
  return `/${segments.map(templateSegment).join("/")}`;
}

function templateSegment(segment: string): string {
  return isStaticSegment(segment) ? segment : "{id}";
}

/**
 * Closed operation literal for a native HTTP request (MOB-024A Finding #1).
 *
 * Returns the bounded "other" literal for anything unmatched — including
 * auth routes (not this surface's job; see the file contract above) and
 * poisoned paths — and NEVER returns or echoes request material.
 */
export function nativeHttpTelemetryOperation(
  request: EmployeeTransportRequest,
): EmployeeTelemetryOperation {
  if (
    request === null ||
    typeof request !== "object" ||
    typeof request.method !== "string" ||
    typeof request.path !== "string"
  ) {
    return FALLBACK_OPERATION;
  }
  const key = `${request.method} ${templateFor(request.path)}`;
  const literal = OPERATION_ROUTES[key];
  if (literal === undefined) {
    return FALLBACK_OPERATION;
  }
  // Defense in depth: the table itself is a closed literal table, but if it
  // is ever hand-edited to hold a value outside the employee-client closed
  // table, fall back to "other" instead of leaking a free string.
  return isValidEmployeeTelemetryOperation(literal)
    ? literal
    : FALLBACK_OPERATION;
}
