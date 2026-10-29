import {
  emergencyTakeoverContextResponseSchema,
  type EmergencyTakeoverContextResponse,
  type EmergencyTakeoverRequest,
} from "@valet/contracts";
import { LOCATION_A } from "./dashboard-api-fixture";

export const ISSUE352_IDS = {
  task: "77777777-7777-4777-8777-777777777722",
  session: "77777777-7777-4777-8777-777777777701",
  vehicle: "77777777-7777-4777-8777-777777777702",
  actorA: "55555555-5555-4555-8555-555555555556",
  actorB: "55555555-5555-4555-8555-555555555557",
  slot: "77777777-7777-4777-8777-777777777703",
  event: "77777777-7777-4777-8777-777777777704",
  takeoverEvent: "77777777-7777-4777-8777-777777777705",
} as const;

export const issue352ContextPath = `/v1/staff/tasks/${ISSUE352_IDS.task}/emergency-takeover-context`;
export const issue352TakeoverPath = `/v1/staff/tasks/${ISSUE352_IDS.task}/emergency-takeover`;

const assignedA = {
  membershipId: ISSUE352_IDS.actorA,
  identity: {
    firstName: "Sami",
    lastName: "Retriever",
    email: "sami@example.test",
  },
};
const assignedB = {
  membershipId: ISSUE352_IDS.actorB,
  identity: {
    firstName: "Nora",
    lastName: "Replacement",
    email: "nora.replacement@example.test",
  },
};

export function issue352TakeoverContext(
  afterTakeover = false,
): EmergencyTakeoverContextResponse {
  return emergencyTakeoverContextResponseSchema.parse({
    canInitiate: true,
    task: {
      id: ISSUE352_IDS.task,
      taskType: "RETRIEVAL",
      status: "IN_PROGRESS",
      version: afterTakeover ? 10 : 9,
      assigneeMembershipId: afterTakeover
        ? ISSUE352_IDS.actorB
        : ISSUE352_IDS.actorA,
      sessionId: ISSUE352_IDS.session,
      sessionState: "HANDOFF_PENDING",
    },
    vehicle: {
      id: ISSUE352_IDS.vehicle,
      licensePlate: "JO 12-34567",
      descriptor: null,
    },
    currentAssignee: afterTakeover ? assignedB : assignedA,
    custody: {
      source: "RECORDED",
      latestKeyEventType: "CHECKED_OUT",
      latestKeyEventActorMembershipId: ISSUE352_IDS.actorA,
      occurredAt: "2026-10-29T12:30:00.000Z",
    },
    resources: {
      keySlot: {
        resourceId: ISSUE352_IDS.slot,
        code: "K-12",
        label: "Front Desk",
      },
      parkingSpot: null,
      parkingZone: null,
    },
    eligibleAssignees: [assignedB],
    hasMoreEligibleAssignees: false,
    recentCustodyEvents: [
      {
        eventId: ISSUE352_IDS.event,
        eventType: "CHECKED_OUT",
        actorMembershipId: ISSUE352_IDS.actorA,
        keySlotId: ISSUE352_IDS.slot,
        occurredAt: "2026-10-29T12:30:00.000Z",
      },
    ],
    recentTakeovers: afterTakeover
      ? [
          {
            eventId: ISSUE352_IDS.takeoverEvent,
            actorMembershipId: ISSUE352_IDS.actorA,
            fromAssigneeMembershipId: ISSUE352_IDS.actorA,
            toAssigneeMembershipId: ISSUE352_IDS.actorB,
            occurredAt: "2026-10-29T12:40:00.000Z",
          },
        ]
      : [],
  });
}

export function issue352TakeoverReceipt(request: EmergencyTakeoverRequest) {
  return {
    operationId: request.operationId,
    replayed: false,
    task: {
      id: ISSUE352_IDS.task,
      status: "IN_PROGRESS" as const,
      version: 10,
      assigneeMembershipId: ISSUE352_IDS.actorB,
    },
    sessionVersion: 12,
  };
}

export const issue352LocationId = LOCATION_A.locationId;
