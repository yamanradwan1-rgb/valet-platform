import { vi } from "vitest";
import { EmployeeShiftPresenceSession } from "./employee-shift-presence-session";
import { employeeNetworkError } from "./api-error";
import type {
  PresenceChallenge,
  PresenceTarget,
  PresenceTransport,
  PresenceException,
  PresenceRecovery,
  PresenceResult,
  PresenceStore,
} from "./employee-shift-presence-types";

export const presenceIds = {
  location: "11111111-1111-4111-8111-111111111111",
  shift: "22222222-2222-4222-8222-222222222222",
  challenge: "33333333-3333-4333-8333-333333333333",
  exception: "44444444-4444-4444-8444-444444444444",
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function settlePresence() {
  for (let i = 0; i < 15; i += 1) await Promise.resolve();
}
export function presenceFixture(
  mode: PresenceChallenge["presence"]["mode"] = "OFF",
  action: "START" | "END" = "START",
  initialSequence = 0,
) {
  let sequence = initialSequence;
  let authorized = true;
  let online = true;
  const target: PresenceTarget = {
    identityGeneration: 1,
    membershipId: "member",
    organizationId: "org",
    locationId: presenceIds.location,
    action,
    shiftId: action === "END" ? presenceIds.shift : null,
    cashReported: action === "END" ? "1" : null,
  };
  const result = {
    shiftId: presenceIds.shift,
    locationId: presenceIds.location,
    status: action === "START" ? "ACTIVE" : "ENDED",
    startedAt: "2026-10-04T10:00:00Z",
    endedAt: action === "START" ? null : "2026-10-04T11:00:00Z",
    ...(action === "END"
      ? {
          cashReconciliation: {
            currency: "JOD",
            cashReported: "1.000",
            cashExpected: "1.000",
            cashVariance: "0.000",
            reportedAt: "2026-10-04T11:00:00Z",
          },
        }
      : {}),
  } as PresenceResult;
  let operationId = "";
  const challenge = (): PresenceChallenge => ({
    operationId,
    challengeId: presenceIds.challenge,
    action,
    locationId: target.locationId,
    shiftId: target.shiftId,
    issuedAt: "2026-10-04T10:00:00Z",
    expiresAt: "2026-10-04T10:05:00Z",
    presence: { mode, maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
  });
  const exception = (
    status: PresenceException["status"] = "PENDING",
  ): PresenceException => ({
    exceptionId: presenceIds.exception,
    locationId: target.locationId,
    action,
    shiftId: target.shiftId,
    reason: "GPS_UNAVAILABLE",
    status,
    revision: 1,
    requestedAt: "2026-10-04T10:00:00Z",
    expiresAt: "2026-10-04T10:05:00Z",
    reviewedAt: null,
    terminalAt: null,
  });
  const committed = (): Extract<
    PresenceRecovery,
    { state: "RECOVERABLE" }
  > => ({
    state: "RECOVERABLE",
    operationId,
    action,
    status: "COMMITTED",
    shiftId: presenceIds.shift,
    decisionId: null,
    denialReason: null,
    summary: null,
    result: result as PresenceResult,
  });
  const transport = {
    challenge: vi.fn<PresenceTransport["challenge"]>(async (intent) => {
      operationId = intent.operationId;
      return challenge();
    }),
    readChallenge: vi.fn<PresenceTransport["readChallenge"]>(async () =>
      challenge(),
    ),
    submit: vi.fn<PresenceTransport["submit"]>(
      async () => result as PresenceResult,
    ),
    recover: vi.fn<PresenceTransport["recover"]>(async () => committed()),
    requestException: vi.fn<PresenceTransport["requestException"]>(async () =>
      exception(),
    ),
    readException: vi.fn<PresenceTransport["readException"]>(async () =>
      exception("APPROVED"),
    ),
  };
  const acquisition = {
    acquire: vi.fn(async () => ({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      capturedAt: "2026-10-04T10:00:01Z",
    })),
    openSettings: vi.fn(async () => undefined),
  };
  const store = {
    write: vi.fn<PresenceStore["write"]>(async () => undefined),
    delete: vi.fn<PresenceStore["delete"]>(async () => undefined),
  };
  const session = new EmployeeShiftPresenceSession({
    transport: transport as never,
    store,
    acquisition,
    createId: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    isAuthorized: () => authorized,
    isAvailable: () => online,
  });
  return {
    session,
    target,
    transport,
    acquisition,
    store,
    challenge,
    committed,
    exception,
    result,
    fail: employeeNetworkError,
    setOnline: (value: boolean) => {
      online = value;
    },
    revoke: () => {
      authorized = false;
    },
  };
}
