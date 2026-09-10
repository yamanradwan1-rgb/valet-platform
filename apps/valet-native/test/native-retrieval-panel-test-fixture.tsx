import type { EmployeeRetrievalSnapshot } from "@valet/employee-client";
import { vi } from "vitest";

import { NativeRetrievalPanel } from "../src/retrieval/native-retrieval-panel";
import { elements } from "./native-check-in-condition-test-support";

const task = {
  createdAt: "2026-09-07T09:00:00.000Z",
  currentAssigneeMembershipId: "22222222-2222-4222-8222-222222222222",
  parkingSpot: "LC-7",
  parkingZone: "ZONE-LC",
  retrievalRequestedAt: "2026-09-07T09:05:00.000Z",
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "ACCEPTED" as const,
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "RETRIEVAL" as const,
  valetSessionState: "REQUESTED" as const,
  valetSessionVersion: 5,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
  version: 3,
};

export const retrievalSessionFixture = {
  checkIn: { conditionCompletedAt: "2026-09-07T07:59:00.000Z" },
  guestAccess: {
    expiresAt: null,
    revokedAt: null,
    status: "NOT_ISSUED" as const,
  },
  handoff: { pendingAt: null, verification: null },
  keySlot: { code: "K-9" },
  locationId: "11111111-1111-4111-8111-111111111111",
  parking: {
    parkedAt: "2026-09-07T08:10:00.000Z",
    parkingSpotCode: "LC-7",
    parkingStartedAt: "2026-09-07T08:00:00.000Z",
    parkingZoneCode: "ZONE-LC",
  },
  sessionId: task.sessionId,
  state: "REQUESTED" as const,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
    vehicleId: "77777777-7777-4777-8777-777777777777",
    vehicleUpdatedAt: "2026-09-07T07:55:00.000Z",
  },
  version: 5,
};

const scope = {
  locationCode: "AMM-1",
  locationId: retrievalSessionFixture.locationId,
  locationName: "Amman Hotel",
  membershipId: task.currentAssigneeMembershipId,
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE" as const,
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-09-07T07:00:00.000Z",
};

export function retrievalSnapshot(
  phase: EmployeeRetrievalSnapshot["phase"],
  overrides: Partial<EmployeeRetrievalSnapshot> = {},
): EmployeeRetrievalSnapshot {
  const withTask =
    phase === "loading" || phase === "inactive"
      ? null
      : phase === "retrieving" || phase === "submitting-ready"
        ? {
            ...task,
            status: "IN_PROGRESS" as const,
            valetSessionState: "RETRIEVING" as const,
          }
        : phase === "ready"
          ? null
          : task;
  const session =
    phase === "loading" || phase === "inactive"
      ? null
      : phase === "retrieving" || phase === "submitting-ready"
        ? {
            ...retrievalSessionFixture,
            state: "RETRIEVING" as const,
            version: 6,
          }
        : phase === "ready"
          ? { ...retrievalSessionFixture, state: "READY" as const, version: 7 }
          : retrievalSessionFixture;
  return {
    failure: null,
    identityGeneration: 7,
    keyConfirmed: false,
    keySlotCandidate: "",
    phase,
    readyAt: phase === "ready" ? "2026-09-07T09:20:00.000Z" : null,
    retrievalStartedAt: null,
    scope,
    session,
    task: withTask,
    ...overrides,
  };
}

export function renderRetrieval(
  phase: EmployeeRetrievalSnapshot["phase"],
  locale: "en" | "ar" = "en",
  overrides: Partial<EmployeeRetrievalSnapshot> = {},
) {
  const retrieval = {
    checkServerState: vi.fn(),
    confirmKeySlot: vi.fn(() => true),
    enterKeySlot: vi.fn(),
    markReady: vi.fn(),
    startRetrieval: vi.fn(),
  };
  const onBack = vi.fn();
  const nodes = elements(
    NativeRetrievalPanel({
      auth: {} as never,
      locale,
      onBack,
      retrieval: retrieval as never,
      snapshot: retrievalSnapshot(phase, overrides),
    }),
  );
  return { nodes, onBack, retrieval };
}

export function retrievalAction(
  nodes: ReturnType<typeof elements>,
  label: string,
) {
  return nodes.find(
    (node) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel === label &&
      node.props.accessibilityRole === "button",
  );
}
